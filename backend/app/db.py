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
    _apply_migrations()


def _apply_migrations() -> None:
    """Ajoute les colonnes manquantes sur les tables existantes.

    SQLModel.metadata.create_all ne crée que les tables absentes ; il
    n'ajoute pas les colonnes neuves. Pour les schémas évolutifs sans
    Alembic, on fait un `ALTER TABLE … ADD COLUMN` idempotent : on liste
    les colonnes actuelles via PRAGMA et on n'ajoute que celles qui
    manquent. Les valeurs par défaut (0) garantissent que les lignes
    existantes restent valides.
    """
    required: dict[str, list[tuple[str, str]]] = {
        "userprofile": [
            ("sylvins_paid", "INTEGER NOT NULL DEFAULT 0"),
            ("earnings_paid", "INTEGER NOT NULL DEFAULT 0"),
            # PR A — créatures + rôles officiels.
            ("creature_id", "TEXT"),
            ("role", "TEXT NOT NULL DEFAULT 'user'"),
        ],
    }
    with engine.begin() as conn:
        for table, columns in required.items():
            existing = {
                row[1]  # row = (cid, name, type, notnull, dflt, pk)
                for row in conn.exec_driver_sql(
                    f"PRAGMA table_info({table})"
                ).fetchall()
            }
            for col_name, col_ddl in columns:
                if col_name not in existing:
                    conn.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_ddl}"
                    )
        # Unicité (follower, following) — empêche les doublons si deux
        # requêtes parallèles tentent de créer la même relation.
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS follow_unique_pair "
            "ON follow (follower_id, following_id)"
        )
        # Index composites pour accélérer le classement hebdo streamers
        # (WHERE week_start_iso = ? GROUP BY receiver_id / sender_id).
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS giftledger_week_receiver "
            "ON giftledger (week_start_iso, receiver_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS giftledger_receiver_sender "
            "ON giftledger (receiver_id, sender_id)"
        )


def get_session() -> Session:
    return Session(engine)
