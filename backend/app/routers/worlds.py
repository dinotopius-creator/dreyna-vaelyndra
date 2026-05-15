"""Présence temps réel des mondes sociaux Vaelyndra."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session, select

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import UserProfile, WorldPresence
from ..schemas import WorldPresenceHeartbeatIn, WorldPresenceOut

router = APIRouter(prefix="/worlds", tags=["worlds"])

_WORLD_IDS = {"main"}
_STALE_AFTER = timedelta(seconds=20)


def _session_dep():
    with get_session() as session:
        yield session


def _now() -> datetime:
    return datetime.now(UTC)


def _validate_world_id(world_id: str) -> str:
    safe = (world_id or "").strip().lower()
    return safe if safe in _WORLD_IDS else "main"


def _cleanup_world_presence(session: Session, world_id: str) -> None:
    threshold = (_now() - _STALE_AFTER).isoformat()
    stale_rows = session.exec(
        select(WorldPresence)
        .where(WorldPresence.world_id == world_id)
        .where(WorldPresence.last_seen_at < threshold)
    ).all()
    if not stale_rows:
        return
    for row in stale_rows:
        session.delete(row)
    session.commit()


def _serialize_presence(row: WorldPresence, profile: UserProfile) -> WorldPresenceOut:
    return WorldPresenceOut(
        userId=profile.id,
        username=profile.username,
        handle=profile.handle,
        avatarImageUrl=profile.avatar_image_url or "",
        avatarUrl=profile.avatar_url,
        role=profile.role or "user",
        district=row.district,
        posX=int(row.pos_x),
        posY=int(row.pos_y),
        voiceEnabled=bool(row.voice_enabled),
        lastSeenAt=row.last_seen_at,
    )


@router.get("/{world_id}/presence", response_model=list[WorldPresenceOut])
def list_world_presence(
    world_id: str,
    session: Session = Depends(_session_dep),
) -> list[WorldPresenceOut]:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    rows = session.exec(
        select(WorldPresence)
        .where(WorldPresence.world_id == safe_world)
        .order_by(WorldPresence.last_seen_at.desc())
    ).all()
    if not rows:
        return []

    user_ids = [row.user_id for row in rows]
    profiles = {
        profile.id: profile
        for profile in session.exec(
            select(UserProfile).where(UserProfile.id.in_(user_ids))
        ).all()
        if profile.banned_at is None
    }
    return [
        _serialize_presence(row, profiles[row.user_id])
        for row in rows
        if row.user_id in profiles
    ]


@router.post(
    "/{world_id}/presence/me",
    response_model=WorldPresenceOut,
    status_code=status.HTTP_200_OK,
)
def heartbeat_world_presence(
    world_id: str,
    payload: WorldPresenceHeartbeatIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> WorldPresenceOut:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    existing = session.exec(
        select(WorldPresence)
        .where(WorldPresence.world_id == safe_world)
        .where(WorldPresence.user_id == user.id)
    ).first()
    if existing is None:
        existing = WorldPresence(world_id=safe_world, user_id=user.id)
        session.add(existing)

    existing.district = payload.district
    existing.pos_x = int(payload.posX)
    existing.pos_y = int(payload.posY)
    existing.voice_enabled = bool(payload.voiceEnabled)
    existing.last_seen_at = _now().isoformat()
    session.add(existing)
    session.commit()
    session.refresh(existing)

    profile = session.get(UserProfile, user.id)
    assert profile is not None
    return _serialize_presence(existing, profile)


@router.delete("/{world_id}/presence/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_world_presence(
    world_id: str,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> Response:
    safe_world = _validate_world_id(world_id)
    existing = session.exec(
        select(WorldPresence)
        .where(WorldPresence.world_id == safe_world)
        .where(WorldPresence.user_id == user.id)
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
