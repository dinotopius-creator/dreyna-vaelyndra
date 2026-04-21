"""Endpoints REST pour la messagerie privée 1-to-1 (DMs).

Modèle (cf. models.DirectMessage) : table unique avec `conversation_key`
canonique `"{min(a,b)}|{max(a,b)}"` pour indexer un fil sans se soucier
du sens. Chaque message porte `read_at` (None tant que le destinataire
n'a pas ouvert le fil), ce qui permet les accusés de lecture.

Temps réel : un endpoint SSE `/stream` push les nouveaux messages + les
mises à jour d'accusé de lecture à l'user connecté. Il s'appuie sur un
bus pub/sub en mémoire process (suffisant tant qu'on a 1 seule instance
backend Fly.io, comme aujourd'hui). Si on passe à plusieurs instances
plus tard, il faudra brancher Redis pub/sub ou équivalent.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import DirectMessage, UserProfile


router = APIRouter(prefix="/messages", tags=["messages"])


def _session_dep():
    with get_session() as session:
        yield session


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _conversation_key(a: str, b: str) -> str:
    """Clé canonique triée pour indexer un fil 1-to-1."""
    lo, hi = sorted((a, b))
    return f"{lo}|{hi}"


MAX_CONTENT_LEN = 2000
SEND_COOLDOWN_S = 1.0
# Limite défensive : empêche un spam qui ferait exploser la table DB.
# 500 msgs/h/sender = ~8/min = largement suffisant pour du chat humain.
HOURLY_SEND_LIMIT = 500


class MessageOut(BaseModel):
    id: int
    sender_id: str
    recipient_id: str
    content: str
    created_at: str
    read_at: Optional[str] = None


class ConversationOut(BaseModel):
    """Résumé d'un fil pour la liste des conversations."""

    other_user_id: str
    other_username: str
    other_avatar: str
    last_message: MessageOut
    unread_count: int


class SendMessagePayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CONTENT_LEN)


# ---------- Pub/sub en mémoire (SSE) ----------

# Un subscriber = une queue asyncio qui reçoit les events qui concernent
# son user (nouveau message où il est sender OU recipient, ou mise à jour
# read_at sur un fil où il est sender).
_subscribers: Dict[str, Set[asyncio.Queue]] = {}
_subscribers_lock = asyncio.Lock()


async def _subscribe(user_id: str) -> asyncio.Queue:
    async with _subscribers_lock:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        _subscribers.setdefault(user_id, set()).add(queue)
        return queue


async def _unsubscribe(user_id: str, queue: asyncio.Queue) -> None:
    async with _subscribers_lock:
        if user_id in _subscribers:
            _subscribers[user_id].discard(queue)
            if not _subscribers[user_id]:
                del _subscribers[user_id]


def _publish(user_ids: Tuple[str, ...], event: dict) -> None:
    """Push un event à tous les subscribers de la liste d'users donnée.

    Volontairement non-async : on veut pouvoir appeler depuis les handlers
    POST synchrones sans faire sauter tout le routeur en async. Les puts
    sur `asyncio.Queue` depuis du sync se font via `put_nowait`, en best
    effort — si la queue d'un client lent est saturée (100 msgs en retard),
    on drop plutôt que bloquer le POST.
    """
    for uid in user_ids:
        queues = _subscribers.get(uid)
        if not queues:
            continue
        for q in list(queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # Consommateur trop lent — on laisse tomber, il resyncera
                # via le GET classique.
                pass


# ---------- Helpers ----------

def _serialize(m: DirectMessage) -> MessageOut:
    assert m.id is not None
    return MessageOut(
        id=m.id,
        sender_id=m.sender_id,
        recipient_id=m.recipient_id,
        content=m.content,
        created_at=m.created_at,
        read_at=m.read_at,
    )


def _assert_other(session: Session, other_id: str, me_id: str) -> UserProfile:
    if other_id == me_id:
        raise HTTPException(
            status_code=400, detail="Impossible de s'envoyer un message à soi-même."
        )
    other = session.get(UserProfile, other_id)
    if not other:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if other.banned_at:
        raise HTTPException(status_code=403, detail="Cet utilisateur est suspendu.")
    return other


# ---------- Endpoints ----------

@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> List[ConversationOut]:
    """Liste les fils où l'user courant a au moins un message (envoyé ou reçu).

    Pour chaque fil : dernier message + compteur non-lus (messages dont
    l'user est destinataire et `read_at is None`).
    """
    # Récupère tous les messages où je suis impliqué, triés récents en premier.
    # Sur une petite base (< 100k messages) c'est largement assez performant ;
    # on itère côté Python pour regrouper par conversation_key.
    rows = session.exec(
        select(DirectMessage)
        .where(
            (DirectMessage.sender_id == me.id)
            | (DirectMessage.recipient_id == me.id)
        )
        .order_by(DirectMessage.created_at.desc())  # type: ignore[attr-defined]
    ).all()

    last_by_conv: Dict[str, DirectMessage] = {}
    unread_by_conv: Dict[str, int] = {}
    for m in rows:
        if m.conversation_key not in last_by_conv:
            last_by_conv[m.conversation_key] = m
        if m.recipient_id == me.id and m.read_at is None:
            unread_by_conv[m.conversation_key] = (
                unread_by_conv.get(m.conversation_key, 0) + 1
            )

    # Hydrate les profils des correspondants en un seul SELECT.
    other_ids = {
        (m.sender_id if m.sender_id != me.id else m.recipient_id)
        for m in last_by_conv.values()
    }
    profiles: Dict[str, UserProfile] = {}
    if other_ids:
        for p in session.exec(
            select(UserProfile).where(UserProfile.id.in_(list(other_ids)))  # type: ignore[attr-defined]
        ).all():
            profiles[p.id] = p

    out: List[ConversationOut] = []
    for conv_key, last in last_by_conv.items():
        other_id = last.sender_id if last.sender_id != me.id else last.recipient_id
        profile = profiles.get(other_id)
        if not profile:
            # Correspondant supprimé : on masque le fil.
            continue
        out.append(
            ConversationOut(
                other_user_id=other_id,
                other_username=profile.username,
                other_avatar=profile.avatar_image_url or "",
                last_message=_serialize(last),
                unread_count=unread_by_conv.get(conv_key, 0),
            )
        )
    # Déjà triés par récence du dernier message grâce à l'order_by initial.
    return out


@router.get("/unread-count")
def unread_count(
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> Dict[str, int]:
    """Compteur global de messages non lus (utilisé par le badge Navbar)."""
    total = session.exec(
        select(func.count(DirectMessage.id)).where(
            DirectMessage.recipient_id == me.id,
            DirectMessage.read_at.is_(None),  # type: ignore[attr-defined]
        )
    ).one()
    return {"count": int(total or 0)}


@router.get("/{other_user_id}", response_model=List[MessageOut])
def get_thread(
    other_user_id: str,
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
    limit: int = 200,
) -> List[MessageOut]:
    """Retourne le fil avec `other_user_id` (récent en dernier).

    **Effet de bord** : marque tous les messages reçus de cet user comme
    lus (read_at = now). C'est ce qui déclenche l'accusé de lecture côté
    sender (via un event SSE `read`).
    """
    _assert_other(session, other_user_id, me.id)
    conv_key = _conversation_key(me.id, other_user_id)
    limit = max(1, min(limit, 500))

    rows = session.exec(
        select(DirectMessage)
        .where(DirectMessage.conversation_key == conv_key)
        .order_by(DirectMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    ).all()
    rows = list(reversed(rows))  # plus ancien → plus récent pour l'UI

    # Marque comme lus les messages où je suis destinataire.
    now = _now_iso()
    updated_ids: List[int] = []
    for m in rows:
        if m.recipient_id == me.id and m.read_at is None:
            m.read_at = now
            session.add(m)
            assert m.id is not None
            updated_ids.append(m.id)
    if updated_ids:
        session.commit()
        for m in rows:
            if m.id in updated_ids:
                session.refresh(m)
        # Notifie l'autre user (qui est sender de ces messages) pour que
        # son UI mette à jour les "Vu à HH:MM" en temps réel.
        _publish(
            (other_user_id,),
            {
                "type": "read",
                "conversation_key": conv_key,
                "reader_id": me.id,
                "read_at": now,
                "message_ids": updated_ids,
            },
        )

    return [_serialize(m) for m in rows]


@router.post("/{other_user_id}", response_model=MessageOut)
def send_message(
    other_user_id: str,
    payload: SendMessagePayload,
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> MessageOut:
    """Envoie un message texte à `other_user_id`."""
    other = _assert_other(session, other_user_id, me.id)
    conv_key = _conversation_key(me.id, other.id)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message vide.")

    # Cooldown 1s anti-spam : on regarde le dernier message envoyé par me.
    last_mine = session.exec(
        select(DirectMessage)
        .where(DirectMessage.sender_id == me.id)
        .order_by(DirectMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(1)
    ).first()
    if last_mine is not None:
        try:
            last_ts = datetime.fromisoformat(last_mine.created_at)
            if (
                datetime.now(timezone.utc) - last_ts
            ).total_seconds() < SEND_COOLDOWN_S:
                raise HTTPException(status_code=429, detail="Trop rapide, respire.")
        except ValueError:
            pass

    # Rate-limit horaire (500 msgs/h/sender).
    hour_ago = (
        datetime.now(timezone.utc).replace(microsecond=0)
    ).isoformat()[:13]  # "YYYY-MM-DDTHH" — OK pour préfixe ISO
    recent_count = session.exec(
        select(func.count(DirectMessage.id)).where(
            DirectMessage.sender_id == me.id,
            DirectMessage.created_at >= hour_ago,
        )
    ).one()
    if int(recent_count or 0) >= HOURLY_SEND_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Limite horaire atteinte, réessaie plus tard.",
        )

    msg = DirectMessage(
        conversation_key=conv_key,
        sender_id=me.id,
        recipient_id=other.id,
        content=content,
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)

    out = _serialize(msg)
    # Push SSE aux 2 parties — y compris l'émetteur, pour que ses autres
    # onglets ouverts voient le message apparaître immédiatement.
    _publish(
        (me.id, other.id),
        {
            "type": "message",
            "conversation_key": conv_key,
            "message": out.model_dump(),
        },
    )
    return out


@router.get("/stream/subscribe")
async def stream(
    request: Request,
    me: UserProfile = Depends(require_auth),
) -> StreamingResponse:
    """SSE : push des events (nouveau message, accusé de lecture) à l'user.

    Format : lignes `data: <json>\\n\\n`. Le navigateur reconnecte
    automatiquement via `EventSource` en cas de coupure.
    """
    user_id = me.id

    async def event_source() -> AsyncIterator[bytes]:
        queue = await _subscribe(user_id)
        try:
            # Heartbeat initial pour forcer le flush du header HTTP et
            # confirmer côté client que le stream est bien ouvert.
            yield b": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {json.dumps(event)}\n\n".encode()
                except asyncio.TimeoutError:
                    # Ping keep-alive pour éviter que les proxies ferment
                    # la connexion après 30s d'inactivité.
                    yield b": ping\n\n"
        finally:
            await _unsubscribe(user_id, queue)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
