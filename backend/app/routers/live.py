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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import LiveJoinRequest, LiveModeration, LiveSession, UserProfile


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
    user: UserProfile = Depends(require_auth),
) -> LiveSessionOut:
    """Upsert le live du user connecté et met à jour son heartbeat.

    Idempotent : premier appel = début du live (crée la ligne), appels
    suivants = refresh du heartbeat + sync éventuelle du titre/catégorie
    si le host les modifie en cours de stream.
    """
    now = datetime.now(timezone.utc).isoformat()
    with get_session() as session:
        existing = session.get(LiveSession, user.id)
        if existing is None:
            existing = LiveSession(
                broadcaster_id=user.id,
                broadcaster_name=user.username,
                broadcaster_avatar=user.avatar_image_url,
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
            existing.broadcaster_name = user.username
            existing.broadcaster_avatar = user.avatar_image_url
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
def stop_live(user: UserProfile = Depends(require_auth)) -> Response:
    """Supprime le live du user connecté (arrêt volontaire du stream)."""
    with get_session() as session:
        existing = session.get(LiveSession, user.id)
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


# ---------------------------------------------------------------------------
# Modération live : mute / kick ciblés (PR Q)
# ---------------------------------------------------------------------------
# Le broadcaster peut, depuis le chat de son propre live, muter ou expulser
# un user. La modération est stockée en DB pour survivre au rafraîchissement
# et pour s'appliquer cross-device (si le user muté revient sur la page
# depuis un autre téléphone, il est toujours muet).
#
# Pour que ça reste léger :
#   - une ligne DB par action (mute ou kick). L'upsert écrase l'expiration
#     précédente si on re-mute pendant que le premier mute est encore actif.
#   - le viewer muté/expulsé est informé par polling client
#     (`GET /live/moderation/me?broadcaster_id=X`) et par une vérification
#     locale avant chaque envoi de message dans le chat.
#   - le broadcaster ne peut agir que sur SON propre live (toute autre
#     combinaison `broadcaster_id` renvoie 403).


ACTION_MUTE = "mute"
ACTION_KICK = "kick"
_VALID_ACTIONS = {ACTION_MUTE, ACTION_KICK}

# Limites pour éviter les valeurs extrêmes côté client.
MAX_MUTE_SECONDS = 60 * 60 * 24  # 24h
MAX_KICK_SECONDS = 60 * 60 * 24 * 7  # 7 jours


class LiveModerateIn(BaseModel):
    target_user_id: str = Field(min_length=1, max_length=80)
    action: str = Field(min_length=3, max_length=8)
    duration_seconds: int = Field(ge=30, le=MAX_KICK_SECONDS)

    @field_validator("action")
    @classmethod
    def _action_known(cls, v: str) -> str:
        if v not in _VALID_ACTIONS:
            raise ValueError("action must be mute or kick")
        return v


class LiveModerationStateOut(BaseModel):
    """Réponse de `GET /live/moderation/me` pour un broadcaster donné."""

    muted_until: Optional[str] = None
    kicked_until: Optional[str] = None


def _is_active(expires_at: str) -> bool:
    """Retourne True si `expires_at` est encore dans le futur."""
    try:
        exp = datetime.fromisoformat(expires_at)
    except ValueError:
        return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > datetime.now(timezone.utc)


@router.post("/moderate", response_model=LiveModerationStateOut)
def moderate(
    payload: LiveModerateIn,
    user: UserProfile = Depends(require_auth),
) -> LiveModerationStateOut:
    """Mute ou kick un user sur le live du broadcaster connecté.

    Seul le broadcaster (= `user` connecté) peut modérer son propre live —
    on ne prend pas de `broadcaster_id` en paramètre pour éviter qu'un user
    agisse sur le live de quelqu'un d'autre.

    Idempotent : si une entrée existe déjà (même broadcaster, même cible,
    même action), on écrase `expires_at`. Permet de re-mute 5 min alors
    qu'on avait déjà mute 2 min.
    """
    if user.id == payload.target_user_id:
        # On ne peut pas se modérer soi-même.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "cannot_moderate_self"},
        )
    # Cap côté serveur pour le mute (plus strict que kick).
    max_seconds = MAX_MUTE_SECONDS if payload.action == ACTION_MUTE else MAX_KICK_SECONDS
    duration = min(payload.duration_seconds, max_seconds)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(seconds=duration)).isoformat()
    with get_session() as session:
        # Vérifier que le caller a bien un live actif (heartbeat frais) —
        # on ne veut pas qu'un user quelconque crée des lignes de
        # modération sur un "live" qui n'existe pas. La fraîcheur est
        # vérifiée de la même façon que dans `list_live` (< 90 s).
        live = session.get(LiveSession, user.id)
        if live is None or not _is_fresh(live.last_heartbeat_at):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "no_active_live"},
            )
        # Vérifier que le target existe pour renvoyer une erreur claire
        # plutôt qu'une ligne orpheline.
        target = session.get(UserProfile, payload.target_user_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "target_user_not_found"},
            )
        existing = session.exec(
            select(LiveModeration)
            .where(LiveModeration.broadcaster_id == user.id)
            .where(LiveModeration.target_user_id == payload.target_user_id)
            .where(LiveModeration.action == payload.action)
        ).first()
        if existing is None:
            session.add(
                LiveModeration(
                    broadcaster_id=user.id,
                    target_user_id=payload.target_user_id,
                    action=payload.action,
                    expires_at=expires_at,
                )
            )
        else:
            existing.expires_at = expires_at
            session.add(existing)
        session.commit()
        # On re-lit l'état complet (mute + kick) de la cible pour que le
        # frontend reflète la situation actuelle sans retour aller/retour.
        return _state_for(session, broadcaster_id=user.id, target_id=payload.target_user_id)


@router.delete("/moderate", status_code=status.HTTP_204_NO_CONTENT)
def unmoderate(
    target_user_id: str,
    action: str,
    user: UserProfile = Depends(require_auth),
) -> Response:
    """Annule manuellement un mute ou un kick avant son expiration."""
    if action not in _VALID_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "invalid_action"},
        )
    with get_session() as session:
        existing = session.exec(
            select(LiveModeration)
            .where(LiveModeration.broadcaster_id == user.id)
            .where(LiveModeration.target_user_id == target_user_id)
            .where(LiveModeration.action == action)
        ).first()
        if existing is not None:
            session.delete(existing)
            session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/moderation/me", response_model=LiveModerationStateOut)
def my_moderation_state(
    broadcaster_id: str,
    user: UserProfile = Depends(require_auth),
) -> LiveModerationStateOut:
    """Retourne les sanctions actives du user connecté sur un live donné.

    Polled toutes les 30 s côté client pour détecter un mute/kick posé
    pendant qu'on regarde le live.
    """
    with get_session() as session:
        return _state_for(session, broadcaster_id=broadcaster_id, target_id=user.id)


# ---------------------------------------------------------------------------
# Demandes de montée sur scène (PR #55)
# ---------------------------------------------------------------------------
# Notification temps réel (via polling) : un viewer POSTe `/live/{id}/join`
# pour demander à monter sur scène. Le broadcaster polle `/live/join-requests`
# toutes les 5 s pour voir les demandes en attente sur SON live, et peut
# `PATCH` chaque demande pour l'accepter ou la refuser. Le viewer polle de
# son côté `GET /live/{id}/join/me` pour voir si sa demande a été acceptée.
#
# Pourquoi un nouveau canal plutôt que le localStorage du PR H ?
# → localStorage ne synchronise qu'intra-browser. Pour qu'un viewer sur
#   mobile puisse demander, et que le broadcaster sur PC reçoive en
#   temps réel (toast + badge), il faut une source serveur.


JOIN_STATUS_PENDING = "pending"
JOIN_STATUS_ACCEPTED = "accepted"
JOIN_STATUS_REFUSED = "refused"
_VALID_JOIN_STATUS = {JOIN_STATUS_PENDING, JOIN_STATUS_ACCEPTED, JOIN_STATUS_REFUSED}

# Purge côté lecture : on ignore (et on supprime) les demandes refusées
# depuis plus de X minutes pour ne pas accumuler d'historique.
JOIN_REFUSED_GRACE_SECONDS = 60 * 3


class JoinRequestOut(BaseModel):
    """Représentation d'une demande de montée sur scène."""

    id: int
    broadcaster_id: str
    user_id: str
    username: str
    avatar: str
    creature_id: str = ""
    status: str
    requested_at: str
    decided_at: Optional[str] = None


class JoinDecisionIn(BaseModel):
    status: str = Field(min_length=1, max_length=16)

    @field_validator("status")
    @classmethod
    def _status_known(cls, v: str) -> str:
        if v not in {JOIN_STATUS_ACCEPTED, JOIN_STATUS_REFUSED}:
            raise ValueError("status must be accepted or refused")
        return v


def _to_join_out(row: LiveJoinRequest) -> JoinRequestOut:
    return JoinRequestOut(
        id=row.id or 0,
        broadcaster_id=row.broadcaster_id,
        user_id=row.user_id,
        username=row.username,
        avatar=row.avatar,
        creature_id=row.creature_id,
        status=row.status,
        requested_at=row.requested_at,
        decided_at=row.decided_at,
    )


def _purge_stale_refused(session: Session, broadcaster_id: str) -> None:
    """Supprime les demandes refusées vieilles (grace window dépassée)."""
    rows = session.exec(
        select(LiveJoinRequest)
        .where(LiveJoinRequest.broadcaster_id == broadcaster_id)
        .where(LiveJoinRequest.status == JOIN_STATUS_REFUSED)
    ).all()
    now = datetime.now(timezone.utc)
    for r in rows:
        if not r.decided_at:
            continue
        try:
            decided = datetime.fromisoformat(r.decided_at)
        except ValueError:
            continue
        if decided.tzinfo is None:
            decided = decided.replace(tzinfo=timezone.utc)
        if (now - decided).total_seconds() > JOIN_REFUSED_GRACE_SECONDS:
            session.delete(r)


@router.post("/{broadcaster_id}/join", response_model=JoinRequestOut)
def request_join(
    broadcaster_id: str,
    user: UserProfile = Depends(require_auth),
) -> JoinRequestOut:
    """Viewer : demande à monter sur scène du live d'un broadcaster.

    Idempotent : si une demande existe déjà pour ce couple
    (broadcaster, user), on remet son statut à `pending` et on
    rafraîchit `requested_at` (utile si le viewer avait été refusé et
    veut réessayer après la grace window).
    """
    if user.id == broadcaster_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "cannot_request_own_live"},
        )
    with get_session() as session:
        # Le live doit être actif pour recevoir des demandes.
        live = session.get(LiveSession, broadcaster_id)
        if live is None or not _is_fresh(live.last_heartbeat_at):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "live_not_found"},
            )
        now = datetime.now(timezone.utc).isoformat()
        existing = session.exec(
            select(LiveJoinRequest)
            .where(LiveJoinRequest.broadcaster_id == broadcaster_id)
            .where(LiveJoinRequest.user_id == user.id)
        ).first()
        if existing is None:
            row = LiveJoinRequest(
                broadcaster_id=broadcaster_id,
                user_id=user.id,
                username=user.username,
                avatar=user.avatar_image_url,
                creature_id=getattr(user, "creature_id", "") or "",
                status=JOIN_STATUS_PENDING,
                requested_at=now,
            )
            session.add(row)
        else:
            existing.username = user.username
            existing.avatar = user.avatar_image_url
            existing.creature_id = getattr(user, "creature_id", "") or ""
            existing.status = JOIN_STATUS_PENDING
            existing.requested_at = now
            existing.decided_at = None
            row = existing
            session.add(row)
        session.commit()
        session.refresh(row)
        return _to_join_out(row)


@router.delete(
    "/{broadcaster_id}/join", status_code=status.HTTP_204_NO_CONTENT
)
def cancel_own_join_request(
    broadcaster_id: str,
    user: UserProfile = Depends(require_auth),
) -> Response:
    """Viewer : annule sa propre demande en attente."""
    with get_session() as session:
        existing = session.exec(
            select(LiveJoinRequest)
            .where(LiveJoinRequest.broadcaster_id == broadcaster_id)
            .where(LiveJoinRequest.user_id == user.id)
        ).first()
        if existing is not None:
            session.delete(existing)
            session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/join-requests", response_model=list[JoinRequestOut])
def list_join_requests(
    user: UserProfile = Depends(require_auth),
) -> list[JoinRequestOut]:
    """Broadcaster : liste les demandes sur SON live (polled ~5s).

    Inclut pending + accepted + refused récents. Le frontend filtre /
    groupe selon l'affichage. La fraîcheur du live n'est PAS checkée
    ici pour que le broadcaster voie ses demandes juste après avoir
    relancé le live (et avant que le heartbeat remonte).
    """
    with get_session() as session:
        _purge_stale_refused(session, broadcaster_id=user.id)
        session.commit()
        rows = session.exec(
            select(LiveJoinRequest)
            .where(LiveJoinRequest.broadcaster_id == user.id)
            .order_by(LiveJoinRequest.requested_at.desc())
        ).all()
        return [_to_join_out(r) for r in rows]


@router.get("/{broadcaster_id}/join/me", response_model=Optional[JoinRequestOut])
def my_join_request(
    broadcaster_id: str,
    user: UserProfile = Depends(require_auth),
) -> Optional[JoinRequestOut]:
    """Viewer : polle sa propre demande pour voir si elle a été
    acceptée / refusée. Renvoie `null` si pas de demande active."""
    with get_session() as session:
        row = session.exec(
            select(LiveJoinRequest)
            .where(LiveJoinRequest.broadcaster_id == broadcaster_id)
            .where(LiveJoinRequest.user_id == user.id)
        ).first()
        if row is None:
            return None
        return _to_join_out(row)


@router.patch("/join-requests/{request_id}", response_model=JoinRequestOut)
def decide_join_request(
    request_id: int,
    payload: JoinDecisionIn,
    user: UserProfile = Depends(require_auth),
) -> JoinRequestOut:
    """Broadcaster : accepte ou refuse une demande.

    Seul le broadcaster propriétaire de la demande peut décider.
    """
    with get_session() as session:
        row = session.get(LiveJoinRequest, request_id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "join_request_not_found"},
            )
        if row.broadcaster_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "not_your_live"},
            )
        row.status = payload.status
        row.decided_at = datetime.now(timezone.utc).isoformat()
        session.add(row)
        session.commit()
        session.refresh(row)
        return _to_join_out(row)


def _state_for(
    session: Session,
    *,
    broadcaster_id: str,
    target_id: str,
) -> LiveModerationStateOut:
    """Helper : lit les éventuelles lignes mute/kick et renvoie un DTO."""
    rows = session.exec(
        select(LiveModeration)
        .where(LiveModeration.broadcaster_id == broadcaster_id)
        .where(LiveModeration.target_user_id == target_id)
    ).all()
    muted_until: Optional[str] = None
    kicked_until: Optional[str] = None
    for r in rows:
        if not _is_active(r.expires_at):
            continue
        if r.action == ACTION_MUTE:
            muted_until = r.expires_at
        elif r.action == ACTION_KICK:
            kicked_until = r.expires_at
    return LiveModerationStateOut(
        muted_until=muted_until,
        kicked_until=kicked_until,
    )
