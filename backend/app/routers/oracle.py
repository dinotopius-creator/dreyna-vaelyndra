"""Mini-jeu Oracle des Runes : gains journaliers Lueurs / Sylvins."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import OracleGameSession, UserProfile
from ..schemas import (
    OracleHistoryEntryOut,
    OraclePlayIn,
    OraclePlayOut,
    OracleRewardOut,
    OracleStatusOut,
)

router = APIRouter(prefix="/oracle", tags=["oracle"])

MAX_DAILY_PLAYS = 3
VALID_RUNES = {"lune", "flamme", "couronne"}
REWARD_TABLE: list[tuple[int, str, int, str, str]] = [
    (34, "lueurs", 15, "15 lueurs captees", "soft"),
    (26, "lueurs", 25, "25 lueurs reveillees", "soft"),
    (17, "lueurs", 40, "40 lueurs scellees", "bright"),
    (9, "lueurs", 70, "70 lueurs astrales", "bright"),
    (5, "lueurs", 120, "120 lueurs royales", "epic"),
    (8, "none", 0, "Le voile reste silencieux", "void"),
    (1, "sylvins", 1, "1 Sylvin ancestral", "legend"),
]


def _session_dep():
    with get_session() as session:
        yield session


def _day_key(now: Optional[datetime] = None) -> str:
    current = (now or datetime.now(UTC)).astimezone(UTC)
    return current.strftime("%Y-%m-%d")


def _roll_reward() -> OracleRewardOut:
    roll = secrets.randbelow(100) + 1
    cursor = 0
    for weight, currency, amount, label, tone in REWARD_TABLE:
        cursor += weight
        if roll <= cursor:
            return OracleRewardOut(
                currency=currency,
                amount=amount,
                label=label,
                tone=tone,
            )
    weight, currency, amount, label, tone = REWARD_TABLE[-1]
    return OracleRewardOut(
        currency=currency,
        amount=amount,
        label=label,
        tone=tone,
    )


def _serialize_history(row: OracleGameSession) -> OracleHistoryEntryOut:
    tone = "void" if row.reward_currency == "none" else "soft"
    if row.reward_currency == "lueurs" and row.reward_amount >= 70:
        tone = "epic" if row.reward_amount >= 120 else "bright"
    if row.reward_currency == "sylvins":
        tone = "legend"
    return OracleHistoryEntryOut(
        id=int(row.id or 0),
        runeKey=row.rune_key,
        reward=OracleRewardOut(
            currency=row.reward_currency,
            amount=row.reward_amount,
            label=row.reward_label,
            tone=tone,
        ),
        createdAt=row.created_at,
    )


def _recent_history(
    session: Session,
    user_id: str,
    limit: int = 6,
) -> list[OracleHistoryEntryOut]:
    rows = session.exec(
        select(OracleGameSession)
        .where(OracleGameSession.user_id == user_id)
        .order_by(OracleGameSession.created_at.desc())
        .limit(limit)
    ).all()
    return [_serialize_history(row) for row in rows]


@router.get("/status", response_model=OracleStatusOut)
def get_oracle_status(
    user_id: str = Query(..., min_length=1, max_length=128),
    session: Session = Depends(_session_dep),
) -> OracleStatusOut:
    profile = session.get(UserProfile, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    day_key = _day_key()
    used_today = len(
        session.exec(
            select(OracleGameSession)
            .where(OracleGameSession.user_id == user_id)
            .where(OracleGameSession.day_key == day_key)
        ).all()
    )
    plays_left = max(0, MAX_DAILY_PLAYS - used_today)
    return OracleStatusOut(
        dayKey=day_key,
        playsUsedToday=used_today,
        playsLeftToday=plays_left,
        maxDailyPlays=MAX_DAILY_PLAYS,
        canPlay=plays_left > 0 and profile.banned_at is None,
        recentHistory=_recent_history(session, user_id),
    )


@router.post("/play", response_model=OraclePlayOut)
def play_oracle(
    payload: OraclePlayIn,
    session: Session = Depends(_session_dep),
) -> OraclePlayOut:
    if payload.rune_key not in VALID_RUNES:
        raise HTTPException(status_code=400, detail="Rune inconnue.")

    profile = session.get(UserProfile, payload.user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if profile.banned_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte suspendu.",
        )

    day_key = _day_key()
    used_today = len(
        session.exec(
            select(OracleGameSession)
            .where(OracleGameSession.user_id == payload.user_id)
            .where(OracleGameSession.day_key == day_key)
        ).all()
    )
    if used_today >= MAX_DAILY_PLAYS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rituel journalier deja epuise.",
        )

    reward = _roll_reward()
    if reward.currency == "lueurs":
        profile.lueurs += reward.amount
    elif reward.currency == "sylvins":
        # Gain gratuit = pot promo, non retirable.
        profile.sylvins += reward.amount

    entry = OracleGameSession(
        user_id=payload.user_id,
        day_key=day_key,
        rune_key=payload.rune_key,
        reward_currency=reward.currency,
        reward_amount=reward.amount,
        reward_label=reward.label,
    )
    session.add(entry)
    session.add(profile)
    session.commit()
    session.refresh(entry)
    session.refresh(profile)

    plays_used = used_today + 1
    plays_left = max(0, MAX_DAILY_PLAYS - plays_used)
    return OraclePlayOut(
        dayKey=day_key,
        playsUsedToday=plays_used,
        playsLeftToday=plays_left,
        reward=reward,
        profileLueurs=profile.lueurs,
        profileSylvinsPromo=profile.sylvins,
        recentHistory=_recent_history(session, payload.user_id),
    )
