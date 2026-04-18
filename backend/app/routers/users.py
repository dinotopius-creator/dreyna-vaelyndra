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
    return UserProfileOut(
        id=p.id,
        username=p.username,
        avatarImageUrl=p.avatar_image_url,
        avatarUrl=p.avatar_url,
        inventory=json.loads(p.inventory_json or "[]"),
        equipped=json.loads(p.equipped_json or "{}"),
        lueurs=p.lueurs,
        sylvins=p.sylvins,
        sylvinsEarnings=p.sylvins_earnings,
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


@router.post("/{user_id}/wallet", response_model=UserProfileOut)
def apply_wallet_delta(
    user_id: str,
    payload: WalletDelta,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    new_lueurs = p.lueurs + payload.lueurs
    new_sylvins = p.sylvins + payload.sylvins
    new_earnings = p.sylvins_earnings + payload.sylvins_earnings
    if new_lueurs < 0 or new_sylvins < 0 or new_earnings < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde insuffisant.",
        )
    p.lueurs = new_lueurs
    p.sylvins = new_sylvins
    p.sylvins_earnings = new_earnings
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p)


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
