"""Endpoints REST pour les profils utilisateurs (avatar, inventaire, bourses)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import UserProfile
from ..schemas import (
    AvatarUpdate,
    DailyClaimOut,
    GiftTransfer,
    GiftTransferOut,
    InventoryUpdate,
    UserProfileOut,
    UserProfileUpsert,
    WalletDelta,
)


router = APIRouter(prefix="/users", tags=["users"])


# Récompense quotidienne : 50 Lueurs / jour (cooldown 20 h pour lisser l'heure
# de connexion — comme la plupart des jeux mobiles).
DAILY_REWARD_LUEURS = 50
DAILY_COOLDOWN = timedelta(hours=20)


def _session_dep():
    with get_session() as session:
        yield session


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_out(p: UserProfile) -> UserProfileOut:
    # Pour un client à jour, on expose les 4 sous-pots explicites. Les
    # champs legacy `sylvins` / `sylvinsEarnings` retournent la somme
    # paid+promo pour les clients qui ne savent pas encore lire le split.
    # (Avant PR 5, la colonne `sylvins` stockait tout ; depuis, elle ne
    # stocke plus que le PROMO. On préserve la sémantique "solde total" côté
    # DTO pour rester rétro-compatible.)
    return UserProfileOut(
        id=p.id,
        username=p.username,
        avatarImageUrl=p.avatar_image_url,
        avatarUrl=p.avatar_url,
        inventory=json.loads(p.inventory_json or "[]"),
        equipped=json.loads(p.equipped_json or "{}"),
        lueurs=p.lueurs,
        sylvins=p.sylvins + p.sylvins_paid,
        sylvinsEarnings=p.sylvins_earnings + p.earnings_paid,
        sylvinsPaid=p.sylvins_paid,
        sylvinsPromo=p.sylvins,
        earningsPaid=p.earnings_paid,
        earningsPromo=p.sylvins_earnings,
        lastDailyAt=p.last_daily_at,
        createdAt=p.created_at,
        updatedAt=p.updated_at,
    )


def _touch(p: UserProfile) -> None:
    p.updated_at = _now().isoformat()


@router.get("", response_model=List[UserProfileOut])
def list_users(session: Session = Depends(_session_dep)) -> List[UserProfileOut]:
    rows = session.exec(select(UserProfile)).all()
    return [_to_out(p) for p in rows]


@router.get("/{user_id}", response_model=UserProfileOut)
def get_user(
    user_id: str, session: Session = Depends(_session_dep)
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    return _to_out(p)


@router.post("", response_model=UserProfileOut)
def upsert_user(
    payload: UserProfileUpsert, session: Session = Depends(_session_dep)
) -> UserProfileOut:
    """Crée le profil si absent, sinon rafraîchit juste le pseudo/avatar image.

    Appelé automatiquement par le front à la connexion pour garantir qu'un
    profil existe en base pour chaque utilisateur actif.
    """
    p = session.get(UserProfile, payload.id)
    if p is None:
        p = UserProfile(
            id=payload.id,
            username=payload.username,
            avatar_image_url=payload.avatar_image_url,
        )
        session.add(p)
    else:
        p.username = payload.username
        # On ne remplace l'avatar_image_url que s'il n'en avait pas (pour ne
        # pas écraser un rendu RPM déjà généré par l'utilisateur).
        if not p.avatar_image_url:
            p.avatar_image_url = payload.avatar_image_url
        _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


@router.patch("/{user_id}/avatar", response_model=UserProfileOut)
def update_avatar(
    user_id: str,
    payload: AvatarUpdate,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if payload.avatar_url is not None:
        p.avatar_url = payload.avatar_url or None
    if payload.avatar_image_url is not None:
        p.avatar_image_url = payload.avatar_image_url
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


@router.patch("/{user_id}/inventory", response_model=UserProfileOut)
def update_inventory(
    user_id: str,
    payload: InventoryUpdate,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if payload.inventory is not None:
        # On déduplique tout en gardant l'ordre d'insertion.
        seen: dict[str, None] = {}
        for item_id in payload.inventory:
            if item_id and item_id not in seen:
                seen[item_id] = None
        p.inventory_json = json.dumps(list(seen.keys()))
    if payload.equipped is not None:
        # Sécurise : ne peut équiper qu'un item présent dans l'inventaire.
        owned = set(json.loads(p.inventory_json or "[]"))
        cleaned = {
            slot: item_id
            for slot, item_id in payload.equipped.items()
            if item_id in owned
        }
        p.equipped_json = json.dumps(cleaned)
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


def _apply_legacy_sylvins_delta(p: UserProfile, delta: int) -> None:
    """Route un delta sur le champ legacy `sylvins` vers les deux pots.

    - Crédit (`delta > 0`) → tombe dans le pot PROMO. (Un crédit "payé" doit
      passer explicitement par `sylvins_paid` — typiquement depuis le
      webhook Stripe — pour éviter qu'un client bugué gonfle le pot
      retirable.)
    - Débit (`delta < 0`) → consomme le pot PROMO d'abord, déborde sur PAID
      si nécessaire. Le pot PROMO est "spend-first" : on veut préserver le
      pot retirable tant que possible.
    """
    if delta >= 0:
        p.sylvins += delta
        return
    remaining = -delta
    take_promo = min(remaining, p.sylvins)
    p.sylvins -= take_promo
    remaining -= take_promo
    if remaining > 0:
        p.sylvins_paid -= remaining


def _apply_legacy_earnings_delta(p: UserProfile, delta: int) -> None:
    """Comme `_apply_legacy_sylvins_delta` mais pour le pot recettes."""
    if delta >= 0:
        p.sylvins_earnings += delta
        return
    remaining = -delta
    take_promo = min(remaining, p.sylvins_earnings)
    p.sylvins_earnings -= take_promo
    remaining -= take_promo
    if remaining > 0:
        p.earnings_paid -= remaining


@router.post("/{user_id}/wallet", response_model=UserProfileOut)
def apply_wallet_delta(
    user_id: str,
    payload: WalletDelta,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")

    # On travaille sur des brouillons pour pouvoir refuser atomiquement si
    # n'importe quel pot finit négatif. Après validation, on recopie sur
    # l'instance ORM.
    new_lueurs = p.lueurs + payload.lueurs
    draft = UserProfile(
        id=p.id,
        username=p.username,
        sylvins=p.sylvins,
        sylvins_earnings=p.sylvins_earnings,
        sylvins_paid=p.sylvins_paid,
        earnings_paid=p.earnings_paid,
    )
    # Appliquer d'abord les champs explicites (plus prévisibles), puis les
    # champs legacy (qui peuvent router vers plusieurs pots).
    draft.sylvins += payload.sylvins_promo
    draft.sylvins_earnings += payload.earnings_promo
    draft.sylvins_paid += payload.sylvins_paid
    draft.earnings_paid += payload.earnings_paid
    _apply_legacy_sylvins_delta(draft, payload.sylvins)
    _apply_legacy_earnings_delta(draft, payload.sylvins_earnings)

    if (
        new_lueurs < 0
        or draft.sylvins < 0
        or draft.sylvins_earnings < 0
        or draft.sylvins_paid < 0
        or draft.earnings_paid < 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde insuffisant.",
        )

    p.lueurs = new_lueurs
    p.sylvins = draft.sylvins
    p.sylvins_earnings = draft.sylvins_earnings
    p.sylvins_paid = draft.sylvins_paid
    p.earnings_paid = draft.earnings_paid
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


@router.post("/{sender_id}/gift-sylvins", response_model=GiftTransferOut)
def gift_sylvins(
    sender_id: str,
    payload: GiftTransfer,
    session: Session = Depends(_session_dep),
) -> GiftTransferOut:
    """Transfère atomiquement `amount` Sylvins du sender au receiver.

    - Consomme le pot PROMO du sender d'abord (évite de gaspiller le pot
      retirable), puis déborde sur PAID.
    - Crédite les recettes du receiver dans le pot miroir : la tranche
      débitée depuis PROMO alimente `earnings_promo`, la tranche PAID
      alimente `earnings_paid`. Impossible de "blanchir" du promo vers du
      cashable en se faisant gifter par un compte complice.
    - Rejette : sender=receiver, sender introuvable, receiver introuvable,
      amount ≤ 0 (validé côté schéma), solde total insuffisant.
    """
    if sender_id == payload.receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de s'envoyer un cadeau à soi-même.",
        )
    sender = session.get(UserProfile, sender_id)
    if not sender:
        raise HTTPException(status_code=404, detail="Sender introuvable.")
    receiver = session.get(UserProfile, payload.receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver introuvable.")

    amount = payload.amount
    if sender.sylvins + sender.sylvins_paid < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde Sylvins insuffisant.",
        )

    # Ordre de consommation : PROMO d'abord (préserve le pot retirable).
    take_promo = min(amount, sender.sylvins)
    take_paid = amount - take_promo

    sender.sylvins -= take_promo
    sender.sylvins_paid -= take_paid
    receiver.sylvins_earnings += take_promo  # = earnings_promo (colonne legacy)
    receiver.earnings_paid += take_paid
    _touch(sender)
    _touch(receiver)
    session.commit()
    session.refresh(sender)
    session.refresh(receiver)
    return GiftTransferOut(
        sender=_to_out(sender),
        receiver=_to_out(receiver),
        consumed_promo=take_promo,
        consumed_paid=take_paid,
    )


@router.post("/{user_id}/daily-claim", response_model=DailyClaimOut)
def daily_claim(
    user_id: str, session: Session = Depends(_session_dep)
) -> DailyClaimOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    now = _now()
    if p.last_daily_at:
        try:
            last = datetime.fromisoformat(p.last_daily_at)
        except ValueError:
            last = None
        if last and now - last < DAILY_COOLDOWN:
            return DailyClaimOut(
                granted=0, already_claimed=True, profile=_to_out(p)
            )
    p.lueurs += DAILY_REWARD_LUEURS
    p.last_daily_at = now.isoformat()
    _touch(p)
    session.commit()
    session.refresh(p)
    return DailyClaimOut(
        granted=DAILY_REWARD_LUEURS, already_claimed=False, profile=_to_out(p)
    )
