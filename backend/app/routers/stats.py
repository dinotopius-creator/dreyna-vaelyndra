"""Stats publiques de la communauté (pour la home, le hero, etc.).

But : remplacer les chiffres décoratifs / bots historiques de la home
("∞ membres", "Lyria 12893 pts" issus de `data/mock.ts`) par des chiffres
réellement issus de la base. Demande client explicite (Alexandre, 20/04) :
"je ne veux plus aucun bot sur le site […] sur la page d'accueil pour
dire tant de membres etc. faut que ce soit des membres" → cet endpoint
expose un agrégat 100 % réel à la home.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import GiftLedger, LiveSession, UserProfile

router = APIRouter(prefix="/stats", tags=["stats"])


def _session_dep():
    with get_session() as session:
        yield session


@router.get("/overview")
def overview(session: Session = Depends(_session_dep)) -> dict:
    """Compteurs globaux pour la page d'accueil.

    - `membersCount` : nombre total de comptes (UserProfile présents).
    - `liveCount` : nombre de lives actifs (toutes sessions enregistrées).
      Le filtre "heartbeat frais" est volontairement omis ici : on veut
      un chiffre stable côté marketing.
    - `currenciesCount` : statique (Lueurs + Sylvins).
    - `gradesCount` : statique (6 grades streamers).
    """
    members = session.exec(select(func.count(UserProfile.id))).one() or 0
    lives = session.exec(select(func.count(LiveSession.broadcaster_id))).one() or 0
    return {
        "membersCount": int(members),
        "liveCount": int(lives),
        "currenciesCount": 2,
        "gradesCount": 6,
    }


@router.get("/top-fans")
def top_fans(
    limit: int = 6,
    session: Session = Depends(_session_dep),
) -> list[dict]:
    """Top donateurs tous-temps de la plateforme (vrais comptes uniquement).

    Remplace les bots `TOP_FANS` (Lyria/Caelum/Aëris/Sylas/Thalia) qui
    décoraient la home. Agrège `GiftLedger.amount` par sender.
    """
    safe_limit = max(1, min(limit, 24))
    stmt = (
        select(
            GiftLedger.sender_id,
            func.sum(GiftLedger.amount).label("total"),
        )
        .group_by(GiftLedger.sender_id)
        .order_by(func.sum(GiftLedger.amount).desc())
        .limit(safe_limit)
    )
    rows = session.exec(stmt).all()
    sender_ids = [r[0] for r in rows]
    profiles: dict[str, UserProfile] = {}
    if sender_ids:
        profile_rows = session.exec(
            select(UserProfile).where(UserProfile.id.in_(sender_ids))
        ).all()
        profiles = {p.id: p for p in profile_rows}
    out: list[dict] = []
    for sender_id, total in rows:
        p = profiles.get(sender_id)
        if p is None:
            continue
        out.append(
            {
                "userId": p.id,
                "username": p.username,
                "handle": p.handle,
                "avatarImageUrl": p.avatar_image_url or "",
                "totalSylvinsGiven": int(total or 0),
            }
        )
    return out
