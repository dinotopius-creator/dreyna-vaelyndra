"""Service de gain d'XP pour le familier actif (PR familiers#2).

Module **séparé** du router pour éviter les cycles d'import (les routers
sociaux — posts, users, lives — importent ce service pour grant l'XP sans
avoir à connaître le router familiers et ses DTOs Pydantic).

Conventions :
- Tous les helpers prennent une `Session` et **ne commitent pas** : c'est
  l'appelant qui décide quand commiter (atomicité avec l'action sociale).
- Si l'utilisateur n'a pas encore choisi de familier actif (cas typique
  pendant la phase de migration / avant l'onboarding obligatoire de PR 3),
  on **skip silencieusement** sans lever. Le frontend pousse plus tard les
  utilisateurs à choisir un familier mais on ne casse pas leurs actions
  sociales entre-temps.
- Chaque grant écrit une ligne `FamiliarXPLedger` (append-only) avec
  `reason` (taxonomie figée) et `reference_id` (id stable pour idempotence
  potentielle future).
- Anti-farm : cap journalier par `reason` (cf. SOCIAL_XP_RULES). Si le cap
  est atteint, on grant 0 sans erreur.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from .familiars import (
    GIFT_RECEIVED_DAILY_CAP,
    GIFT_SENT_DAILY_CAP,
    SOCIAL_XP_RULES,
    gift_received_xp,
    gift_sent_xp,
)
from .models import FamiliarXPLedger, UserFamiliar


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_utc_prefix() -> str:
    """Préfixe ISO du jour courant (UTC). Utilisé pour la requête de cap."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _active_familiar(session: Session, user_id: str) -> Optional[UserFamiliar]:
    return session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .where(UserFamiliar.is_active == True)  # noqa: E712
    ).first()


def _xp_granted_today(
    session: Session, user_id: str, reason_prefix: str
) -> int:
    """Total XP grant aujourd'hui pour un user et une famille de raisons.

    `reason_prefix` peut matcher exactement (`social:post:created`) ou être
    un préfixe (`social:gift:received:`) pour cumuler plusieurs sources.
    """
    today = _today_utc_prefix()
    total = session.exec(
        select(func.coalesce(func.sum(FamiliarXPLedger.delta_xp), 0))
        .where(FamiliarXPLedger.user_id == user_id)
        .where(FamiliarXPLedger.reason.like(f"{reason_prefix}%"))  # type: ignore[attr-defined]
        .where(FamiliarXPLedger.created_at.like(f"{today}%"))  # type: ignore[attr-defined]
    ).one()
    return int(total or 0)


def _grant(
    session: Session,
    user_id: str,
    amount: int,
    reason: str,
    reference_id: Optional[str] = None,
) -> int:
    """Coeur du grant — applique l'amount **déjà capé**.

    Retourne le montant réellement crédité (0 si pas de familier actif ou
    amount ≤ 0).
    """
    if amount <= 0:
        return 0
    active = _active_familiar(session, user_id)
    if active is None:
        return 0
    active.xp = max(0, (active.xp or 0) + amount)
    active.last_active_at = _now_iso()
    session.add(active)
    session.add(
        FamiliarXPLedger(
            user_id=user_id,
            user_familiar_id=active.id or 0,
            familiar_id=active.familiar_id,
            delta_xp=amount,
            xp_after=active.xp,
            reason=reason,
            reference_id=reference_id,
        )
    )
    return amount


def grant_social_xp(
    session: Session,
    user_id: str,
    reason: str,
    reference_id: Optional[str] = None,
) -> int:
    """Grant XP pour une action sociale figée dans `SOCIAL_XP_RULES`.

    `reason` doit être une clé du dict (ex. `social:post:created`). Le cap
    quotidien par `reason` est appliqué : si le user a déjà gagné `>= cap`
    aujourd'hui pour cette raison, on renvoie 0 sans rien insérer.
    """
    rule = SOCIAL_XP_RULES.get(reason)
    if rule is None:
        return 0
    amount = int(rule["amount"])
    cap = int(rule["daily_cap"])
    already = _xp_granted_today(session, user_id, reason)
    remaining = max(0, cap - already)
    if remaining <= 0:
        return 0
    grant_amount = min(amount, remaining)
    return _grant(session, user_id, grant_amount, reason, reference_id)


def grant_gift_received_xp(
    session: Session,
    user_id: str,
    amount_sylvins: int,
    reference_id: Optional[str] = None,
) -> int:
    """Grant XP pour un cadeau Sylvins (ou item équivalent) reçu.

    Cumulé avec un cap **par jour** de `GIFT_RECEIVED_DAILY_CAP` XP — un
    streamer ne progresse pas plus vite que ce plafond même si la donation
    journalière dépasse. (Sa progression `streamer_xp` reste linéaire en
    parallèle ; on capte juste la progression du familier ici.)
    """
    raw = gift_received_xp(amount_sylvins)
    if raw <= 0:
        return 0
    already = _xp_granted_today(session, user_id, "social:gift:received")
    remaining = max(0, GIFT_RECEIVED_DAILY_CAP - already)
    if remaining <= 0:
        return 0
    return _grant(
        session,
        user_id,
        min(raw, remaining),
        "social:gift:received:sylvins",
        reference_id,
    )


def grant_gift_sent_xp(
    session: Session,
    user_id: str,
    amount_sylvins: int,
    reference_id: Optional[str] = None,
) -> int:
    """Grant XP pour un cadeau envoyé (encourage la générosité)."""
    raw = gift_sent_xp(amount_sylvins)
    if raw <= 0:
        return 0
    already = _xp_granted_today(session, user_id, "social:gift:sent")
    remaining = max(0, GIFT_SENT_DAILY_CAP - already)
    if remaining <= 0:
        return 0
    return _grant(
        session,
        user_id,
        min(raw, remaining),
        "social:gift:sent:sylvins",
        reference_id,
    )
