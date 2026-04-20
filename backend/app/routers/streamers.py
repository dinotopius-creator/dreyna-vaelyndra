"""Endpoints du module Communauté : classement des streamers + BFF.

Les deux modules s'appuient sur la table `GiftLedger` (cf. `models.py`) :
chaque cadeau Sylvins envoyé via `POST /users/{id}/gift-sylvins` y laisse
une ligne. Le classement et les BFF sont calculés à la volée par agrégation
sur la plage `[week_start, week_start + 7j)`.

Choix délibéré d'éviter les snapshots figés :
- La source de vérité est le ledger — pas besoin de cron de reset
  hebdomadaire, la "semaine dernière" est juste un filtre WHERE différent.
- Si la plateforme grossit, on pourra ajouter une table `WeeklySnapshot`
  dénormalisée (calculée une fois par semaine) pour servir les lectures
  historiques en O(1). Aujourd'hui la volumétrie reste trop faible pour
  justifier cette complexité.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import GiftLedger, UserProfile
from ..schemas import (
    BFFEntryOut,
    CreatureOut,
    StreamerLeaderboardEntryOut,
    StreamerLeaderboardOut,
)
from ..creatures import get_creature


router = APIRouter(prefix="/streamers", tags=["streamers"])


def _session_dep():
    with get_session() as session:
        yield session


def iso_week_start(dt: datetime | None = None) -> date:
    """Retourne le lundi UTC de la semaine ISO contenant `dt`.

    Semaine lundi 00:00 UTC → dimanche 23:59:59 UTC (norme ISO 8601).
    """
    dt = dt or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    d = dt.astimezone(timezone.utc).date()
    return d - timedelta(days=d.weekday())


def _creature_dto(creature_id: str | None) -> CreatureOut | None:
    c = get_creature(creature_id)
    if c is None:
        return None
    return CreatureOut(**c)


def _pick_week_start(week: str) -> tuple[date, date]:
    """Retourne (cible, reference_this_week) pour le filtre demandé."""
    this_week = iso_week_start()
    if week == "last":
        return this_week - timedelta(days=7), this_week
    return this_week, this_week


@router.get("/leaderboard", response_model=StreamerLeaderboardOut)
def streamer_leaderboard(
    week: Literal["this", "last"] = Query("this"),
    limit: int = Query(50, ge=1, le=100),
    session: Session = Depends(_session_dep),
) -> StreamerLeaderboardOut:
    """Classement des streamers par Sylvins reçus sur la semaine demandée.

    - `week=this` (défaut) : semaine ISO en cours, mise à jour instantanée
      dès qu'un don est enregistré (lecture directe sur le ledger).
    - `week=last` : semaine précédente, figée (aucun don n'est plus
      rattaché à cette plage).

    Retourne au max `limit` entrées (50 par défaut, 100 max). Les streamers
    sans aucun don sur la période ne sont pas inclus (performance :
    seulement les receivers présents dans le ledger de la semaine).
    """
    start, _ = _pick_week_start(week)
    end = start + timedelta(days=7)

    # Agrégation SQL directe : somme des amounts par receiver_id.
    stmt = (
        select(
            GiftLedger.receiver_id,
            func.sum(GiftLedger.amount).label("total"),
        )
        .where(GiftLedger.week_start_iso == start.isoformat())
        .group_by(GiftLedger.receiver_id)
        .order_by(func.sum(GiftLedger.amount).desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()

    # Enrichit avec les profils (1 seule requête, clé primaire).
    receiver_ids = [r[0] for r in rows]
    profiles: dict[str, UserProfile] = {}
    if receiver_ids:
        profile_rows = session.exec(
            select(UserProfile).where(UserProfile.id.in_(receiver_ids))
        ).all()
        profiles = {p.id: p for p in profile_rows}

    entries: list[StreamerLeaderboardEntryOut] = []
    for rank, (receiver_id, total) in enumerate(rows, start=1):
        p = profiles.get(receiver_id)
        if p is None:
            # Le receiver a été supprimé — on garde la ligne avec un nom
            # de fallback pour ne pas casser le classement.
            entries.append(
                StreamerLeaderboardEntryOut(
                    rank=rank,
                    userId=receiver_id,
                    username="(compte supprimé)",
                    avatarImageUrl="",
                    totalSylvins=int(total or 0),
                    creature=None,
                    role="user",
                )
            )
            continue
        entries.append(
            StreamerLeaderboardEntryOut(
                rank=rank,
                userId=p.id,
                username=p.username,
                avatarImageUrl=p.avatar_image_url,
                totalSylvins=int(total or 0),
                creature=_creature_dto(p.creature_id),
                role=p.role or "user",
            )
        )
    # `end` est le lundi suivant (exclusif côté ledger). On expose au
    # client le dimanche de la semaine demandée (inclusif) pour que
    # l'intervalle affiché [weekStart, weekEnd] soit intuitivement
    # "lundi → dimanche". NB : `date - timedelta(seconds=1)` est un no-op
    # (timedelta.days == 0), il faut bien passer par `days=1`.
    return StreamerLeaderboardOut(
        week=week,
        weekStart=start.isoformat(),
        weekEnd=(end - timedelta(days=1)).isoformat(),
        entries=entries,
    )


@router.get("/bff", response_model=List[BFFEntryOut])
def streamers_bff(
    week: Literal["this", "last", "all"] = Query("all"),
    limit: int = Query(20, ge=1, le=100),
    session: Session = Depends(_session_dep),
) -> List[BFFEntryOut]:
    """Liste les duos BFF : pour chaque streamer top, son plus gros donateur.

    - `week=all` (défaut) : BFF calculé sur l'intégralité de l'historique,
      pour une relation stable et meaningful ("best friend forever" →
      tout-temps par défaut).
    - `week=this|last` : BFF réduit à la semaine demandée (utile pour
      afficher un duo contextuel sur la "Cette semaine" du classement).

    Retourne jusqu'à `limit` duos, triés par montant donné (décroissant).
    Chaque streamer apparaît au plus une fois (son plus gros donateur
    uniquement).
    """
    # 1. Agrégation (receiver, sender) → somme donnée.
    stmt = select(
        GiftLedger.receiver_id,
        GiftLedger.sender_id,
        func.sum(GiftLedger.amount).label("total"),
    ).group_by(GiftLedger.receiver_id, GiftLedger.sender_id)

    if week != "all":
        start, _ = _pick_week_start(week)
        stmt = stmt.where(GiftLedger.week_start_iso == start.isoformat())

    rows = session.exec(stmt).all()

    # 2. Pour chaque receiver, garder le couple (sender, total) maximal.
    best_by_receiver: dict[str, tuple[str, int]] = {}
    for receiver_id, sender_id, total in rows:
        amount = int(total or 0)
        current = best_by_receiver.get(receiver_id)
        if current is None or amount > current[1]:
            best_by_receiver[receiver_id] = (sender_id, amount)

    if not best_by_receiver:
        return []

    # 3. Tri + limit.
    pairs = sorted(
        best_by_receiver.items(),
        key=lambda item: item[1][1],
        reverse=True,
    )[:limit]

    # 4. Hydrate les profils en 1 seule requête.
    user_ids: set[str] = set()
    for receiver_id, (sender_id, _amount) in pairs:
        user_ids.add(receiver_id)
        user_ids.add(sender_id)
    profile_rows = session.exec(
        select(UserProfile).where(UserProfile.id.in_(list(user_ids)))
    ).all()
    profiles = {p.id: p for p in profile_rows}

    def _mini(user_id: str) -> dict:
        p = profiles.get(user_id)
        if p is None:
            return {
                "id": user_id,
                "username": "(compte supprimé)",
                "avatarImageUrl": "",
                "creature": None,
                "role": "user",
            }
        return {
            "id": p.id,
            "username": p.username,
            "avatarImageUrl": p.avatar_image_url,
            "creature": _creature_dto(p.creature_id),
            "role": p.role or "user",
        }

    out: list[BFFEntryOut] = []
    for receiver_id, (sender_id, amount) in pairs:
        out.append(
            BFFEntryOut(
                streamer=_mini(receiver_id),
                donor=_mini(sender_id),
                totalSylvins=amount,
            )
        )
    return out


__all__ = ["router", "iso_week_start"]
