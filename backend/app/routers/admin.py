"""Endpoints admin pour la modération et la gestion économique (PR J + K).

Tous les endpoints sont protégés par `require_admin` — seul un user dont
`UserProfile.role == "admin"` peut y accéder. Le `roi-des-zems` est
l'admin par défaut seedé au démarrage.

Convention :
- Chaque action (wallet_adjust, role_change, ban/unban) est loggée dans
  `AdminAuditLog` (journal append-only, non modifiable par l'UI).
- Le ban révoque toutes les sessions actives du user ciblé et bloque
  `/auth/login` (check côté `auth/routes.py::login`).
- Les ajustements de wallet ne peuvent pas rendre un solde négatif. Si
  l'admin tente de retirer plus que le solde, la requête est refusée.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..auth.dependencies import require_admin, require_architect
from ..auth import emailer
from ..auth.crypto import generate_opaque_token, hash_opaque_token
from ..auth.models import (
    AuthSession,
    Credential,
    EmailVerificationToken,
    LoginAttempt,
    PasswordResetToken,
)
from ..db import get_session
from ..models import (
    AdminAuditLog,
    AdminRequest,
    Comment,
    DirectMessage,
    Follow,
    GiftLedger,
    LiveJoinRequest,
    LiveModeration,
    LiveSession,
    Post,
    Reaction,
    Report,
    UserProfile,
)


router = APIRouter(prefix="/admin", tags=["admin"])


# --- Helpers --------------------------------------------------------------


def _session_dep():
    with get_session() as session:
        yield session


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Les pots wallet éditables par un admin. On expose les 4 sous-pots
# (Lueurs + les 3 autres Sylvins split paid/promo + earnings) parce qu'un
# admin doit pouvoir corriger chaque ligne comptable indépendamment.
WALLET_POTS: set[str] = {
    "lueurs",
    "sylvins_promo",
    "sylvins_paid",
    "earnings_promo",
    "earnings_paid",
}
ROLES: set[str] = {"user", "animator", "admin", "architect"}
ADMIN_REQUEST_ACTIONS: set[str] = {"grant_lueurs", "grant_sylvins", "grant_item"}
ADMIN_REQUEST_CONTEXTS: set[str] = {
    "recompense_evenement",
    "correction",
    "concours",
    "animation_live",
    "compensation",
    "autre",
}

# Sentinel posé sur les lignes qui référencent un compte hard-delete
# (`GiftLedger.sender_id`, `DirectMessage.sender_id` / `recipient_id`,
# etc.). Voir le bloc de doc plus bas autour de la définition complète
# pour le rationnel. Constante exposée ici parce qu'elle est utilisée
# dès `_hard_delete_user` (déclaré ~ligne 700) et que les imports
# Python doivent suivre l'ordre d'évaluation du module.
DELETED_USER_SENTINEL_ID = "user-deleted"


def _user_or_404(session: Session, user_id: str) -> UserProfile:
    user = session.get(UserProfile, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    return user


def _credential_email(session: Session, user_id: str) -> Optional[str]:
    cred = session.get(Credential, user_id)
    return cred.email if cred else None


def _log_action(
    session: Session,
    *,
    actor: UserProfile,
    target: UserProfile,
    action: str,
    details: dict,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        actor_id=actor.id,
        actor_username=actor.username,
        target_id=target.id,
        target_username=target.username,
        action=action,
        details_json=json.dumps(details, ensure_ascii=False),
    )
    session.add(entry)
    return entry


def _revoke_all_sessions(session: Session, user_id: str, *, except_id: str | None = None) -> int:
    """Révoque toutes les sessions actives du user (sauf `except_id`)."""
    rows = session.exec(
        select(AuthSession).where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    now = _now_iso()
    count = 0
    for s in rows:
        if except_id and s.id == except_id:
            continue
        s.revoked_at = now
        session.add(s)
        count += 1
    return count


# --- Schémas I/O -----------------------------------------------------------


class AdminUserOut(BaseModel):
    id: str
    username: str
    avatarImageUrl: str
    email: Optional[str]
    role: str
    creatureId: Optional[str]
    lueurs: int
    sylvinsPromo: int
    sylvinsPaid: int
    earningsPromo: int
    earningsPaid: int
    createdAt: str
    bannedAt: Optional[str]
    bannedReason: Optional[str]
    activeSessions: int
    reportsAgainstCount: int
    totpEnabled: bool


def _admin_user_out(session: Session, user: UserProfile) -> AdminUserOut:
    active_sessions = len(
        session.exec(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),  # type: ignore[union-attr]
            )
        ).all()
    )
    reports_against = len(
        session.exec(
            select(Report).where(
                Report.target_type == "user",
                Report.target_id == user.id,
                Report.status == "open",
            )
        ).all()
    )
    credential = session.get(Credential, user.id)
    totp_enabled = bool(credential and credential.totp_enabled)
    return AdminUserOut(
        id=user.id,
        username=user.username,
        avatarImageUrl=user.avatar_image_url or "",
        email=_credential_email(session, user.id),
        role=user.role or "user",
        creatureId=user.creature_id,
        lueurs=user.lueurs,
        sylvinsPromo=user.sylvins,
        sylvinsPaid=user.sylvins_paid,
        earningsPromo=user.sylvins_earnings,
        earningsPaid=user.earnings_paid,
        createdAt=user.created_at,
        bannedAt=user.banned_at,
        bannedReason=user.banned_reason,
        activeSessions=active_sessions,
        reportsAgainstCount=reports_against,
        totpEnabled=totp_enabled,
    )


class WalletAdjustIn(BaseModel):
    pot: str = Field(..., description="lueurs | sylvins_promo | sylvins_paid | earnings_promo | earnings_paid")
    delta: int = Field(..., description="Positif = crédite, négatif = débite. Ne peut pas rendre le solde < 0.")
    reason: str = Field(..., min_length=2, max_length=300)


class RoleChangeIn(BaseModel):
    role: str
    reason: Optional[str] = None


class BanIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=500)


class PasswordResetIn(BaseModel):
    # Même règle que `_check_password_strength` côté auth/routes.py :
    # PASSWORD_MIN_LEN = 10. Limite haute généreuse pour ne pas bloquer
    # des passphrases ; la force exacte est aussi revalidée par
    # `_check_password_strength` dans le handler, pour rester en phase
    # avec /auth/change-password même si la constante bouge plus tard.
    new_password: str = Field(..., min_length=10, max_length=256)
    reason: str = Field(..., min_length=2, max_length=300)


class AuditLogOut(BaseModel):
    id: int
    actorId: str
    actorUsername: str
    targetId: str
    targetUsername: str
    action: str
    details: dict
    createdAt: str


class AdminRequestCreateIn(BaseModel):
    target_user_id: str = Field(..., min_length=1, max_length=128)
    action_type: str = Field(..., max_length=48)
    amount: int = Field(default=0, ge=0, le=1_000_000)
    item_id: Optional[str] = Field(default=None, max_length=128)
    reason: str = Field(..., min_length=8, max_length=500)
    context: str = Field(default="autre", max_length=64)


class AdminRequestReviewIn(BaseModel):
    comment: Optional[str] = Field(default=None, max_length=500)


class OfficialEventCreateIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=8, max_length=1800)
    event_date: Optional[str] = Field(default=None, max_length=80)
    image_url: Optional[str] = Field(default=None, max_length=1024)


class AdminRequestOut(BaseModel):
    id: int
    requesterId: str
    requesterUsername: str
    requesterRole: str
    targetId: str
    targetUsername: str
    actionType: str
    currency: Optional[str]
    amount: int
    itemId: Optional[str]
    reason: str
    context: str
    status: str
    reviewerId: Optional[str]
    reviewerUsername: Optional[str]
    reviewerComment: Optional[str]
    createdAt: str
    reviewedAt: Optional[str]


class OfficialEventOut(BaseModel):
    id: str
    postType: str
    officialLabel: str
    createdAt: str


def _audit_out(entry: AdminAuditLog) -> AuditLogOut:
    try:
        details = json.loads(entry.details_json) if entry.details_json else {}
    except Exception:
        details = {}
    return AuditLogOut(
        id=entry.id or 0,
        actorId=entry.actor_id,
        actorUsername=entry.actor_username,
        targetId=entry.target_id,
        targetUsername=entry.target_username,
        action=entry.action,
        details=details,
        createdAt=entry.created_at,
    )


def _admin_request_out(row: AdminRequest) -> AdminRequestOut:
    return AdminRequestOut(
        id=row.id or 0,
        requesterId=row.requester_id,
        requesterUsername=row.requester_username,
        requesterRole=row.requester_role,
        targetId=row.target_id,
        targetUsername=row.target_username,
        actionType=row.action_type,
        currency=row.currency,
        amount=row.amount,
        itemId=row.item_id,
        reason=row.reason,
        context=row.context,
        status=row.status,
        reviewerId=row.reviewer_id,
        reviewerUsername=row.reviewer_username,
        reviewerComment=row.reviewer_comment,
        createdAt=row.created_at,
        reviewedAt=row.reviewed_at,
    )


def _normalize_admin_request(
    body: AdminRequestCreateIn,
) -> tuple[str, Optional[str], int, Optional[str]]:
    action = body.action_type.strip()
    if action not in ADMIN_REQUEST_ACTIONS:
        raise HTTPException(
            400,
            f"Type de demande invalide. Valeurs : {sorted(ADMIN_REQUEST_ACTIONS)}.",
        )
    if body.context not in ADMIN_REQUEST_CONTEXTS:
        raise HTTPException(
            400,
            f"Contexte invalide. Valeurs : {sorted(ADMIN_REQUEST_CONTEXTS)}.",
        )
    if action in {"grant_lueurs", "grant_sylvins"}:
        if body.amount <= 0:
            raise HTTPException(400, "Le montant doit être strictement positif.")
        currency = "lueurs" if action == "grant_lueurs" else "sylvins_promo"
        return action, currency, int(body.amount), None
    item_id = (body.item_id or "").strip()
    if not item_id:
        raise HTTPException(400, "L'objet à donner est obligatoire.")
    return action, None, 1, item_id


def _apply_admin_request(
    session: Session,
    row: AdminRequest,
    reviewer: UserProfile,
) -> UserProfile:
    target = _user_or_404(session, row.target_id)
    if row.action_type == "grant_lueurs":
        old_value = int(target.lueurs or 0)
        target.lueurs = old_value + int(row.amount or 0)
        details = {
            "request_id": row.id,
            "pot": "lueurs",
            "delta": row.amount,
            "old_value": old_value,
            "new_value": target.lueurs,
            "reason": row.reason,
            "context": row.context,
        }
        _log_action(
            session,
            actor=reviewer,
            target=target,
            action="admin_request_wallet_grant",
            details=details,
        )
    elif row.action_type == "grant_sylvins":
        old_value = int(target.sylvins or 0)
        target.sylvins = old_value + int(row.amount or 0)
        details = {
            "request_id": row.id,
            "pot": "sylvins_promo",
            "delta": row.amount,
            "old_value": old_value,
            "new_value": target.sylvins,
            "reason": row.reason,
            "context": row.context,
        }
        _log_action(
            session,
            actor=reviewer,
            target=target,
            action="admin_request_wallet_grant",
            details=details,
        )
    elif row.action_type == "grant_item":
        item_id = (row.item_id or "").strip()
        if not item_id:
            raise HTTPException(400, "Demande d'objet invalide.")
        try:
            inventory = json.loads(target.inventory_json or "[]")
            if not isinstance(inventory, list):
                inventory = []
        except Exception:
            inventory = []
        already_owned = item_id in inventory
        if not already_owned:
            inventory.append(item_id)
            target.inventory_json = json.dumps(inventory, ensure_ascii=False)
        _log_action(
            session,
            actor=reviewer,
            target=target,
            action="admin_request_item_grant",
            details={
                "request_id": row.id,
                "item_id": item_id,
                "already_owned": already_owned,
                "reason": row.reason,
                "context": row.context,
            },
        )
    else:
        raise HTTPException(400, "Type de demande non supporté.")
    target.updated_at = _now_iso()
    session.add(target)
    return target


# --- Endpoints : demandes administratives ---------------------------------


@router.post("/requests", response_model=AdminRequestOut, status_code=status.HTTP_201_CREATED)
def create_admin_request(
    body: AdminRequestCreateIn,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> AdminRequestOut:
    action, currency, amount, item_id = _normalize_admin_request(body)
    target = _user_or_404(session, body.target_user_id)
    row = AdminRequest(
        requester_id=admin.id,
        requester_username=admin.username,
        requester_role=admin.role or "user",
        target_id=target.id,
        target_username=target.username,
        action_type=action,
        currency=currency,
        amount=amount,
        item_id=item_id,
        reason=body.reason.strip(),
        context=body.context,
        status="pending",
    )
    session.add(row)
    _log_action(
        session,
        actor=admin,
        target=target,
        action="admin_request_created",
        details={
            "action_type": action,
            "currency": currency,
            "amount": amount,
            "item_id": item_id,
            "reason": body.reason.strip(),
            "context": body.context,
        },
    )
    session.commit()
    session.refresh(row)
    return _admin_request_out(row)


@router.get("/requests", response_model=list[AdminRequestOut])
def list_admin_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    target_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> list[AdminRequestOut]:
    stmt = select(AdminRequest)
    if admin.role != "architect":
        stmt = stmt.where(AdminRequest.requester_id == admin.id)
    if status_filter:
        stmt = stmt.where(AdminRequest.status == status_filter)
    if target_id:
        stmt = stmt.where(AdminRequest.target_id == target_id)
    rows = session.exec(stmt).all()
    rows.sort(key=lambda row: row.created_at, reverse=True)
    return [_admin_request_out(row) for row in rows[:limit]]


@router.post("/requests/{request_id}/approve", response_model=AdminRequestOut)
def approve_admin_request(
    request_id: int,
    body: AdminRequestReviewIn,
    architect: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminRequestOut:
    row = session.get(AdminRequest, request_id)
    if row is None:
        raise HTTPException(404, "Demande administrative introuvable.")
    if row.status != "pending":
        raise HTTPException(409, "Cette demande a déjà été traitée.")
    if row.requester_id == architect.id:
        raise HTTPException(403, "Tu ne peux pas valider ta propre demande.")
    target = _apply_admin_request(session, row, architect)
    now = _now_iso()
    row.status = "approved"
    row.reviewer_id = architect.id
    row.reviewer_username = architect.username
    row.reviewer_comment = (body.comment or "").strip() or None
    row.reviewed_at = now
    session.add(row)
    _log_action(
        session,
        actor=architect,
        target=target,
        action="admin_request_approved",
        details={
            "request_id": row.id,
            "action_type": row.action_type,
            "currency": row.currency,
            "amount": row.amount,
            "item_id": row.item_id,
            "comment": row.reviewer_comment or "",
        },
    )
    session.commit()
    session.refresh(row)
    return _admin_request_out(row)


@router.post("/requests/{request_id}/reject", response_model=AdminRequestOut)
def reject_admin_request(
    request_id: int,
    body: AdminRequestReviewIn,
    architect: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminRequestOut:
    row = session.get(AdminRequest, request_id)
    if row is None:
        raise HTTPException(404, "Demande administrative introuvable.")
    if row.status != "pending":
        raise HTTPException(409, "Cette demande a déjà été traitée.")
    target = _user_or_404(session, row.target_id)
    now = _now_iso()
    row.status = "rejected"
    row.reviewer_id = architect.id
    row.reviewer_username = architect.username
    row.reviewer_comment = (body.comment or "").strip() or None
    row.reviewed_at = now
    session.add(row)
    _log_action(
        session,
        actor=architect,
        target=target,
        action="admin_request_rejected",
        details={
            "request_id": row.id,
            "action_type": row.action_type,
            "comment": row.reviewer_comment or "",
        },
    )
    session.commit()
    session.refresh(row)
    return _admin_request_out(row)


# --- Endpoints : annonces officielles communautaires ----------------------


@router.post(
    "/community/events",
    response_model=OfficialEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_official_event(
    body: OfficialEventCreateIn,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> OfficialEventOut:
    content_parts = [f"## {body.title.strip()}", body.description.strip()]
    if body.event_date and body.event_date.strip():
        content_parts.append(f"Date : {body.event_date.strip()}")
    post = Post(
        id=f"post-{uuid.uuid4().hex[:12]}",
        author_id=admin.id,
        author_name=admin.username,
        author_avatar=admin.avatar_image_url or "",
        content="\n\n".join(content_parts),
        image_url=(body.image_url or "").strip() or None,
        post_type="official_event",
        official_label="Annonce officielle",
    )
    session.add(post)
    _log_action(
        session,
        actor=admin,
        target=admin,
        action="official_event_created",
        details={
            "post_id": post.id,
            "title": body.title.strip(),
            "event_date": (body.event_date or "").strip(),
        },
    )
    session.commit()
    session.refresh(post)
    return OfficialEventOut(
        id=post.id,
        postType=post.post_type,
        officialLabel=post.official_label or "Annonce officielle",
        createdAt=post.created_at,
    )


# --- Endpoints : liste utilisateurs ----------------------------------------


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    search: Optional[str] = Query(None, description="Filtre par pseudo ou email (sous-chaîne, insensible à la casse)."),
    limit: int = Query(50, ge=1, le=200),
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> list[AdminUserOut]:
    rows = session.exec(select(UserProfile)).all()
    if search:
        needle = search.strip().lower()
        filtered = []
        for u in rows:
            email = _credential_email(session, u.id) or ""
            if needle in (u.username or "").lower() or needle in email.lower():
                filtered.append(u)
        rows = filtered
    # Tri stable en deux passes : d'abord date desc (nouveaux users en haut
    # pour la visibilité modération), puis bannis en premier.
    rows.sort(key=lambda u: u.created_at or "", reverse=True)
    rows.sort(key=lambda u: u.banned_at is None)
    return [_admin_user_out(session, u) for u in rows[:limit]]


@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(
    user_id: str,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    user = _user_or_404(session, user_id)
    return _admin_user_out(session, user)


# --- Endpoints : wallet / rôle / ban ---------------------------------------


@router.post("/users/{user_id}/wallet/adjust", response_model=AdminUserOut)
def adjust_wallet(
    user_id: str,
    body: WalletAdjustIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    if body.pot not in WALLET_POTS:
        raise HTTPException(400, f"Pot invalide. Valeurs : {sorted(WALLET_POTS)}.")
    if body.delta == 0:
        raise HTTPException(400, "Le delta doit être non nul.")
    user = _user_or_404(session, user_id)

    # Mapping pot → (attribut SQL, nom lisible).
    attr_by_pot = {
        "lueurs": "lueurs",
        "sylvins_promo": "sylvins",
        "sylvins_paid": "sylvins_paid",
        "earnings_promo": "sylvins_earnings",
        "earnings_paid": "earnings_paid",
    }
    attr = attr_by_pot[body.pot]
    current = int(getattr(user, attr) or 0)
    new_value = current + body.delta
    if new_value < 0:
        raise HTTPException(
            400,
            f"Solde insuffisant : {body.pot} = {current}, delta = {body.delta}.",
        )
    setattr(user, attr, new_value)
    user.updated_at = _now_iso()
    session.add(user)
    _log_action(
        session,
        actor=admin,
        target=user,
        action="wallet_adjust",
        details={
            "pot": body.pot,
            "delta": body.delta,
            "old_value": current,
            "new_value": new_value,
            "reason": body.reason,
        },
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
def change_role(
    user_id: str,
    body: RoleChangeIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    if body.role not in ROLES:
        raise HTTPException(400, f"Rôle invalide. Valeurs : {sorted(ROLES)}.")
    user = _user_or_404(session, user_id)
    if user.id == admin.id and body.role != "architect":
        raise HTTPException(400, "Tu ne peux pas retirer ton propre rôle Architecte.")
    old_role = user.role or "user"
    if old_role == body.role:
        return _admin_user_out(session, user)
    user.role = body.role
    user.updated_at = _now_iso()
    session.add(user)
    _log_action(
        session,
        actor=admin,
        target=user,
        action="role_change",
        details={
            "old_role": old_role,
            "new_role": body.role,
            "reason": body.reason or "",
        },
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


@router.post("/users/{user_id}/reset-password", response_model=AdminUserOut)
def admin_reset_password(
    user_id: str,
    body: PasswordResetIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    """Permet à un admin de définir directement le mot de passe d'un user.

    Cas d'usage : débloquer un compte coincé en "mode hors-ligne" parce
    que le user a oublié son mot de passe, OU tant que l'email transac
    (Resend/DKIM) n'est pas encore verified et donc que le flow
    `/auth/request-password-reset` ne peut pas fournir un lien
    utilisable.

    Effets de bord :
    - hash argon2id du nouveau mdp
    - toutes les sessions auth actives du user sont révoquées (il doit
      se reconnecter)
    - action `password_reset` loggée dans AdminAuditLog (sans le mdp)

    Un admin ne peut PAS reset son propre mdp via cet endpoint — il doit
    passer par `/auth/change-password` (qui demande l'ancien mdp). Ça
    évite qu'un admin compromis n'efface la piste d'audit d'un reset
    self-inflicted.
    """
    from ..auth.crypto import hash_password

    if user_id == admin.id:
        raise HTTPException(
            400,
            "Utilise /auth/change-password pour changer ton propre mot de passe.",
        )
    user = _user_or_404(session, user_id)
    credential = session.get(Credential, user_id)
    if credential is None:
        raise HTTPException(
            404,
            "Cet utilisateur n'a pas de credential backend (compte legacy).",
        )

    # Check de force minimale identique à /auth/change-password.
    from ..auth.routes import _check_password_strength

    _check_password_strength(body.new_password)

    credential.password_hash = hash_password(body.new_password)
    credential.updated_at = _now_iso()
    session.add(credential)

    revoked = _revoke_all_sessions(session, user_id)

    _log_action(
        session,
        actor=admin,
        target=user,
        action="password_reset",
        details={
            "reason": body.reason,
            "sessions_revoked": revoked,
        },
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


class Disable2FAIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=300)


class AdminEmailChangeIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    reason: str = Field(..., min_length=2, max_length=300)
    send_verification: bool = True


def _normalize_admin_email(email: str) -> str:
    from email_validator import EmailNotValidError, validate_email

    try:
        info = validate_email(email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return info.normalized.lower()


@router.post("/users/{user_id}/email", response_model=AdminUserOut)
def admin_change_email(
    user_id: str,
    body: AdminEmailChangeIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    """Change l'email backend d'un user et renvoie une vérification.

    Réservé admin : cas d'un compte officiel/animateur seedé avec une
    adresse technique ou d'un user qui a perdu accès à son ancien email.
    Le mot de passe n'est jamais exposé ni modifié ici.
    """
    user = _user_or_404(session, user_id)
    credential = session.get(Credential, user_id)
    if credential is None:
        raise HTTPException(
            404,
            "Cet utilisateur n'a pas de credential backend (compte legacy).",
        )

    new_email = _normalize_admin_email(body.email)
    old_email = credential.email
    if old_email == new_email:
        return _admin_user_out(session, user)

    existing = session.exec(
        select(Credential).where(
            Credential.email == new_email,
            Credential.user_id != user_id,
        )
    ).first()
    if existing is not None:
        raise HTTPException(409, "Cet email est déjà utilisé.")

    now = _now_iso()
    credential.email = new_email
    credential.email_verified_at = None
    credential.updated_at = now
    session.add(credential)

    token_sent = False
    if body.send_verification:
        token_plain = generate_opaque_token()
        session.add(
            EmailVerificationToken(
                id=str(uuid.uuid4()),
                user_id=user.id,
                email=new_email,
                token_hash=hash_opaque_token(token_plain),
                expires_at=(datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
            )
        )
        token_sent = emailer.send_verification_email(
            new_email,
            user.username,
            token_plain,
        )

    revoked = _revoke_all_sessions(session, user_id)
    _log_action(
        session,
        actor=admin,
        target=user,
        action="email_change",
        details={
            "old_email": old_email,
            "new_email": new_email,
            "reason": body.reason,
            "verification_requested": body.send_verification,
            "verification_sent": token_sent,
            "sessions_revoked": revoked,
        },
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


@router.delete("/users/{user_id}/totp", response_model=AdminUserOut)
def admin_disable_totp(
    user_id: str,
    body: Disable2FAIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    """Désactive le 2FA (TOTP) d'un utilisateur.

    Cas d'usage : un user a activé le 2FA puis perdu l'accès à son
    appli authenticator (ou le seed a été activé sans que le user le
    sache — ce qui est arrivé avec les comptes officiels seedés). Sans
    cet endpoint, il faut du SSH sur le serveur pour désactiver le
    champ manuellement.

    Un admin ne peut PAS désactiver son propre TOTP via cet endpoint
    (utiliser /auth/disable-totp pour ça).
    """
    if user_id == admin.id:
        raise HTTPException(
            400,
            "Utilise /compte pour gérer ton propre 2FA.",
        )
    user = _user_or_404(session, user_id)
    credential = session.get(Credential, user_id)
    if credential is None:
        raise HTTPException(
            404,
            "Cet utilisateur n'a pas de credential backend (compte legacy).",
        )
    if not credential.totp_enabled:
        # Idempotent — déjà désactivé.
        return _admin_user_out(session, user)

    credential.totp_enabled = False
    credential.totp_secret = None
    credential.totp_recovery_hashes_json = "[]"
    credential.updated_at = _now_iso()
    session.add(credential)

    _log_action(
        session,
        actor=admin,
        target=user,
        action="disable_totp",
        details={"reason": body.reason},
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
def ban_user(
    user_id: str,
    body: BanIn,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    user = _user_or_404(session, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "Tu ne peux pas te bannir toi-même.")
    if user.role == "admin":
        raise HTTPException(400, "Impossible de bannir un autre admin. Retire-lui d'abord le rôle.")
    # Refuse un second ban sur un compte déjà banni : sinon on écraserait
    # silencieusement `banned_at / banned_reason / banned_by` avec les valeurs
    # du second appel, ce qui ferait perdre la trace du ban initial côté
    # `UserProfile` (le journal d'audit le garde, mais l'UI admin affiche
    # toujours l'enregistrement live). L'admin doit passer par `unban` puis
    # `ban` s'il veut réellement modifier la raison.
    if user.banned_at:
        raise HTTPException(400, "Cet utilisateur est déjà banni. Débannis-le d'abord pour modifier la raison.")
    now = _now_iso()
    user.banned_at = now
    user.banned_reason = body.reason
    user.banned_by = admin.id
    user.updated_at = now
    session.add(user)
    revoked = _revoke_all_sessions(session, user.id)
    _log_action(
        session,
        actor=admin,
        target=user,
        action="ban",
        details={"reason": body.reason, "sessions_revoked": revoked},
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


@router.delete("/users/{user_id}/ban", response_model=AdminUserOut)
def unban_user(
    user_id: str,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> AdminUserOut:
    user = _user_or_404(session, user_id)
    if user.banned_at is None:
        return _admin_user_out(session, user)
    previous_reason = user.banned_reason or ""
    user.banned_at = None
    user.banned_reason = None
    user.banned_by = None
    user.updated_at = _now_iso()
    session.add(user)
    _log_action(
        session,
        actor=admin,
        target=user,
        action="unban",
        details={"previous_reason": previous_reason},
    )
    session.commit()
    session.refresh(user)
    return _admin_user_out(session, user)


# --- Suppression hard d'un compte ------------------------------------------


class HardDeleteIn(BaseModel):
    # `confirm_username` = pseudo exact du user ciblé, demandé côté UI pour
    # empêcher un clic accidentel (équivalent GitHub "Type XXX to confirm").
    confirm_username: str = Field(min_length=1)
    reason: str = Field(min_length=2, max_length=500)


class HardDeleteOut(BaseModel):
    userId: str
    username: str
    email: Optional[str]


def _hard_delete_user(
    session: Session,
    user: UserProfile,
    cred: Optional[Credential],
) -> None:
    """Purge toutes les lignes rattachées à `user.id` puis supprime le
    profil et son credential. Les `AdminAuditLog` sont conservés
    volontairement (traçabilité) — les colonnes `actor_id` / `target_id` y
    sont de simples strings, pas des FK, donc rien ne casse si elles
    pointent vers un user disparu.
    """
    uid = user.id

    # Auth (tokens + sessions + historique login)
    for token in session.exec(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == uid,
        )
    ).all():
        session.delete(token)
    for token in session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == uid,
        )
    ).all():
        session.delete(token)
    for auth_s in session.exec(
        select(AuthSession).where(AuthSession.user_id == uid)
    ).all():
        session.delete(auth_s)
    for attempt in session.exec(
        select(LoginAttempt).where(LoginAttempt.user_id == uid)
    ).all():
        session.delete(attempt)

    # Contenus produits par le user
    for react in session.exec(
        select(Reaction).where(Reaction.user_id == uid)
    ).all():
        session.delete(react)
    for comment in session.exec(
        select(Comment).where(Comment.author_id == uid)
    ).all():
        session.delete(comment)
    for post in session.exec(
        select(Post).where(Post.author_id == uid)
    ).all():
        # Supprime les réactions + commentaires rattachés au post
        # avant le post lui-même (FK).
        for r in session.exec(select(Reaction).where(Reaction.post_id == post.id)).all():
            session.delete(r)
        for c in session.exec(select(Comment).where(Comment.post_id == post.id)).all():
            session.delete(c)
        session.delete(post)

    # Relations sociales
    for f in session.exec(
        select(Follow).where(Follow.follower_id == uid)
    ).all():
        session.delete(f)
    for f in session.exec(
        select(Follow).where(Follow.following_id == uid)
    ).all():
        session.delete(f)

    # Lives
    for ls in session.exec(
        select(LiveSession).where(LiveSession.broadcaster_id == uid)
    ).all():
        session.delete(ls)
    for mod in session.exec(
        select(LiveModeration).where(LiveModeration.broadcaster_id == uid)
    ).all():
        session.delete(mod)
    for mod in session.exec(
        select(LiveModeration).where(LiveModeration.target_user_id == uid)
    ).all():
        session.delete(mod)
    for jr in session.exec(
        select(LiveJoinRequest).where(LiveJoinRequest.broadcaster_id == uid)
    ).all():
        session.delete(jr)
    for jr in session.exec(
        select(LiveJoinRequest).where(LiveJoinRequest.user_id == uid)
    ).all():
        session.delete(jr)

    # Messages privés (envoyés ET reçus) — on NE SUPPRIME PAS les lignes,
    # on remplace juste l'identité de la partie supprimée par le sentinel
    # `DELETED_USER_SENTINEL_ID`. L'autre membre garde donc son historique
    # de conversation intact même quand son correspondant est supprimé
    # (sinon les joueurs voient soudainement disparaître des conversations
    # entières — cf. ticket "messages privés se sont supprimés").
    #
    # `conversation_key` reste figée sur l'ancien couple (min|max d'ids).
    # On n'écrira plus jamais dans ce fil côté routeur (`messages.py`
    # refuse d'envoyer à un user-deleted), donc l'historique est gelé et
    # cohérent : lecture OK, écriture KO.
    for dm in session.exec(
        select(DirectMessage).where(DirectMessage.sender_id == uid)
    ).all():
        dm.sender_id = DELETED_USER_SENTINEL_ID
        session.add(dm)
    for dm in session.exec(
        select(DirectMessage).where(DirectMessage.recipient_id == uid)
    ).all():
        dm.recipient_id = DELETED_USER_SENTINEL_ID
        session.add(dm)

    # Gifts — on garde les lignes *envoyées* par ce user (le streamer
    # qui les a reçues compte toujours dessus pour son classement hebdo
    # et son BFF). On anonymise juste le sender_id pour enlever le lien
    # avec le compte disparu : l'agrégation SUM(amount) GROUP BY
    # receiver_id reste intacte, aucun streamer ne perd d'earnings sur
    # son leaderboard. Les lignes *reçues* par ce user peuvent partir
    # (personne d'autre n'en dépend, le receiver n'existe plus).
    for g in session.exec(
        select(GiftLedger).where(GiftLedger.sender_id == uid)
    ).all():
        g.sender_id = GIFT_DELETED_SENDER_ID
        session.add(g)
    for g in session.exec(
        select(GiftLedger).where(GiftLedger.receiver_id == uid)
    ).all():
        session.delete(g)

    # WalletLedger + ShopOrder — on garde l'historique des mouvements
    # wallet et des achats boutique (audit comptable global du site),
    # on anonymise juste le user_id. Sans ça, la somme des deltas par
    # pot deviendrait incohérente à chaque suppression de compte. Import
    # local pour éviter le cycle admin ↔ users via models.
    from ..models import ShopOrder as _ShopOrder
    from ..models import WalletLedger as _WalletLedger

    for wl in session.exec(
        select(_WalletLedger).where(_WalletLedger.user_id == uid)
    ).all():
        wl.user_id = DELETED_USER_SENTINEL_ID
        session.add(wl)
    for so in session.exec(
        select(_ShopOrder).where(_ShopOrder.user_id == uid)
    ).all():
        so.user_id = DELETED_USER_SENTINEL_ID
        session.add(so)

    # Signalements posés par le user (les signalements *contre* lui
    # restent — ils ont une valeur historique pour la modération).
    for rep in session.exec(
        select(Report).where(Report.reporter_id == uid)
    ).all():
        session.delete(rep)

    # Enfin le credential et le profil
    if cred is not None:
        session.delete(cred)
    session.delete(user)


@router.delete(
    "/users/{user_id}",
    response_model=HardDeleteOut,
)
def hard_delete_user(
    user_id: str,
    body: HardDeleteIn,
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> HardDeleteOut:
    """Supprime définitivement un compte et toutes ses données liées.

    Destructif : cette action **ne peut pas être annulée**. À réserver aux
    cas de demande RGPD, doublon, ou compte créé par erreur. Pour une
    simple sanction, utiliser `POST /admin/users/{user_id}/ban`.

    Protections :
      - comptes officiels seedés (`PROTECTED_USER_IDS`) → 400
      - auto-suppression interdite → 400
      - autre admin → 400 (retirer le rôle d'abord)
      - confirm_username doit matcher le pseudo exact du user
    """
    user = _user_or_404(session, user_id)
    if user.id in PROTECTED_USER_IDS:
        raise HTTPException(400, "Compte officiel protégé — suppression interdite.")
    if user.id == admin.id:
        raise HTTPException(400, "Tu ne peux pas supprimer ton propre compte depuis ici.")
    if user.role == "admin":
        raise HTTPException(
            400,
            "Impossible de supprimer un autre admin. Retire-lui d'abord le rôle.",
        )
    if body.confirm_username.strip() != user.username:
        raise HTTPException(
            400,
            "Le pseudo de confirmation ne correspond pas au compte ciblé.",
        )

    cred = session.get(Credential, user.id)
    email = cred.email if cred else None
    username = user.username

    # Log AVANT la suppression pour que `target_username` capture le
    # pseudo final (après la suppression, l'objet n'existe plus).
    _log_action(
        session,
        actor=admin,
        target=user,
        action="hard_delete",
        details={"email": email, "reason": body.reason},
    )
    _hard_delete_user(session, user, cred)
    session.commit()
    return HardDeleteOut(userId=user_id, username=username, email=email)


# --- Journal d'audit -------------------------------------------------------


@router.get("/audit-log", response_model=list[AuditLogOut])
def list_audit_log(
    limit: int = Query(200, ge=1, le=1000),
    target_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> list[AuditLogOut]:
    stmt = select(AdminAuditLog)
    if target_id:
        stmt = stmt.where(AdminAuditLog.target_id == target_id)
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
    rows = session.exec(stmt).all()
    rows.sort(key=lambda e: e.created_at, reverse=True)
    return [_audit_out(e) for e in rows[:limit]]


# --- PR K : signalements ---------------------------------------------------


VALID_TARGET_TYPES: set[str] = {"user", "live", "post", "comment"}
VALID_REASONS: set[str] = {
    "spam",
    "harcelement",
    "contenu_sensible",
    "triche",
    "usurpation",
    "autre",
}
VALID_STATUSES: set[str] = {"open", "resolved", "rejected"}


class ReportIn(BaseModel):
    targetType: str
    targetId: str
    targetLabel: str = ""
    targetUrl: str = ""
    reason: str
    description: str = ""


class ReportOut(BaseModel):
    id: int
    reporterId: str
    reporterUsername: str
    targetType: str
    targetId: str
    targetLabel: str
    targetUrl: str
    reason: str
    description: str
    status: str
    resolvedBy: Optional[str]
    resolvedAt: Optional[str]
    createdAt: str


def _report_out(r: Report) -> ReportOut:
    return ReportOut(
        id=r.id or 0,
        reporterId=r.reporter_id,
        reporterUsername=r.reporter_username,
        targetType=r.target_type,
        targetId=r.target_id,
        targetLabel=r.target_label or "",
        targetUrl=r.target_url or "",
        reason=r.reason,
        description=r.description or "",
        status=r.status,
        resolvedBy=r.resolved_by,
        resolvedAt=r.resolved_at,
        createdAt=r.created_at,
    )


class ReportStatusIn(BaseModel):
    status: str


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    status_filter: Optional[str] = Query(None, alias="status"),
    target_type: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> list[ReportOut]:
    stmt = select(Report)
    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise HTTPException(400, f"Statut invalide. Valeurs : {sorted(VALID_STATUSES)}.")
        stmt = stmt.where(Report.status == status_filter)
    if target_type:
        if target_type not in VALID_TARGET_TYPES:
            raise HTTPException(400, f"Type invalide. Valeurs : {sorted(VALID_TARGET_TYPES)}.")
        stmt = stmt.where(Report.target_type == target_type)
    rows = session.exec(stmt).all()
    rows.sort(key=lambda r: r.created_at, reverse=True)
    return [_report_out(r) for r in rows[:limit]]


@router.get("/reports/stats")
def reports_stats(
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> dict:
    rows = session.exec(select(Report)).all()
    by_status = {"open": 0, "resolved": 0, "rejected": 0}
    by_type = {"user": 0, "live": 0, "post": 0, "comment": 0}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_type[r.target_type] = by_type.get(r.target_type, 0) + 1
    return {"total": len(rows), "byStatus": by_status, "byType": by_type}


# --- Nettoyage comptes non-vérifiés ----------------------------------------

# Ids de comptes qu'on refuse absolument de supprimer, même si leur
# `email_verified_at` est NULL pour une raison inattendue (avatar seed
# créé avant une migration de schema, par ex.). Source de vérité :
# `OFFICIAL_ACCOUNTS` dans `app/main.py`.
PROTECTED_USER_IDS: set[str] = {
    "user-dreyna",
    "user-kamestars",
    "user-roi-des-zems",
}

# Alias rétro-compat — la constante "officielle" est
# `DELETED_USER_SENTINEL_ID` (définie tout en haut du module pour pouvoir
# être référencée dès `_hard_delete_user`). Le même sentinel est posé
# sur :
#   - `GiftLedger.sender_id` (le total reçu du streamer côté classement
#     hebdo / BFF ne doit pas baisser quand on supprime le payeur)
#   - `DirectMessage.sender_id` / `recipient_id` (les messages restent
#     visibles à l'autre partie même quand son correspondant est supprimé)
GIFT_DELETED_SENDER_ID = DELETED_USER_SENTINEL_ID


class UnverifiedAccountOut(BaseModel):
    userId: str
    # Null quand il n'y a plus de UserProfile pour ce user_id (credential
    # orphelin à purger).
    username: Optional[str]
    email: Optional[str]
    # Null quand il n'y a plus de UserProfile (créé_at inconnu,
    # on retombe sur `Credential.created_at`).
    createdAt: str
    orphan: bool = False


class CleanupUnverifiedOut(BaseModel):
    dryRun: bool
    count: int
    deleted: list[UnverifiedAccountOut]


def _list_unverified(
    session: Session,
) -> list[tuple[Optional[UserProfile], Credential]]:
    """Retourne les `(UserProfile | None, Credential)` dont l'email n'a
    jamais été vérifié. Exclut les comptes protégés (officiels seedés) et
    tout compte avec un rôle admin. Si le `UserProfile` correspondant
    n'existe plus (credential orphelin), on retourne quand même la ligne
    pour qu'elle puisse être purgée."""
    creds = session.exec(
        select(Credential).where(Credential.email_verified_at.is_(None))  # type: ignore[union-attr]
    ).all()
    out: list[tuple[Optional[UserProfile], Credential]] = []
    for cred in creds:
        if cred.user_id in PROTECTED_USER_IDS:
            continue
        profile = session.get(UserProfile, cred.user_id)
        if profile is not None and (profile.role or "user") == "admin":
            # Parachute : jamais de suppression d'un admin, même non vérifié.
            continue
        out.append((profile, cred))
    out.sort(
        key=lambda pair: (pair[0].created_at if pair[0] else pair[1].created_at)
        or ""
    )
    return out


@router.get(
    "/cleanup/unverified",
    response_model=CleanupUnverifiedOut,
)
def list_unverified_accounts(
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> CleanupUnverifiedOut:
    """Dry-run : liste les comptes qui seraient supprimés par POST
    `/admin/cleanup/unverified`. Pas d'effet de bord."""
    rows = _list_unverified(session)
    return CleanupUnverifiedOut(
        dryRun=True,
        count=len(rows),
        deleted=[
            UnverifiedAccountOut(
                userId=cred.user_id,
                username=profile.username if profile else None,
                email=cred.email,
                createdAt=(profile.created_at if profile else cred.created_at)
                or cred.created_at,
                orphan=profile is None,
            )
            for profile, cred in rows
        ],
    )


@router.post(
    "/cleanup/unverified",
    response_model=CleanupUnverifiedOut,
)
def delete_unverified_accounts(
    admin: UserProfile = Depends(require_architect),
    session: Session = Depends(_session_dep),
) -> CleanupUnverifiedOut:
    """Supprime définitivement les comptes dont l'email n'a jamais été
    vérifié. Exclut les comptes officiels seedés et tout compte admin.

    Supprime en cascade : `UserProfile`, `Credential`, `AuthSession`,
    `EmailVerificationToken`, `PasswordResetToken`, `LoginAttempt`
    (lignes rattachées à l'user par `user_id`).
    """
    pairs = _list_unverified(session)
    deleted_out: list[UnverifiedAccountOut] = []
    for profile, cred in pairs:
        uid = cred.user_id
        username = profile.username if profile else None
        created_at = (
            (profile.created_at if profile else cred.created_at) or cred.created_at
        )
        for token in session.exec(
            select(EmailVerificationToken).where(
                EmailVerificationToken.user_id == uid,
            )
        ).all():
            session.delete(token)
        for token in session.exec(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == uid,
            )
        ).all():
            session.delete(token)
        for auth_s in session.exec(
            select(AuthSession).where(AuthSession.user_id == uid)
        ).all():
            session.delete(auth_s)
        for attempt in session.exec(
            select(LoginAttempt).where(LoginAttempt.user_id == uid)
        ).all():
            session.delete(attempt)
        session.delete(cred)
        if profile is not None:
            session.delete(profile)
        deleted_out.append(
            UnverifiedAccountOut(
                userId=uid,
                username=username,
                email=cred.email,
                createdAt=created_at,
                orphan=profile is None,
            )
        )
        # _log_action exige un target UserProfile ; pour les orphelins on
        # forge un objet léger mémoire-only (jamais persisté) avec les
        # infos qu'on a, pour ne pas perdre la trace dans l'audit log.
        audit_target = profile or UserProfile(
            id=uid,
            username=username or f"(orphelin:{uid})",
            creature_id=None,
        )
        _log_action(
            session,
            actor=admin,
            target=audit_target,
            action="cleanup_unverified_delete",
            details={
                "email": cred.email,
                "createdAt": created_at,
                "orphan": profile is None,
            },
        )
    session.commit()
    return CleanupUnverifiedOut(
        dryRun=False,
        count=len(deleted_out),
        deleted=deleted_out,
    )


@router.patch("/reports/{report_id}", response_model=ReportOut)
def update_report_status(
    report_id: int,
    body: ReportStatusIn,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> ReportOut:
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Statut invalide. Valeurs : {sorted(VALID_STATUSES)}.")
    r = session.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Signalement introuvable.")
    r.status = body.status
    if body.status in {"resolved", "rejected"}:
        r.resolved_by = admin.id
        r.resolved_at = _now_iso()
    else:
        r.resolved_by = None
        r.resolved_at = None
    session.add(r)
    session.commit()
    session.refresh(r)
    return _report_out(r)
