"""Routes FastAPI pour l'authentification et la gestion de compte.

Endpoints :
- POST /auth/register                  Inscription (email + code de vérification)
- POST /auth/verify-email              Vérifie l'email via token
- POST /auth/resend-verification       Renvoie le token de vérification
- POST /auth/login                     Connexion (+ TOTP optionnel)
- POST /auth/logout                    Déconnecte la session courante
- GET  /auth/me                        Renvoie l'utilisateur connecté
- POST /auth/change-password           Change le mot de passe
- POST /auth/change-email              Demande un changement d'email
- POST /auth/request-password-reset    Envoie un email de reset
- POST /auth/reset-password            Confirme un reset via token
- GET  /auth/sessions                  Liste les sessions actives
- DELETE /auth/sessions/{id}           Révoque une session
- POST /auth/sessions/revoke-others    Révoque toutes les autres sessions
- POST /auth/2fa/setup                 Génère un secret + QR (preview)
- POST /auth/2fa/enable                Valide le code et active la 2FA
- POST /auth/2fa/disable               Désactive la 2FA (mdp + code requis)
- GET  /auth/login-history             Historique des 50 dernières connexions
- POST /auth/account/delete            Supprime définitivement le compte
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
import secrets as secrets_module
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..creatures import CREATURES
from ..db import get_session
from ..models import UserProfile
from . import emailer
from .crypto import (
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    issue_session_jwt,
    needs_rehash,
    verify_opaque_token,
    verify_password,
)
from .dependencies import (
    clear_session_cookie,
    current_auth_session,
    require_auth,
    require_auth_session,
    set_session_cookie,
)
from .models import (
    AuthSession,
    Credential,
    EmailVerificationToken,
    LoginAttempt,
    PasswordResetToken,
)
from .rate_limit import limiter, user_agent_of


logger = logging.getLogger("vaelyndra.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


# --- Helpers --------------------------------------------------------------

USERNAME_REGEX = re.compile(r"^[A-Za-z0-9À-ÿ_\- ]{2,30}$")
PASSWORD_MIN_LEN = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _normalize_email(email: str) -> str:
    """Valide syntaxiquement et normalise l'email (lowercase domaine)."""
    try:
        info = validate_email(email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(400, f"Email invalide : {exc}") from exc
    return info.normalized.lower()


def _check_password_strength(password: str) -> None:
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(
            400,
            f"Le mot de passe doit faire au moins {PASSWORD_MIN_LEN} caractères.",
        )
    # Règles basiques — pas de regex trop strictes pour ne pas frustrer.
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_letter and has_digit):
        raise HTTPException(
            400,
            "Le mot de passe doit contenir au moins une lettre et un chiffre.",
        )


def _check_username(username: str) -> str:
    username = username.strip()
    if not USERNAME_REGEX.match(username):
        raise HTTPException(
            400,
            "Pseudo invalide (2–30 caractères, lettres/chiffres/espaces/_-).",
        )
    return username


def _log_login_attempt(
    db: Session,
    *,
    email: str,
    user_id: Optional[str],
    success: bool,
    request: Request,
    failure_reason: Optional[str] = None,
) -> None:
    db.add(
        LoginAttempt(
            email=email,
            user_id=user_id,
            success=success,
            ip=_client_ip_header(request),
            user_agent=user_agent_of(request),
            failure_reason=failure_reason,
        )
    )
    db.commit()


def _client_ip_header(request: Request) -> Optional[str]:
    for header in ("fly-client-ip", "x-forwarded-for"):
        value = request.headers.get(header)
        if value:
            return value.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _issue_session(
    db: Session,
    user: UserProfile,
    request: Request,
    ttl_days: int = 30,
) -> tuple[AuthSession, str]:
    """Crée une session DB + retourne le JWT à poser en cookie."""
    session_id = str(uuid.uuid4())
    token = issue_session_jwt(session_id, user.id, ttl_days=ttl_days)
    expires = _now() + timedelta(days=ttl_days)
    auth_session = AuthSession(
        id=session_id,
        user_id=user.id,
        expires_at=expires.isoformat(),
        ip=_client_ip_header(request),
        user_agent=user_agent_of(request),
    )
    db.add(auth_session)
    db.commit()
    db.refresh(auth_session)
    return auth_session, token


def _user_public_dict(user: UserProfile, credential: Optional[Credential]) -> dict:
    """Sérialise un UserProfile + données d'auth pour /auth/me."""
    email = credential.email if credential else None
    email_verified = bool(credential and credential.email_verified_at)
    totp_enabled = bool(credential and credential.totp_enabled)
    return {
        "id": user.id,
        "username": user.username,
        "avatar_image_url": user.avatar_image_url,
        "avatar_url": user.avatar_url,
        "creature_id": user.creature_id,
        "role": user.role,
        "lueurs": user.lueurs,
        "sylvins_promo": user.sylvins,
        "sylvins_paid": user.sylvins_paid,
        "earnings_promo": user.sylvins_earnings,
        "earnings_paid": user.earnings_paid,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "email": email,
        "email_verified": email_verified,
        "totp_enabled": totp_enabled,
    }


def _valid_creature_id(cid: Optional[str]) -> Optional[str]:
    if cid is None:
        return None
    if cid not in {c["id"] for c in CREATURES}:
        raise HTTPException(400, "Créature inconnue.")
    return cid


# --- Schémas (DTO) --------------------------------------------------------

class RegisterIn(BaseModel):
    email: str
    username: str
    password: str
    creature_id: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None
    recovery_code: Optional[str] = None


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerifIn(BaseModel):
    email: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class ChangeEmailIn(BaseModel):
    password: str
    new_email: str


class RequestResetIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class Enable2FAIn(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class Disable2FAIn(BaseModel):
    password: str
    code: str


class DeleteAccountIn(BaseModel):
    password: str
    totp_code: Optional[str] = None


# --- Endpoints ------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
def register(payload: RegisterIn, request: Request) -> dict:
    """Inscription d'un nouveau compte.

    Migration des comptes existants : si un `UserProfile` existe déjà avec
    le pseudo demandé MAIS sans `Credential` associé, on rattache le nouveau
    Credential au profil existant (garde son inventaire / wallet / abos).
    Sinon on crée un nouveau UserProfile.

    Envoie un email de vérification avec un token valide 24 h. L'utilisateur
    ne peut pas se connecter tant que l'email n'est pas validé.
    """
    email = _normalize_email(payload.email)
    username = _check_username(payload.username)
    _check_password_strength(payload.password)
    creature_id = _valid_creature_id(payload.creature_id)

    with get_session() as db:
        # 1. Vérifie qu'aucun Credential n'utilise déjà cet email.
        existing_cred = db.exec(
            select(Credential).where(Credential.email == email)
        ).first()
        if existing_cred is not None:
            # On renvoie un 409 explicite — pas de risque d'enumeration ici
            # (l'utilisateur a choisi l'email, il sait s'il existe déjà).
            raise HTTPException(409, "Un compte existe déjà avec cet email.")

        # 2. Cherche un UserProfile à rattacher : priorité (a) par username
        #    exact, puis (b) création neuve si rien ne matche.
        user = db.exec(
            select(UserProfile).where(UserProfile.username == username)
        ).first()
        if user is not None:
            # Sécurité : si le profil existant a déjà un Credential, le
            # pseudo est pris (on ne merge pas deux auth sur le même profil).
            already_claimed = db.exec(
                select(Credential).where(Credential.user_id == user.id)
            ).first()
            if already_claimed is not None:
                raise HTTPException(409, "Ce pseudo est déjà utilisé.")
            # Rattachement : on garde l'inventaire / wallet / créature.
            if creature_id and not user.creature_id:
                user.creature_id = creature_id
            user.updated_at = _now_iso()
            db.add(user)
        else:
            user = UserProfile(
                id=f"user-{uuid.uuid4().hex[:12]}",
                username=username,
                avatar_image_url=f"https://api.dicebear.com/7.x/personas/svg?seed={username}",
                creature_id=creature_id,
                role="user",
            )
            db.add(user)
        db.commit()
        db.refresh(user)

        # 3. Crée le Credential (non vérifié) + le token d'email verification.
        credential = Credential(
            user_id=user.id,
            email=email,
            password_hash=hash_password(payload.password),
        )
        db.add(credential)

        token_plain = generate_opaque_token()
        db.add(
            EmailVerificationToken(
                id=str(uuid.uuid4()),
                user_id=user.id,
                email=email,
                token_hash=hash_opaque_token(token_plain),
                expires_at=(_now() + timedelta(hours=24)).isoformat(),
            )
        )
        db.commit()

        emailer.send_verification_email(email, user.username, token_plain)

    return {
        "status": "ok",
        "message": "Compte créé. Vérifie ta boîte mail pour activer l'accès.",
    }


@router.post("/verify-email")
def verify_email(payload: VerifyEmailIn) -> dict:
    """Valide un email via le token reçu.

    Active le compte (email_verified_at) et, si le token avait été émis
    pour un changement d'email, met à jour l'email courant.
    """
    if not payload.token:
        raise HTTPException(400, "Token manquant.")

    with get_session() as db:
        # On scanne les tokens non consommés et non expirés : pas terrible
        # en termes de perf, mais le volume est tiny. Pour optimiser plus
        # tard, on pourrait indexer sur un prefixe (hash tronqué).
        tokens = db.exec(
            select(EmailVerificationToken).where(
                EmailVerificationToken.consumed_at.is_(None)  # type: ignore[union-attr]
            )
        ).all()
        now_iso = _now_iso()
        target: Optional[EmailVerificationToken] = None
        for t in tokens:
            if t.expires_at < now_iso:
                continue
            if verify_opaque_token(payload.token, t.token_hash):
                target = t
                break

        if target is None:
            raise HTTPException(400, "Token invalide ou expiré.")

        credential = db.get(Credential, target.user_id)
        if credential is None:
            raise HTTPException(400, "Compte introuvable.")

        # Si l'email du token != email courant → changement d'email validé.
        if credential.email != target.email:
            credential.email = target.email
        credential.email_verified_at = now_iso
        credential.updated_at = now_iso
        db.add(credential)

        target.consumed_at = now_iso
        db.add(target)
        db.commit()

    return {"status": "ok", "message": "Email vérifié. Tu peux maintenant te connecter."}


@router.post("/resend-verification")
@limiter.limit("3/hour")
def resend_verification(payload: ResendVerifIn, request: Request) -> dict:
    email = _normalize_email(payload.email)
    with get_session() as db:
        credential = db.exec(
            select(Credential).where(Credential.email == email)
        ).first()
        # Toujours 200 — ne pas laisser distinguer email existant / inconnu.
        if credential is None or credential.email_verified_at:
            return {"status": "ok"}

        user = db.get(UserProfile, credential.user_id)
        if user is None:
            return {"status": "ok"}

        token_plain = generate_opaque_token()
        db.add(
            EmailVerificationToken(
                id=str(uuid.uuid4()),
                user_id=user.id,
                email=email,
                token_hash=hash_opaque_token(token_plain),
                expires_at=(_now() + timedelta(hours=24)).isoformat(),
            )
        )
        db.commit()
        emailer.send_verification_email(email, user.username, token_plain)

    return {"status": "ok"}


@router.post("/login")
@limiter.limit("10/minute")
def login(payload: LoginIn, request: Request, response: Response) -> dict:
    """Connexion email + mot de passe (+ TOTP optionnel).

    Ne distingue pas "email inconnu" vs "mauvais mot de passe" dans l'erreur
    pour éviter l'enumeration. Rate-limited à 10 tentatives / min / IP.
    """
    email = _normalize_email(payload.email)
    generic_error = HTTPException(401, "Email ou mot de passe incorrect.")

    with get_session() as db:
        credential = db.exec(
            select(Credential).where(Credential.email == email)
        ).first()

        if credential is None:
            _log_login_attempt(
                db,
                email=email,
                user_id=None,
                success=False,
                request=request,
                failure_reason="unknown_email",
            )
            raise generic_error

        if not verify_password(payload.password, credential.password_hash):
            _log_login_attempt(
                db,
                email=email,
                user_id=credential.user_id,
                success=False,
                request=request,
                failure_reason="bad_password",
            )
            raise generic_error

        # Email doit être vérifié.
        if not credential.email_verified_at:
            _log_login_attempt(
                db,
                email=email,
                user_id=credential.user_id,
                success=False,
                request=request,
                failure_reason="email_not_verified",
            )
            raise HTTPException(
                403,
                "Email non vérifié. Consulte ta boîte mail ou demande un nouveau lien.",
            )

        # 2FA si activée.
        if credential.totp_enabled and credential.totp_secret:
            if payload.recovery_code:
                if not _consume_recovery_code(db, credential, payload.recovery_code):
                    _log_login_attempt(
                        db,
                        email=email,
                        user_id=credential.user_id,
                        success=False,
                        request=request,
                        failure_reason="bad_recovery",
                    )
                    raise HTTPException(401, "Code de récupération invalide.")
            elif payload.totp_code:
                totp = pyotp.TOTP(credential.totp_secret)
                if not totp.verify(payload.totp_code, valid_window=1):
                    _log_login_attempt(
                        db,
                        email=email,
                        user_id=credential.user_id,
                        success=False,
                        request=request,
                        failure_reason="bad_totp",
                    )
                    raise HTTPException(401, "Code 2FA invalide.")
            else:
                # Pas de code fourni → on informe le client que la 2FA est requise.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "totp_required", "message": "Code 2FA requis."},
                )

        user = db.get(UserProfile, credential.user_id)
        if user is None:
            raise generic_error

        # Compte banni : refus d'accès (PR J). On renvoie 403 avec un message
        # explicite pour que le frontend puisse afficher une page dédiée
        # "compte suspendu" au lieu d'un générique "mauvais mot de passe".
        if user.banned_at:
            _log_login_attempt(
                db,
                email=email,
                user_id=credential.user_id,
                success=False,
                request=request,
                failure_reason="banned",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "account_banned",
                    "message": "Ce compte est suspendu.",
                    "reason": user.banned_reason or "",
                },
            )

        # Rotation de hash si paramètres argon2 ont évolué.
        if needs_rehash(credential.password_hash):
            credential.password_hash = hash_password(payload.password)
            credential.updated_at = _now_iso()
            db.add(credential)

        auth_session, token = _issue_session(db, user, request)
        session_id = auth_session.id
        _log_login_attempt(
            db,
            email=email,
            user_id=user.id,
            success=True,
            request=request,
        )
        user_dict = _user_public_dict(user, credential)

    set_session_cookie(response, token)
    return {
        "status": "ok",
        "session_id": session_id,
        "user": user_dict,
    }


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    auth_session = current_auth_session(request)
    if auth_session is not None:
        with get_session() as db:
            s = db.get(AuthSession, auth_session.id)
            if s and s.revoked_at is None:
                s.revoked_at = _now_iso()
                db.add(s)
                db.commit()
    clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/me")
def me(user: UserProfile = Depends(require_auth)) -> dict:
    with get_session() as db:
        credential = db.get(Credential, user.id)
        return _user_public_dict(user, credential)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    request: Request,
) -> dict:
    auth_session, user = require_auth_session(request)
    _check_password_strength(payload.new_password)
    if payload.new_password == payload.old_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent.")

    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None:
            raise HTTPException(401, "Compte introuvable.")
        if not verify_password(payload.old_password, credential.password_hash):
            raise HTTPException(401, "Ancien mot de passe incorrect.")

        credential.password_hash = hash_password(payload.new_password)
        credential.updated_at = _now_iso()
        db.add(credential)

        # Révoque toutes les autres sessions pour forcer une reconnexion.
        other_sessions = db.exec(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.id != auth_session.id,
                AuthSession.revoked_at.is_(None),  # type: ignore[union-attr]
            )
        ).all()
        now_iso = _now_iso()
        for s in other_sessions:
            s.revoked_at = now_iso
            db.add(s)
        db.commit()

        emailer.send_security_alert(
            credential.email,
            user.username,
            "Changement de mot de passe",
            _client_ip_header(request),
        )

    return {"status": "ok", "revoked_sessions": len(other_sessions)}


@router.post("/change-email")
def change_email(payload: ChangeEmailIn, request: Request) -> dict:
    _, user = require_auth_session(request)
    new_email = _normalize_email(payload.new_email)

    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None:
            raise HTTPException(401, "Compte introuvable.")
        if not verify_password(payload.password, credential.password_hash):
            raise HTTPException(401, "Mot de passe incorrect.")

        if credential.email == new_email:
            raise HTTPException(400, "C'est déjà ton email actuel.")

        existing = db.exec(
            select(Credential).where(Credential.email == new_email)
        ).first()
        if existing is not None:
            raise HTTPException(409, "Cet email est déjà utilisé.")

        # On notifie l'ancien email + on envoie le lien de validation au nouveau.
        token_plain = generate_opaque_token()
        db.add(
            EmailVerificationToken(
                id=str(uuid.uuid4()),
                user_id=user.id,
                email=new_email,
                token_hash=hash_opaque_token(token_plain),
                expires_at=(_now() + timedelta(hours=24)).isoformat(),
            )
        )
        db.commit()

        emailer.send_email_change_notice(credential.email, user.username, new_email)
        emailer.send_verification_email(new_email, user.username, token_plain)

    return {
        "status": "ok",
        "message": "Vérifie ta nouvelle adresse — tu recevras un lien de confirmation.",
    }


@router.post("/request-password-reset")
@limiter.limit("3/hour")
def request_password_reset(payload: RequestResetIn, request: Request) -> dict:
    email = _normalize_email(payload.email)
    with get_session() as db:
        credential = db.exec(
            select(Credential).where(Credential.email == email)
        ).first()
        # Réponse toujours identique — pas d'enumeration.
        if credential is not None:
            user = db.get(UserProfile, credential.user_id)
            if user is not None:
                token_plain = generate_opaque_token()
                db.add(
                    PasswordResetToken(
                        id=str(uuid.uuid4()),
                        user_id=user.id,
                        token_hash=hash_opaque_token(token_plain),
                        expires_at=(_now() + timedelta(hours=1)).isoformat(),
                    )
                )
                db.commit()
                emailer.send_password_reset_email(email, user.username, token_plain)
    return {"status": "ok"}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, request: Request) -> dict:
    if not payload.token:
        raise HTTPException(400, "Token manquant.")
    _check_password_strength(payload.new_password)

    with get_session() as db:
        tokens = db.exec(
            select(PasswordResetToken).where(
                PasswordResetToken.consumed_at.is_(None)  # type: ignore[union-attr]
            )
        ).all()
        now_iso = _now_iso()
        target: Optional[PasswordResetToken] = None
        for t in tokens:
            if t.expires_at < now_iso:
                continue
            if verify_opaque_token(payload.token, t.token_hash):
                target = t
                break
        if target is None:
            raise HTTPException(400, "Lien invalide ou expiré.")

        credential = db.get(Credential, target.user_id)
        if credential is None:
            raise HTTPException(400, "Compte introuvable.")
        user = db.get(UserProfile, credential.user_id)
        if user is None:
            raise HTTPException(400, "Compte introuvable.")

        credential.password_hash = hash_password(payload.new_password)
        credential.updated_at = now_iso
        db.add(credential)

        target.consumed_at = now_iso
        db.add(target)

        # Révoque toutes les sessions existantes (sécurité post-reset).
        all_sessions = db.exec(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),  # type: ignore[union-attr]
            )
        ).all()
        for s in all_sessions:
            s.revoked_at = now_iso
            db.add(s)
        db.commit()

        emailer.send_security_alert(
            credential.email,
            user.username,
            "Mot de passe réinitialisé",
            _client_ip_header(request),
        )

    return {"status": "ok"}


# --- Sessions -------------------------------------------------------------

@router.get("/sessions")
def list_sessions(request: Request) -> dict:
    auth_session, user = require_auth_session(request)
    with get_session() as db:
        sessions = db.exec(
            select(AuthSession)
            .where(AuthSession.user_id == user.id)
            .order_by(AuthSession.created_at.desc())  # type: ignore[union-attr]
        ).all()
        items = [
            {
                "id": s.id,
                "created_at": s.created_at,
                "expires_at": s.expires_at,
                "last_seen_at": s.last_seen_at,
                "ip": s.ip,
                "user_agent": s.user_agent,
                "revoked_at": s.revoked_at,
                "current": s.id == auth_session.id,
            }
            for s in sessions
        ]
    return {"sessions": items}


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, request: Request) -> dict:
    auth_session, user = require_auth_session(request)
    with get_session() as db:
        target = db.get(AuthSession, session_id)
        if target is None or target.user_id != user.id:
            raise HTTPException(404, "Session introuvable.")
        if target.revoked_at is None:
            target.revoked_at = _now_iso()
            db.add(target)
            db.commit()
    return {"status": "ok", "current_revoked": session_id == auth_session.id}


@router.post("/sessions/revoke-others")
def revoke_other_sessions(request: Request) -> dict:
    auth_session, user = require_auth_session(request)
    with get_session() as db:
        others = db.exec(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.id != auth_session.id,
                AuthSession.revoked_at.is_(None),  # type: ignore[union-attr]
            )
        ).all()
        now_iso = _now_iso()
        for s in others:
            s.revoked_at = now_iso
            db.add(s)
        db.commit()
    return {"status": "ok", "revoked": len(others)}


# --- 2FA TOTP -------------------------------------------------------------

def _consume_recovery_code(db: Session, credential: Credential, code: str) -> bool:
    """Tente de consommer un code de récupération. Les codes restants
    sont remis en DB avec l'entrée utilisée retirée."""
    try:
        hashes: list[str] = json.loads(credential.totp_recovery_hashes_json)
    except Exception:
        hashes = []
    matched_idx: Optional[int] = None
    for idx, h in enumerate(hashes):
        if verify_opaque_token(code, h):
            matched_idx = idx
            break
    if matched_idx is None:
        return False
    del hashes[matched_idx]
    credential.totp_recovery_hashes_json = json.dumps(hashes)
    credential.updated_at = _now_iso()
    db.add(credential)
    db.commit()
    return True


@router.post("/2fa/setup")
def setup_2fa(request: Request) -> dict:
    """Génère un nouveau secret TOTP + QR code base64. Le secret n'est pas
    encore activé — l'utilisateur doit envoyer un code via POST /2fa/enable."""
    _, user = require_auth_session(request)
    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None:
            raise HTTPException(401, "Compte introuvable.")
        if credential.totp_enabled:
            raise HTTPException(400, "La 2FA est déjà activée.")

        secret = pyotp.random_base32()
        credential.totp_secret = secret
        # On ne met pas totp_enabled à True ici — tant que l'utilisateur
        # n'a pas validé avec un code, la 2FA reste inactive.
        credential.updated_at = _now_iso()
        db.add(credential)
        db.commit()

        uri = pyotp.TOTP(secret).provisioning_uri(
            name=credential.email,
            issuer_name="Vaelyndra",
        )
        import qrcode

        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "secret": secret,  # pour saisie manuelle
        "uri": uri,
        "qr_png_base64": qr_b64,
    }


@router.post("/2fa/enable")
def enable_2fa(payload: Enable2FAIn, request: Request) -> dict:
    _, user = require_auth_session(request)
    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None or not credential.totp_secret:
            raise HTTPException(400, "Lance d'abord la configuration 2FA.")
        if credential.totp_enabled:
            raise HTTPException(400, "La 2FA est déjà activée.")

        totp = pyotp.TOTP(credential.totp_secret)
        if not totp.verify(payload.code, valid_window=1):
            raise HTTPException(401, "Code 2FA invalide.")

        # Génère 10 codes de récupération (16 caractères chacun).
        recovery_plain = [
            secrets_module.token_hex(8) for _ in range(10)
        ]
        credential.totp_recovery_hashes_json = json.dumps(
            [hash_opaque_token(c) for c in recovery_plain]
        )
        credential.totp_enabled = True
        credential.updated_at = _now_iso()
        db.add(credential)
        db.commit()

        emailer.send_security_alert(
            credential.email,
            user.username,
            "Double authentification activée",
            _client_ip_header(request),
        )

    return {
        "status": "ok",
        "recovery_codes": recovery_plain,
        "message": "Conserve ces codes en lieu sûr — ils ne seront plus affichés.",
    }


@router.post("/2fa/disable")
def disable_2fa(payload: Disable2FAIn, request: Request) -> dict:
    _, user = require_auth_session(request)
    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None:
            raise HTTPException(401, "Compte introuvable.")
        if not credential.totp_enabled or not credential.totp_secret:
            raise HTTPException(400, "La 2FA n'est pas active.")
        if not verify_password(payload.password, credential.password_hash):
            raise HTTPException(401, "Mot de passe incorrect.")
        totp = pyotp.TOTP(credential.totp_secret)
        if not totp.verify(payload.code, valid_window=1):
            raise HTTPException(401, "Code 2FA invalide.")

        credential.totp_enabled = False
        credential.totp_secret = None
        credential.totp_recovery_hashes_json = "[]"
        credential.updated_at = _now_iso()
        db.add(credential)
        db.commit()

        emailer.send_security_alert(
            credential.email,
            user.username,
            "Double authentification désactivée",
            _client_ip_header(request),
        )
    return {"status": "ok"}


# --- Historique + suppression --------------------------------------------

@router.get("/login-history")
def login_history(request: Request) -> dict:
    _, user = require_auth_session(request)
    with get_session() as db:
        # 50 dernières tentatives pour cet user_id.
        attempts = db.exec(
            select(LoginAttempt)
            .where(LoginAttempt.user_id == user.id)
            .order_by(LoginAttempt.created_at.desc())  # type: ignore[union-attr]
            .limit(50)
        ).all()
        items = [
            {
                "id": a.id,
                "success": a.success,
                "ip": a.ip,
                "user_agent": a.user_agent,
                "created_at": a.created_at,
            }
            for a in attempts
        ]
    return {"attempts": items}


@router.post("/account/delete")
def delete_account(
    payload: DeleteAccountIn,
    request: Request,
    response: Response,
) -> dict:
    """Suppression définitive du compte. Exige le mot de passe (et le code
    TOTP si 2FA activée) pour éviter les suppressions accidentelles / CSRF.

    On supprime :
    - Credential + AuthSessions + tokens + LoginHistory
    - UserProfile (les Posts/Comments gardent author_id mais l'avatar ne
      sera plus résolvable — acceptable pour une première version, une
      anonymisation plus propre viendra plus tard).
    """
    _, user = require_auth_session(request)
    with get_session() as db:
        credential = db.get(Credential, user.id)
        if credential is None:
            raise HTTPException(401, "Compte introuvable.")
        if not verify_password(payload.password, credential.password_hash):
            raise HTTPException(401, "Mot de passe incorrect.")
        if credential.totp_enabled and credential.totp_secret:
            if not payload.totp_code:
                raise HTTPException(401, "Code 2FA requis.")
            totp = pyotp.TOTP(credential.totp_secret)
            if not totp.verify(payload.totp_code, valid_window=1):
                raise HTTPException(401, "Code 2FA invalide.")

        user_id = user.id
        user_email = credential.email

        # Purge toutes les données d'auth.
        for row in db.exec(
            select(AuthSession).where(AuthSession.user_id == user_id)
        ).all():
            db.delete(row)
        for row in db.exec(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == user_id
            )
        ).all():
            db.delete(row)
        for row in db.exec(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user_id)
        ).all():
            db.delete(row)
        db.delete(credential)

        # UserProfile : on le supprime. Attention, les Posts gardent
        # author_id → ils deviendront "fantômes" (UI gère déjà le cas).
        profile = db.get(UserProfile, user_id)
        if profile is not None:
            db.delete(profile)
        db.commit()

    clear_session_cookie(response)
    logger.info("Compte supprimé : %s (%s)", user_id, user_email)
    return {"status": "ok"}
