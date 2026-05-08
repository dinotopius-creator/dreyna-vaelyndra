"""Dépendances FastAPI pour l'authentification.

Exposent :
- `current_session` : résout le cookie `vaelyndra_session` → `AuthSession`.
- `current_user` : idem + charge le `UserProfile`.
- `require_auth` / `require_admin` : dépendances qui lèvent 401/403.
- `optional_user` : None si pas connecté, sinon le UserProfile.

Le cookie est HttpOnly + Secure en prod. En prod, SameSite=None permet aussi
à l'app mobile Capacitor (origine localhost/capacitor) d'appeler
api.vaelyndra.com avec credentials.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import UserProfile
from .crypto import decode_session_jwt
from .models import AuthSession


COOKIE_NAME = "vaelyndra_session"


def is_prod() -> bool:
    """Détecte si on tourne en prod (Fly.io) ou en local dev."""
    return os.environ.get("FLY_APP_NAME") is not None or os.environ.get(
        "VAELYNDRA_ENV"
    ) == "production"


def set_session_cookie(response: Response, token: str, *, ttl_days: int = 30) -> None:
    """Dépose le cookie de session.

    - HttpOnly : JS ne peut pas le lire → protection XSS
    - Secure en prod : cookie ne part qu'en HTTPS
    - SameSite=None en prod : requis pour l'app mobile Capacitor qui appelle
      api.vaelyndra.com depuis une origine app/localhost.
    - SameSite=Lax en local : garde un comportement dev simple en HTTP.
    """
    same_site = "none" if is_prod() else "lax"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=ttl_days * 24 * 3600,
        httponly=True,
        secure=is_prod(),
        samesite=same_site,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        samesite="none" if is_prod() else "lax",
        secure=is_prod(),
    )


def _resolve_session(
    request: Request,
    db: Session,
) -> tuple[Optional[AuthSession], Optional[UserProfile]]:
    """Retourne (session, user) si cookie valide + session non révoquée."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None, None

    payload = decode_session_jwt(token)
    if not payload:
        return None, None

    sid = payload.get("sid")
    uid = payload.get("sub")
    if not sid or not uid:
        return None, None

    auth_session = db.get(AuthSession, sid)
    if not auth_session or auth_session.user_id != uid:
        return None, None
    if auth_session.revoked_at is not None:
        return None, None

    now = datetime.now(timezone.utc).isoformat()
    if auth_session.expires_at < now:
        return None, None

    user = db.get(UserProfile, uid)
    if not user:
        return None, None

    # Défense en profondeur contre les bans : on vérifie `banned_at` à chaque
    # requête authentifiée. `/auth/login` bloque déjà la création de nouvelles
    # sessions pour les comptes bannis (403 `account_banned`) et
    # `admin.ban_user` révoque toutes les sessions actives au moment du ban.
    # Mais une race (nouvelle session créée entre le SELECT et le COMMIT de la
    # révocation) peut laisser passer une session "orpheline" qui survivrait au
    # ban. Sans ce check, le user banni garderait l'accès API (/auth/me,
    # /reports, etc.) tant que sa session non révoquée reste active. On rend
    # donc `_resolve_session` strict : un user avec `banned_at` ne résout plus.
    if user.banned_at:
        return None, None

    # Best-effort : on refresh `last_seen_at` si plus de 5 min depuis la
    # dernière requête (évite d'écrire en DB à chaque requête).
    try:
        last_seen = datetime.fromisoformat(auth_session.last_seen_at)
        if (datetime.now(timezone.utc) - last_seen).total_seconds() > 300:
            auth_session.last_seen_at = now
            db.add(auth_session)
            db.commit()
    except Exception:
        pass

    return auth_session, user


def optional_user(request: Request) -> Optional[UserProfile]:
    """Retourne le UserProfile connecté si cookie valide, sinon None."""
    with get_session() as db:
        _, user = _resolve_session(request, db)
        return user


def current_auth_session(request: Request) -> Optional[AuthSession]:
    with get_session() as db:
        auth_session, _ = _resolve_session(request, db)
        return auth_session


def require_auth(request: Request) -> UserProfile:
    """Dépendance : 401 si pas connecté, sinon retourne le UserProfile."""
    user = optional_user(request)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise.",
        )
    return user


def require_auth_session(request: Request) -> tuple[AuthSession, UserProfile]:
    """Retourne (session, user) si auth, sinon 401."""
    with get_session() as db:
        auth_session, user = _resolve_session(request, db)
        if auth_session is None or user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentification requise.",
            )
        return auth_session, user


def require_admin(user: UserProfile = Depends(require_auth)) -> UserProfile:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs.",
        )
    return user


def require_admin_or_animator(
    user: UserProfile = Depends(require_auth),
) -> UserProfile:
    if user.role not in {"admin", "animator"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs et animateurs.",
        )
    return user
