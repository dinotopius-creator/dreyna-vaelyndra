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
from decimal import Decimal, ROUND_DOWN
from typing import Any, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import update as sa_update
from sqlmodel import Session

from ..auth.dependencies import require_auth
from ..auth.models import Credential
from ..db import get_session
from ..models import CatalogProduct, StripePayment, StripePayout, UserProfile
from ..schemas import (
    StripeConnectLinkOut,
    StripeConnectStatusOut,
    StripePayoutOut,
    UserProfileOut,
)
from .users import _to_out


log = logging.getLogger("vaelyndra.stripe")

router = APIRouter(prefix="/stripe", tags=["stripe"])

SYLVIN_TO_EUR = Decimal("1.99") / Decimal("100")
NET_RATIO = Decimal("0.70")
MIN_PAYOUT_EUR = Decimal("20.00")


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


def _connect_country() -> str:
    return os.environ.get("STRIPE_CONNECT_COUNTRY", "FR").strip().upper() or "FR"


def _net_payout_cents(sylvins: int) -> int:
    if sylvins <= 0:
        return 0
    value = (
        Decimal(sylvins) * SYLVIN_TO_EUR * NET_RATIO * Decimal("100")
    ).quantize(Decimal("1"), rounding=ROUND_DOWN)
    return int(value)


def _status_from_account(account: Any, account_id: str | None) -> StripeConnectStatusOut:
    return StripeConnectStatusOut(
        accountId=account_id,
        onboardingComplete=bool(_sg(account, "details_submitted")),
        payoutsEnabled=bool(_sg(account, "payouts_enabled")),
        detailsSubmitted=bool(_sg(account, "details_submitted")),
    )


def _ensure_connect_account(
    session: Session,
    user: UserProfile,
) -> tuple[UserProfile, str]:
    profile = session.get(UserProfile, user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if profile.stripe_connect_account_id:
        return profile, profile.stripe_connect_account_id

    credential = session.get(Credential, user.id)
    account = stripe.Account.create(
        type="express",
        country=_connect_country(),
        capabilities={"transfers": {"requested": True}},
        business_type="individual",
        email=credential.email if credential else None,
        metadata={"user_id": user.id},
    )
    profile.stripe_connect_account_id = account.id
    profile.updated_at = _now_iso()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile, account.id


def _account_link(account_id: str) -> StripeConnectLinkOut:
    frontend = _frontend_base_url()
    try:
        link = stripe.AccountLink.create(
            account=account_id,
            refresh_url=f"{frontend}/moi?stripe_connect=refresh",
            return_url=f"{frontend}/moi?stripe_connect=return",
            type="account_onboarding",
        )
    except stripe.error.StripeError as exc:
        log.exception("stripe_connect_account_link_failed account=%s", account_id)
        raise HTTPException(
            status_code=502,
            detail=exc.user_message
            or "Impossible de préparer le formulaire Stripe Express.",
        ) from exc
    return StripeConnectLinkOut(url=link.url, accountId=account_id)


@router.get("/connect/status", response_model=StripeConnectStatusOut)
def get_connect_status(
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> StripeConnectStatusOut:
    stripe.api_key = _stripe_secret()
    profile = session.get(UserProfile, user.id)
    if profile is None or not profile.stripe_connect_account_id:
        return StripeConnectStatusOut()

    account = stripe.Account.retrieve(profile.stripe_connect_account_id)
    if _sg(account, "details_submitted") and not profile.stripe_connect_onboarded_at:
        profile.stripe_connect_onboarded_at = _now_iso()
        profile.updated_at = _now_iso()
        session.add(profile)
        session.commit()
        session.refresh(profile)
    return _status_from_account(account, profile.stripe_connect_account_id)


@router.post("/connect/onboarding", response_model=StripeConnectLinkOut)
def create_connect_onboarding_link(
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> StripeConnectLinkOut:
    stripe.api_key = _stripe_secret()
    try:
        _, account_id = _ensure_connect_account(session, user)
    except stripe.error.StripeError as exc:
        log.exception("stripe_connect_account_create_failed user=%s", user.id)
        raise HTTPException(
            status_code=502,
            detail=exc.user_message
            or "Impossible de créer votre compte Stripe Express.",
        ) from exc
    return _account_link(account_id)


@router.post("/connect/dashboard", response_model=StripeConnectLinkOut)
def create_connect_dashboard_link(
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> StripeConnectLinkOut:
    stripe.api_key = _stripe_secret()
    try:
        profile, account_id = _ensure_connect_account(session, user)
        account = stripe.Account.retrieve(account_id)
    except stripe.error.StripeError as exc:
        log.exception("stripe_connect_dashboard_prepare_failed user=%s", user.id)
        raise HTTPException(
            status_code=502,
            detail=exc.user_message
            or "Impossible d'ouvrir votre espace Stripe Express.",
        ) from exc
    if not _sg(account, "details_submitted"):
        return _account_link(account_id)
    try:
        link = stripe.Account.create_login_link(account_id)
    except stripe.error.StripeError:
        log.warning(
            "stripe_connect_login_link_failed_fallback account=%s user=%s",
            account_id,
            user.id,
        )
        return _account_link(account_id)
    if not profile.stripe_connect_onboarded_at:
        profile.stripe_connect_onboarded_at = _now_iso()
        profile.updated_at = _now_iso()
        session.add(profile)
        session.commit()
    return StripeConnectLinkOut(url=link.url, accountId=account_id)


@router.post("/payouts/withdraw", response_model=StripePayoutOut)
def withdraw_streamer_earnings(
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> StripePayoutOut:
    stripe.api_key = _stripe_secret()
    profile, account_id = _ensure_connect_account(session, user)

    account = stripe.Account.retrieve(account_id)
    details_submitted = bool(_sg(account, "details_submitted"))
    payouts_enabled = bool(_sg(account, "payouts_enabled"))
    if not details_submitted or not payouts_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complétez d'abord votre compte Stripe Express pour recevoir des virements.",
        )

    paid = int(profile.earnings_paid or 0)
    if paid <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun revenu retirable disponible.",
        )
    amount_cents = _net_payout_cents(paid)
    if amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Montant trop faible pour un retrait en euros.",
        )
    if Decimal(amount_cents) / Decimal("100") < MIN_PAYOUT_EUR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Seuil de retrait non atteint ({MIN_PAYOUT_EUR} € minimum).",
        )

    try:
        transfer = stripe.Transfer.create(
            amount=amount_cents,
            currency="eur",
            destination=account_id,
            metadata={
                "user_id": profile.id,
                "earnings_paid_sylvins": str(paid),
            },
        )
    except stripe.error.StripeError as exc:  # pragma: no cover - network/rare
        log.exception("stripe_payout_failed user=%s account=%s", profile.id, account_id)
        raise HTTPException(
            status_code=502,
            detail=exc.user_message or "Le retrait Stripe a échoué.",
        ) from exc

    profile.earnings_paid = 0
    profile.updated_at = _now_iso()
    if details_submitted and not profile.stripe_connect_onboarded_at:
        profile.stripe_connect_onboarded_at = _now_iso()
    session.add(profile)
    session.add(
        StripePayout(
            id=transfer.id,
            user_id=profile.id,
            stripe_account_id=account_id,
            earnings_paid_amount=paid,
            amount_cents=amount_cents,
            currency="eur",
            status="paid",
        )
    )
    session.commit()
    session.refresh(profile)

    return StripePayoutOut(
        transferId=transfer.id,
        amountCents=amount_cents,
        earningsPaidConsumed=paid,
        profile=_to_out(profile, session),
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

    # Stripe exige des URLs absolues `https://` pour `product_data.images`.
    # Le catalogue stocke souvent un chemin relatif (`/sylvin-coin-icon.png`),
    # qu'on doit préfixer par le frontend. On laisse passer les URLs déjà
    # absolues telles quelles, et on omet le champ si l'image est vide ou
    # invalide pour ne pas faire échouer le checkout.
    product_images: list[str] = []
    raw_image = (product.image or "").strip()
    if raw_image:
        if raw_image.startswith(("http://", "https://")):
            product_images = [raw_image]
        elif raw_image.startswith("/"):
            product_images = [f"{frontend}{raw_image}"]
        # Sinon (chemin relatif sans slash, data-uri, etc.) on n'envoie rien.

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
                            "images": product_images,
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
