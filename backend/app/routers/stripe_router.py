"""Endpoints Stripe : Checkout Session + webhook de confirmation.

Flux achat de Sylvins :

1. Le client cliquue "Payer" sur un pack `prod-sylvins-*` → appel
   `POST /stripe/checkout/sylvins` avec `{product_id}`.
2. Le backend (authentifié cookie) crée une session Stripe Checkout :
   - `mode="payment"`
   - `line_items` avec `price_data` en centimes (pas de produit Stripe côté
     dashboard à gérer) : `unit_amount=round(price_eur*100)`.
   - `metadata={user_id, product_id, sylvins_amount}` — ces valeurs sont
     attachées à la session Stripe et revenues dans le webhook.
   - `success_url` / `cancel_url` pointent vers le frontend Vaelyndra.
3. Une ligne `StripePayment(status="pending")` est insérée pour qu'on
   puisse plus tard audit tracer la transaction.
4. Le backend retourne `{url}` et le frontend redirige l'utilisateur dessus.
5. Le client paye sur https://checkout.stripe.com/… puis est redirigé
   vers `success_url`.
6. En parallèle, Stripe pingue `POST /stripe/webhook` avec l'événement
   `checkout.session.completed`. On vérifie la signature, on retrouve la
   ligne `StripePayment` par son id, on crédite `user.sylvins_paid` et on
   passe le status à `"paid"`. Idempotent : si le status est déjà `"paid"`,
   on ne re-crédite pas.

Sécurité :
- La valeur de `sylvins_amount` est **recalculée côté backend** à partir
  du `CatalogProduct`, jamais prise depuis le frontend. Impossible pour un
  client malveillant de demander un produit à 1€ et recevoir 10 000 Sylvins.
- La signature du webhook est vérifiée avec `STRIPE_WEBHOOK_SECRET` → on
  refuse tout appel non signé par Stripe.
- `metadata.user_id` doit correspondre à la session authentifiée au moment
  du checkout ; on re-valide côté webhook en tombant back sur la ligne
  `StripePayment` (source de vérité côté backend, pas les metadata Stripe).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import update as sa_update
from sqlmodel import Session

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import CatalogProduct, StripePayment, UserProfile


log = logging.getLogger("vaelyndra.stripe")

router = APIRouter(prefix="/stripe", tags=["stripe"])


def _session_dep():
    with get_session() as session:
        yield session


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stripe_secret() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Paiements Stripe non configurés côté serveur.",
        )
    return key


def _frontend_base_url() -> str:
    """URL publique du frontend Vaelyndra pour `success_url`/`cancel_url`.

    Configurable via `VAELYNDRA_FRONTEND_URL`, fallback sur la prod.
    """
    return os.environ.get("VAELYNDRA_FRONTEND_URL", "https://www.vaelyndra.com").rstrip(
        "/"
    )


class CheckoutSylvinsIn(BaseModel):
    product_id: str


class CheckoutSylvinsOut(BaseModel):
    url: str
    session_id: str


@router.post("/checkout/sylvins", response_model=CheckoutSylvinsOut)
def create_sylvins_checkout(
    payload: CheckoutSylvinsIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> CheckoutSylvinsOut:
    """Crée une session Stripe Checkout pour un pack de Sylvins."""
    stripe.api_key = _stripe_secret()

    product = session.get(CatalogProduct, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    if product.category != "Sylvins":
        raise HTTPException(
            status_code=400,
            detail="Seuls les packs de Sylvins sont encaissables via Stripe.",
        )
    if not product.sylvins or product.sylvins <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ce produit ne déclare aucun montant de Sylvins à créditer.",
        )
    if product.price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ce produit n'a pas de prix en €.",
        )

    amount_cents = round(product.price * 100)
    frontend = _frontend_base_url()

    try:
        checkout = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "unit_amount": amount_cents,
                        "product_data": {
                            "name": product.name,
                            "description": (
                                f"{product.sylvins} Sylvins crédités sur ton "
                                f"compte Vaelyndra."
                            ),
                            "images": [product.image] if product.image else [],
                        },
                    },
                    "quantity": 1,
                }
            ],
            success_url=(
                f"{frontend}/moi?payment=success"
                "&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{frontend}/panier?payment=cancelled",
            metadata={
                "user_id": user.id,
                "product_id": product.id,
                "sylvins_amount": str(product.sylvins),
            },
            customer_email=None,  # laissé vide : Stripe demande au moment du paiement
        )
    except stripe.error.StripeError as exc:  # pragma: no cover - network/rare
        log.exception("stripe_checkout_create_failed user=%s product=%s", user.id, product.id)
        raise HTTPException(
            status_code=502, detail=f"Erreur Stripe : {exc.user_message or str(exc)}"
        ) from exc

    # Trace la session pour l'idempotence du webhook.
    session.add(
        StripePayment(
            id=checkout.id,
            user_id=user.id,
            product_id=product.id,
            sylvins_amount=product.sylvins,
            amount_cents=amount_cents,
            currency="eur",
            status="pending",
        )
    )
    session.commit()

    log.info(
        "stripe_checkout_created user=%s product=%s session=%s amount_cents=%s",
        user.id,
        product.id,
        checkout.id,
        amount_cents,
    )

    return CheckoutSylvinsOut(url=checkout.url, session_id=checkout.id)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, session: Session = Depends(_session_dep)):
    """Webhook Stripe. Vérifie la signature, puis applique le crédit.

    Configuration côté Stripe Dashboard :
    `https://api.vaelyndra.com/stripe/webhook` → évènement
    `checkout.session.completed` (suffisant pour l'instant).
    """
    stripe.api_key = _stripe_secret()
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        # On refuse en prod plutôt que d'accepter un webhook non signé.
        raise HTTPException(
            status_code=503,
            detail="Webhook Stripe non configuré (STRIPE_WEBHOOK_SECRET manquant).",
        )

    raw_body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(
            payload=raw_body, sig_header=sig_header, secret=webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload invalide.")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Signature Stripe invalide.")

    # stripe-python renvoie un `stripe.Event` (subclass de `StripeObject`) qui
    # supporte l'accès par index (`event["type"]`) et l'accès par attribut
    # (`event.type`) mais **pas** `.get()`. On utilise `_sg()` pour normaliser
    # l'accès et retourner `None` si la clé manque.
    event_type = _sg(event, "type")
    data_section = _sg(event, "data") or {}
    data_object = _sg(data_section, "object") or {}

    if event_type == "checkout.session.completed":
        checkout_id = _sg(data_object, "id")
        if not checkout_id:
            log.warning(
                "stripe_webhook_missing_session_id event=%s", _sg(event, "id")
            )
            return {"received": True}
        _apply_paid_checkout(session, checkout_id, data_object)
    elif event_type == "checkout.session.async_payment_failed":
        checkout_id = _sg(data_object, "id")
        if checkout_id:
            record = session.get(StripePayment, checkout_id)
            if record is not None and record.status == "pending":
                record.status = "failed"
                session.add(record)
                session.commit()
    else:
        # Évènements non gérés (refund, payment_intent.*, etc.). On log mais
        # on renvoie 200 pour ne pas faire retry Stripe.
        log.info("stripe_webhook_ignored_event type=%s", event_type)

    return {"received": True}


def _sg(obj: Any, key: str) -> Any:
    """Accès tolérant dict / `stripe.StripeObject`.

    `stripe.StripeObject` (et `stripe.Event`) ne possède pas `.get()`.
    On supporte : `None`, `dict`, et `StripeObject` (accès par index,
    avec `in` pour éviter `KeyError`).
    """
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    try:
        # StripeObject : supporte `key in obj` et `obj[key]`.
        return obj[key] if key in obj else None
    except (KeyError, TypeError, AttributeError):
        return getattr(obj, key, None)


def _apply_paid_checkout(
    session: Session, checkout_id: str, stripe_object: Any
) -> None:
    """Crédite les Sylvins correspondants à une session Stripe payée.

    `stripe_object` est typé `Any` car Stripe renvoie un `StripeObject`
    (pas un `dict`) qui n'a pas `.get()` ; on passe par `_sg()`.

    Pour éviter un double-crédit en cas de livraison concurrente du
    même webhook (Stripe retry pendant un hiccup réseau, ou simple
    retry côté Stripe), on utilise un compare-and-swap atomique sur le
    statut `pending` → `paid` via un `UPDATE ... WHERE status='pending'`.
    Seule la première transaction qui modifie la ligne obtient
    `rowcount == 1` et peut procéder au crédit ; les autres voient
    `rowcount == 0` et sortent sans rien faire. C'est nettement plus
    sûr qu'un pattern read-check-write qui est vulnérable au TOCTOU.
    """
    # 1. Anti-spoof : on ne considère la session que si Stripe nous
    #    dit qu'elle est bien payée. Check fait AVANT la transition
    #    atomique pour ne pas figer la ligne en "paid" sur un event
    #    non-paiement.
    payment_status = _sg(stripe_object, "payment_status")
    if payment_status != "paid":
        log.info(
            "stripe_webhook_not_paid session_id=%s payment_status=%s",
            checkout_id,
            payment_status,
        )
        return

    # 2. Transition atomique pending → paid. Sur Postgres, l'UPDATE
    #    prend un verrou ligne ; deux webhooks concurrents se
    #    sérialisent et seul le premier voit `rowcount == 1`. Sur
    #    SQLite, le global write lock donne le même comportement.
    now = _now_iso()
    result = session.exec(
        sa_update(StripePayment)
        .where(
            StripePayment.id == checkout_id,
            StripePayment.status == "pending",
        )
        .values(status="paid", completed_at=now)
    )
    # SQLAlchemy < 2 : session.exec retourne un `CursorResult`. Son
    # attribut `.rowcount` est fiable pour un UPDATE simple.
    rowcount = getattr(result, "rowcount", 0) or 0
    if rowcount == 0:
        # Soit la ligne n'existe pas (session créée hors de notre
        # endpoint create_sylvins_checkout — on ne crédite rien dans
        # ce cas, anti-spoof), soit elle a déjà été passée en "paid"
        # ou "failed" par un autre webhook concurrent (idempotence).
        existing: Optional[StripePayment] = session.get(
            StripePayment, checkout_id
        )
        if existing is None:
            log.warning(
                "stripe_webhook_unknown_session session_id=%s payment_status=%s",
                checkout_id,
                payment_status,
            )
        else:
            log.info(
                "stripe_webhook_duplicate session_id=%s status=%s",
                checkout_id,
                existing.status,
            )
        # Libère la transaction du flush en attente côté session.
        session.commit()
        return

    # 3. On a gagné la course CAS : on peut créditer sans risque
    #    de doublon. On recharge la ligne pour connaître le
    #    montant et l'utilisateur associés.
    #
    #    Important : on ne commit PAS encore. Si on committait ici puis
    #    qu'un crash survient avant le commit final (ligne 369), la ligne
    #    `StripePayment` resterait en `paid` mais les Sylvins ne seraient
    #    jamais crédités → la CAS suivante verrait `rowcount == 0` et
    #    sortirait via la branche idempotence : crédit perdu.
    #    En gardant un seul commit à la fin, l'UPDATE de status et
    #    l'incrément des Sylvins partent dans la même transaction. Les
    #    `session.get()` ci-dessous voient l'UPDATE non encore committé
    #    via les sémantiques read-your-own-writes (Postgres + SQLite).
    record: Optional[StripePayment] = session.get(StripePayment, checkout_id)
    if record is None:
        # Très improbable (on vient de l'updater) mais on reste safe.
        # Important : on lève une 5xx pour que Stripe retente le webhook.
        # Si on faisait juste `return`, FastAPI renverrait 200, le
        # cleanup de `_session_dep` rollback la transition CAS → paid,
        # et on aurait débité le client sans jamais le créditer ni
        # avoir de retry pour rattraper.
        log.error(
            "stripe_webhook_post_cas_missing session_id=%s", checkout_id
        )
        raise HTTPException(
            status_code=500,
            detail="StripePayment introuvable après CAS — retry attendu.",
        )

    profile = session.get(UserProfile, record.user_id)
    if profile is None:
        # Idem : 5xx pour que Stripe retente. Sans ça, le client est
        # débité, la CAS est rollbackée par le cleanup de session, et
        # on n'a aucun moyen automatique de récupérer le crédit.
        log.error(
            "stripe_webhook_missing_user session_id=%s user_id=%s",
            checkout_id,
            record.user_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Profil utilisateur introuvable — retry attendu.",
        )

    # Incrément atomique côté SQL pour éviter la lost-update race :
    # si deux webhooks pour le même utilisateur (packs différents)
    # arrivent en parallèle, un read-modify-write Python ferait perdre
    # un des crédits. En passant par l'expression de colonne SQLAlchemy
    # (`UserProfile.sylvins_paid + N`), le SQL généré est
    # `SET sylvins_paid = sylvins_paid + N`, qui est atomique côté DB.
    profile.sylvins_paid = UserProfile.sylvins_paid + record.sylvins_amount
    profile.updated_at = _now_iso()
    session.add(profile)
    session.commit()

    log.info(
        "stripe_credited user=%s session=%s sylvins=%s",
        profile.id,
        checkout_id,
        record.sylvins_amount,
    )
