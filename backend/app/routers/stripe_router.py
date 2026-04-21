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
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
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
                f"{frontend}/compte?payment=success"
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

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {}) or {}

    if event_type == "checkout.session.completed":
        checkout_id = data_object.get("id")
        if not checkout_id:
            log.warning("stripe_webhook_missing_session_id event=%s", event.get("id"))
            return {"received": True}
        _apply_paid_checkout(session, checkout_id, data_object)
    elif event_type == "checkout.session.async_payment_failed":
        checkout_id = data_object.get("id")
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


def _apply_paid_checkout(
    session: Session, checkout_id: str, stripe_object: dict
) -> None:
    """Crédite les Sylvins correspondants à une session Stripe payée."""
    record: Optional[StripePayment] = session.get(StripePayment, checkout_id)
    if record is None:
        # La session a été créée côté Stripe mais pas via notre endpoint
        # `create_sylvins_checkout` (ex. test manuel dans le dashboard).
        # On logge et on ignore plutôt que de créditer sur la base des
        # `metadata` seules (anti-spoof : les metadata sont libres, on ne
        # leur fait pas confiance si on n'a aucune trace côté backend).
        log.warning(
            "stripe_webhook_unknown_session session_id=%s payment_status=%s",
            checkout_id,
            stripe_object.get("payment_status"),
        )
        return

    if record.status == "paid":
        # Webhook rejoué par Stripe : idempotence.
        log.info("stripe_webhook_duplicate session_id=%s", checkout_id)
        return

    payment_status = stripe_object.get("payment_status")
    if payment_status != "paid":
        log.info(
            "stripe_webhook_not_paid session_id=%s payment_status=%s",
            checkout_id,
            payment_status,
        )
        return

    profile = session.get(UserProfile, record.user_id)
    if profile is None:
        log.error(
            "stripe_webhook_missing_user session_id=%s user_id=%s",
            checkout_id,
            record.user_id,
        )
        # On marque quand même comme "paid" pour qu'un admin puisse reconstituer.
        record.status = "paid"
        record.completed_at = _now_iso()
        session.add(record)
        session.commit()
        return

    profile.sylvins_paid = (profile.sylvins_paid or 0) + record.sylvins_amount
    profile.updated_at = _now_iso()
    record.status = "paid"
    record.completed_at = _now_iso()
    session.add(profile)
    session.add(record)
    session.commit()

    log.info(
        "stripe_credited user=%s session=%s sylvins=%s",
        profile.id,
        checkout_id,
        record.sylvins_amount,
    )
