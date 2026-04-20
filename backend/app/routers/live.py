"""Endpoints REST pour le registre des lives en cours.

Avant ce router, le "liveRegistry" côté frontend vivait uniquement dans
`localStorage` — chaque browser ne voyait que son propre live. Résultat :
Alexandre lance son live sur son browser, Dreyna ouvre `/communaute` sur
son téléphone et ne voit rien. Ce registre côté serveur corrige le
problème en devenant la source de vérité partagée.

Mécanique :
- Le host POSTe `/live/heartbeat` toutes les ~30 s avec les méta-données
  de son live (titre, catégorie, mode, etc.). Upsert idempotent.
- Le host DELETE `/live/stop` quand il arrête le live (bouton "Arrêter"
  ou fermeture d'onglet via `beforeunload`).
- Les viewers GETent `/live` pour récupérer tous les lives actifs.
- Un live est "actif" si `last_heartbeat_at` < 90 s. Au-delà, on
  considère qu'il s'agit d'un crash / fermeture sauvage et on l'ignore.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from ..auth.dependencies import require_auth
from ..auth.models import Credential
from ..db import get_session
from ..models import LiveSession, UserProfile


router = APIRouter(prefix="/live", tags=["live"])


# Heartbeat attendu toutes les 30 s côté client ; on tolère 3x avant
# d'éluder une entrée (couvre un hiccup réseau + une retry).
HEARTBEAT_STALE_SECONDS = 90


def _is_fresh(last_heartbeat_at: str) -> bool:
    try:
        hb = datetime.fromisoformat(last_heartbeat_at)
    except ValueError:
        return False
    now = datetime.now(timezone.utc)
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    return now - hb < timedelta(seconds=HEARTBEAT_STALE_SECONDS)


class LiveHeartbeatIn(BaseModel):
    """Payload envoyé par le host quand il lance ou maintient son live."""

    title: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=400)
    category: str = Field(default="autre", max_length=40)
    mode: str = Field(default="screen", max_length=16)
    twitch_channel: str = Field(default="", max_length=60)

    @field_validator("mode")
    @classmethod
    def _mode_known(cls, v: str) -> str:
        if v not in {"screen", "camera", "twitch"}:
            raise ValueError("mode must be screen, camera or twitch")
        return v


class LiveSessionOut(BaseModel):
    """Représentation publique d'un live en cours."""

    broadcaster_id: str
    broadcaster_name: str
    broadcaster_avatar: str = ""
    title: str = ""
    description: str = ""
    category: str = "autre"
    mode: str = "screen"
    twitch_channel: str = ""
    started_at: str
    last_heartbeat_at: str


def _to_out(entry: LiveSession) -> LiveSessionOut:
    return LiveSessionOut(
        broadcaster_id=entry.broadcaster_id,
        broadcaster_name=entry.broadcaster_name,
        broadcaster_avatar=entry.broadcaster_avatar,
        title=entry.title,
        description=entry.description,
        category=entry.category,
        mode=entry.mode,
        twitch_channel=entry.twitch_channel,
        started_at=entry.started_at,
        last_heartbeat_at=entry.last_heartbeat_at,
    )


@router.post("/heartbeat", response_model=LiveSessionOut)
def heartbeat(
    payload: LiveHeartbeatIn,
    credential: Credential = Depends(require_auth),
) -> LiveSessionOut:
    """Upsert le live du user connecté et met à jour son heartbeat.

    Idempotent : premier appel = début du live (crée la ligne), appels
    suivants = refresh du heartbeat + sync éventuelle du titre/catégorie
    si le host les modifie en cours de stream.
    """
    now = datetime.now(timezone.utc).isoformat()
    with get_session() as session:
        profile = session.get(UserProfile, credential.user_id)
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "profile_missing"},
            )
        existing = session.get(LiveSession, credential.user_id)
        if existing is None:
            existing = LiveSession(
                broadcaster_id=credential.user_id,
                broadcaster_name=profile.username,
                broadcaster_avatar=profile.avatar_image_url,
                title=payload.title.strip(),
                description=payload.description.strip(),
                category=payload.category,
                mode=payload.mode,
                twitch_channel=payload.twitch_channel.strip(),
                started_at=now,
                last_heartbeat_at=now,
            )
            session.add(existing)
        else:
            # Refresh du profil (pseudo/avatar peuvent changer pendant
            # le live) + des méta-données modifiables en vol.
            existing.broadcaster_name = profile.username
            existing.broadcaster_avatar = profile.avatar_image_url
            existing.title = payload.title.strip()
            existing.description = payload.description.strip()
            existing.category = payload.category
            existing.mode = payload.mode
            existing.twitch_channel = payload.twitch_channel.strip()
            existing.last_heartbeat_at = now
        session.commit()
        session.refresh(existing)
        return _to_out(existing)


@router.delete("/stop", status_code=status.HTTP_204_NO_CONTENT)
def stop_live(credential: Credential = Depends(require_auth)) -> Response:
    """Supprime le live du user connecté (arrêt volontaire du stream)."""
    with get_session() as session:
        existing = session.get(LiveSession, credential.user_id)
        if existing is not None:
            session.delete(existing)
            session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=list[LiveSessionOut])
def list_live() -> list[LiveSessionOut]:
    """Liste publique de tous les lives en cours (heartbeat < 90 s).

    Pas d'authentification requise : le registre des lives est public
    (affiché sur `/communaute` à tout visiteur). Les lives dont le
    heartbeat a expiré sont supprimés à la volée pour éviter
    d'accumuler des fantômes.
    """
    with get_session() as session:
        entries = session.exec(
            select(LiveSession).order_by(LiveSession.started_at.desc())
        ).all()
        fresh: list[LiveSession] = []
        to_delete: list[LiveSession] = []
        for e in entries:
            if _is_fresh(e.last_heartbeat_at):
                fresh.append(e)
            else:
                to_delete.append(e)
        for e in to_delete:
            session.delete(e)
        if to_delete:
            session.commit()
        return [_to_out(e) for e in fresh]
