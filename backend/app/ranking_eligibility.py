"""Eligibility helpers for public social rankings.

Public leaderboards reward community activity and creator support. Staff and
internal accounts can use the platform, but they must not compete with regular
members or receive public ranking rewards.
"""
from __future__ import annotations

from .models import UserProfile


PUBLIC_RANKING_EXCLUDED_ROLES = {
    "admin",
    "administrateur",
    "administratrice",
    "administrator",
    "animator",
    "architect",
    "architecte",
    "dev",
    "dev_platform",
    "developer",
    "founder",
    "internal",
    "manager",
    "moderator",
    "modérateur",
    "operator",
    "owner",
    "platform_developer",
    "queen",
    "staff",
    "super_admin",
    "support",
}


def is_public_ranking_member(profile: UserProfile | None) -> bool:
    """Return True only for active regular members eligible for public rankings."""
    if profile is None or profile.banned_at is not None:
        return False
    role = (profile.role or "user").strip().lower()
    return role not in PUBLIC_RANKING_EXCLUDED_ROLES
