"""Endpoints publics pour signaler du contenu (PR K).

Tout user connecté peut envoyer un signalement via `POST /reports`. Un
utilisateur peut signaler la même cible plusieurs fois — on déduplique
par (reporter_id, target_type, target_id, jour_iso) pour éviter le spam
de reports mais laisser possible de ré-signaler après une journée si la
situation perdure.

La lecture + la fermeture des reports sont côté `/admin/reports` (cf.
`routers/admin.py`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..auth.dependencies import require_auth
from ..db import get_session
from ..models import Report, UserProfile


router = APIRouter(prefix="/reports", tags=["reports"])


def _session_dep():
    with get_session() as session:
        yield session


VALID_TARGET_TYPES: set[str] = {"user", "live", "post", "comment"}
VALID_REASONS: set[str] = {
    "spam",
    "harcelement",
    "contenu_sensible",
    "triche",
    "usurpation",
    "autre",
}


class ReportCreateIn(BaseModel):
    targetType: str
    targetId: str
    targetLabel: str = ""
    targetUrl: str = ""
    reason: str
    description: str = Field(default="", max_length=2000)


class ReportCreateOut(BaseModel):
    id: int
    createdAt: str


@router.post("", response_model=ReportCreateOut, status_code=201)
def create_report(
    body: ReportCreateIn,
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> ReportCreateOut:
    if body.targetType not in VALID_TARGET_TYPES:
        raise HTTPException(
            400, f"Type invalide. Valeurs : {sorted(VALID_TARGET_TYPES)}."
        )
    if body.reason not in VALID_REASONS:
        raise HTTPException(
            400, f"Motif invalide. Valeurs : {sorted(VALID_REASONS)}."
        )
    if body.targetType == "user" and body.targetId == user.id:
        raise HTTPException(400, "Impossible de te signaler toi-même.")

    # Déduplication : on évite qu'un même user puisse spam-signaler la même
    # cible plusieurs fois le même jour. Si un report existe déjà aujourd'hui
    # et qu'il est encore `open`, on renvoie 200 avec l'existant.
    today_prefix = datetime.now(timezone.utc).date().isoformat()
    existing = session.exec(
        select(Report).where(
            Report.reporter_id == user.id,
            Report.target_type == body.targetType,
            Report.target_id == body.targetId,
            Report.status == "open",
        )
    ).all()
    for r in existing:
        if (r.created_at or "").startswith(today_prefix):
            return ReportCreateOut(id=r.id or 0, createdAt=r.created_at)

    entry = Report(
        reporter_id=user.id,
        reporter_username=user.username,
        target_type=body.targetType,
        target_id=body.targetId,
        target_label=body.targetLabel or "",
        target_url=body.targetUrl or "",
        reason=body.reason,
        description=body.description or "",
        status="open",
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return ReportCreateOut(id=entry.id or 0, createdAt=entry.created_at)


@router.get("/mine", response_model=list[dict])
def list_my_reports(
    user: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> list[dict]:
    rows = session.exec(
        select(Report).where(Report.reporter_id == user.id)
    ).all()
    rows.sort(key=lambda r: r.created_at, reverse=True)
    return [
        {
            "id": r.id,
            "targetType": r.target_type,
            "targetId": r.target_id,
            "targetLabel": r.target_label,
            "targetUrl": r.target_url,
            "reason": r.reason,
            "description": r.description,
            "status": r.status,
            "createdAt": r.created_at,
        }
        for r in rows[:100]
    ]
