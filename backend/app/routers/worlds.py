"""Présence temps réel des mondes sociaux Vaelyndra."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import UserProfile, WorldPresence
from ..schemas import (
    WorldInteractionSendIn,
    WorldPresenceHeartbeatIn,
    WorldPresenceOut,
    WorldPrivateVoiceRequestIn,
    WorldPrivateVoiceRespondIn,
)

router = APIRouter(prefix="/worlds", tags=["worlds"])

_WORLD_IDS = {"main"}
_STALE_AFTER = timedelta(seconds=20)
_PRIVATE_INVITE_TTL = timedelta(seconds=25)
_INTERACTION_TTL = timedelta(seconds=6)
_INTERACTION_COOLDOWN = timedelta(seconds=4)


def _session_dep():
    with get_session() as session:
        yield session


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _validate_world_id(world_id: str) -> str:
    safe = (world_id or "").strip().lower()
    return safe if safe in _WORLD_IDS else "main"


def _district_channel(district: str) -> str:
    safe = (district or "place").strip().lower() or "place"
    return f"district:{safe}"


def _private_channel(user_a: str, user_b: str) -> str:
    first, second = sorted([user_a, user_b])
    return f"private:{first}:{second}"


def _clear_voice_invite(row: WorldPresence) -> None:
    row.voice_invite_from_user_id = None
    row.voice_invite_to_user_id = None
    row.voice_invite_created_at = None


def _reset_voice_channel(row: WorldPresence) -> None:
    row.voice_channel_id = _district_channel(row.district)
    row.private_voice_partner_id = None


def _clear_interaction(row: WorldPresence) -> None:
    row.interaction_kind = None
    row.interaction_from_user_id = None
    row.interaction_from_username = None
    row.interaction_partner_user_id = None
    row.interaction_expires_at = None


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
        voiceChannelId=row.voice_channel_id or _district_channel(row.district),
        privateVoicePartnerId=row.private_voice_partner_id,
        pendingVoiceInviteFromUserId=row.voice_invite_from_user_id,
        pendingVoiceInviteToUserId=row.voice_invite_to_user_id,
        interactionKind=row.interaction_kind,
        interactionFromUserId=row.interaction_from_user_id,
        interactionFromUsername=row.interaction_from_username,
        interactionPartnerUserId=row.interaction_partner_user_id,
        interactionExpiresAt=row.interaction_expires_at,
        lastSeenAt=row.last_seen_at,
    )


def _cleanup_world_presence(session: Session, world_id: str) -> None:
    threshold = _now() - _STALE_AFTER
    rows = session.exec(
        select(WorldPresence).where(WorldPresence.world_id == world_id)
    ).all()
    if not rows:
        return

    by_user = {row.user_id: row for row in rows}
    changed = False
    stale_rows: list[WorldPresence] = []

    for row in rows:
        last_seen = _parse_iso(row.last_seen_at)
        if last_seen is None or last_seen < threshold:
            stale_rows.append(row)
            continue

        if not row.voice_channel_id:
            row.voice_channel_id = _district_channel(row.district)
            changed = True

        invite_created = _parse_iso(row.voice_invite_created_at)
        if invite_created and invite_created + _PRIVATE_INVITE_TTL < _now():
            requester = by_user.get(row.voice_invite_from_user_id or "")
            target = by_user.get(row.voice_invite_to_user_id or "")
            _clear_voice_invite(row)
            if requester is not None:
                _clear_voice_invite(requester)
            if target is not None:
                _clear_voice_invite(target)
            changed = True

        interaction_expires = _parse_iso(row.interaction_expires_at)
        if interaction_expires and interaction_expires <= _now():
            _clear_interaction(row)
            changed = True

        partner_id = row.private_voice_partner_id
        if partner_id:
            partner = by_user.get(partner_id)
            partner_seen = _parse_iso(partner.last_seen_at) if partner is not None else None
            if (
                partner is None
                or partner_seen is None
                or partner_seen < threshold
                or partner.private_voice_partner_id != row.user_id
            ):
                _reset_voice_channel(row)
                changed = True

    for stale in stale_rows:
        partner = by_user.get(stale.private_voice_partner_id or "")
        if partner is not None and partner.user_id != stale.user_id:
            _reset_voice_channel(partner)
            _clear_voice_invite(partner)
            changed = True
        inviter = by_user.get(stale.voice_invite_from_user_id or "")
        if inviter is not None:
            _clear_voice_invite(inviter)
            changed = True
        invited = by_user.get(stale.voice_invite_to_user_id or "")
        if invited is not None:
            _clear_voice_invite(invited)
            changed = True
        session.delete(stale)
        changed = True

    if changed:
        session.commit()


def _get_presence_or_404(session: Session, world_id: str, user_id: str) -> WorldPresence:
    presence = session.exec(
        select(WorldPresence)
        .where(WorldPresence.world_id == world_id)
        .where(WorldPresence.user_id == user_id)
    ).first()
    if presence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Présence du monde introuvable.",
        )
    return presence


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

    if not existing.private_voice_partner_id:
        existing.voice_channel_id = _district_channel(existing.district)

    session.add(existing)
    session.commit()
    session.refresh(existing)

    profile = session.get(UserProfile, user.id)
    assert profile is not None
    return _serialize_presence(existing, profile)


@router.post(
    "/{world_id}/voice/private/request",
    response_model=WorldPresenceOut,
    status_code=status.HTTP_200_OK,
)
def request_private_world_voice(
    world_id: str,
    payload: WorldPrivateVoiceRequestIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> WorldPresenceOut:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    if payload.targetUserId == user.id:
        raise HTTPException(status_code=400, detail="Impossible de s'inviter soi-même.")

    me = _get_presence_or_404(session, safe_world, user.id)
    target = _get_presence_or_404(session, safe_world, payload.targetUserId)

    if me.district != target.district:
        raise HTTPException(
            status_code=400,
            detail="Le membre doit être dans la même zone pour ouvrir un vocal privé.",
        )
    if me.private_voice_partner_id and me.private_voice_partner_id != target.user_id:
        raise HTTPException(status_code=409, detail="Tu es déjà dans un vocal privé.")
    if target.private_voice_partner_id and target.private_voice_partner_id != me.user_id:
        raise HTTPException(status_code=409, detail="Ce membre est déjà dans un vocal privé.")
    if (
        me.voice_invite_from_user_id
        or me.voice_invite_to_user_id
        or target.voice_invite_from_user_id
        or target.voice_invite_to_user_id
    ):
        raise HTTPException(
            status_code=409,
            detail="Une invitation vocale privée est déjà en cours.",
        )

    invite_at = _now().isoformat()
    me.voice_invite_to_user_id = target.user_id
    me.voice_invite_created_at = invite_at
    target.voice_invite_from_user_id = me.user_id
    target.voice_invite_created_at = invite_at
    session.add(me)
    session.add(target)
    session.commit()
    session.refresh(me)
    return _serialize_presence(me, user)


@router.post(
    "/{world_id}/voice/private/respond",
    response_model=WorldPresenceOut,
    status_code=status.HTTP_200_OK,
)
def respond_private_world_voice(
    world_id: str,
    payload: WorldPrivateVoiceRespondIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> WorldPresenceOut:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    me = _get_presence_or_404(session, safe_world, user.id)
    requester = _get_presence_or_404(session, safe_world, payload.requesterUserId)

    if me.voice_invite_from_user_id != requester.user_id or requester.voice_invite_to_user_id != me.user_id:
        raise HTTPException(status_code=404, detail="Invitation vocale introuvable.")

    _clear_voice_invite(me)
    _clear_voice_invite(requester)
    if payload.accept:
        channel_id = _private_channel(me.user_id, requester.user_id)
        me.voice_channel_id = channel_id
        requester.voice_channel_id = channel_id
        me.private_voice_partner_id = requester.user_id
        requester.private_voice_partner_id = me.user_id

    session.add(me)
    session.add(requester)
    session.commit()
    session.refresh(me)
    return _serialize_presence(me, user)


@router.post(
    "/{world_id}/voice/private/leave",
    response_model=WorldPresenceOut,
    status_code=status.HTTP_200_OK,
)
def leave_private_world_voice(
    world_id: str,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> WorldPresenceOut:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    me = _get_presence_or_404(session, safe_world, user.id)
    old_channel = me.voice_channel_id
    partner_id = me.private_voice_partner_id

    _clear_voice_invite(me)
    _reset_voice_channel(me)
    session.add(me)

    if partner_id:
        partner = session.exec(
            select(WorldPresence)
            .where(WorldPresence.world_id == safe_world)
            .where(WorldPresence.user_id == partner_id)
        ).first()
        if partner is not None and (
            partner.private_voice_partner_id == me.user_id
            or partner.voice_channel_id == old_channel
        ):
            _clear_voice_invite(partner)
            _reset_voice_channel(partner)
            session.add(partner)

    session.commit()
    session.refresh(me)
    return _serialize_presence(me, user)


@router.post(
    "/{world_id}/interactions",
    response_model=WorldPresenceOut,
    status_code=status.HTTP_200_OK,
)
def send_world_interaction(
    world_id: str,
    payload: WorldInteractionSendIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> WorldPresenceOut:
    safe_world = _validate_world_id(world_id)
    _cleanup_world_presence(session, safe_world)
    if payload.targetUserId == user.id:
        raise HTTPException(status_code=400, detail="Choisis un autre membre.")

    me = _get_presence_or_404(session, safe_world, user.id)
    target = _get_presence_or_404(session, safe_world, payload.targetUserId)
    if me.district != target.district:
        raise HTTPException(
            status_code=400,
            detail="Le membre doit être dans la même zone pour cette interaction.",
        )

    last_sent = _parse_iso(me.last_interaction_sent_at)
    if last_sent and last_sent + _INTERACTION_COOLDOWN > _now():
        raise HTTPException(
            status_code=429,
            detail="Attends un instant avant d'envoyer une autre interaction.",
        )

    expires_at = (_now() + _INTERACTION_TTL).isoformat()
    me.last_interaction_sent_at = _now().isoformat()
    for row in (me, target):
        row.interaction_kind = payload.kind
        row.interaction_from_user_id = user.id
        row.interaction_from_username = user.username
        row.interaction_partner_user_id = (
            target.user_id if row.user_id == me.user_id else me.user_id
        )
        row.interaction_expires_at = expires_at
        session.add(row)

    session.commit()
    session.refresh(me)
    return _serialize_presence(me, user)


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
        partner_id = existing.private_voice_partner_id
        if partner_id:
            partner = session.exec(
                select(WorldPresence)
                .where(WorldPresence.world_id == safe_world)
                .where(WorldPresence.user_id == partner_id)
            ).first()
            if partner is not None:
                _clear_voice_invite(partner)
                _reset_voice_channel(partner)
                session.add(partner)
        session.delete(existing)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
