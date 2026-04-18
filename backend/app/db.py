"""Couche SQLite (SQLModel) pour le backend Vaelyndra.

Le fichier SQLite est placé sur un volume Fly.io (/data) en production afin
de survivre aux redéploiements. En local, il vit à la racine du backend.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlmodel import SQLModel, create_engine, Session

# En prod Fly, un volume persistant est monté sur /data — on y pose la base
# si le dossier existe afin de survivre aux redéploiements. En local on
# retombe sur un fichier à la racine du backend.
_FLY_VOLUME = Path("/data")
_DEFAULT_DB_PATH = (
    _FLY_VOLUME / "vaelyndra.db"
    if _FLY_VOLUME.is_dir()
    else Path(__file__).resolve().parent.parent / "vaelyndra.db"
)
DB_PATH = Path(os.environ.get("VAELYNDRA_DB_PATH", str(_DEFAULT_DB_PATH)))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# check_same_thread=False requis pour SQLite + FastAPI (threads uvicorn).
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    # Import déclare les modèles auprès de SQLModel.metadata avant create_all.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
