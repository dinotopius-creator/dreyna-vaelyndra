"""Couche SQLite (SQLModel) pour le backend Vaelyndra.

Le fichier SQLite est placé sur un volume Fly.io (/data) en production afin
de survivre aux redéploiements. En local, il vit à la racine du backend.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
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
    # Idem pour les tables d'authentification (PR "Mon compte").
    from .auth import models as auth_models  # noqa: F401

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
            ("stripe_connect_account_id", "TEXT"),
            ("stripe_connect_onboarded_at", "TEXT"),
            # PR A — créatures + rôles officiels.
            ("creature_id", "TEXT"),
            ("role", "TEXT NOT NULL DEFAULT 'user'"),
            # PR G — wishlist (items souhaités, offrables par un autre user).
            ("wishlist_json", "TEXT NOT NULL DEFAULT '[]'"),
            # PR M — grades spirituels pour streamers.
            ("streamer_xp", "INTEGER NOT NULL DEFAULT 0"),
            ("streamer_grade_override", "TEXT"),
            # PR J — modération (ban/unban).
            ("banned_at", "TEXT"),
            ("banned_reason", "TEXT"),
            ("banned_by", "TEXT"),
            # PR S — @handle public + timestamp du dernier changement
            # (cooldown 30 j géré côté router). Unicité imposée par
            # l'index partiel créé plus bas.
            ("handle", "TEXT"),
            ("handle_updated_at", "TEXT"),
        ],
        "directmessage": [
            # Persistance des pièces jointes (images, PDF) en base64 JSON.
            # Avant : seul l'émetteur avait l'attachment (localStorage). Le
            # destinataire voyait juste `📎 nom.jpeg` en texte.
            ("attachments_json", "TEXT"),
        ],
        "worldpresence": [
            ("voice_channel_id", "TEXT"),
            ("private_voice_partner_id", "TEXT"),
            ("voice_invite_from_user_id", "TEXT"),
            ("voice_invite_to_user_id", "TEXT"),
            ("voice_invite_created_at", "TEXT"),
            ("interaction_kind", "TEXT"),
            ("interaction_from_user_id", "TEXT"),
            ("interaction_from_username", "TEXT"),
            ("interaction_partner_user_id", "TEXT"),
            ("interaction_expires_at", "TEXT"),
            ("last_interaction_sent_at", "TEXT"),
        ],
        "comment": [
            ("parent_id", "TEXT"),
            ("reply_to_author_id", "TEXT"),
            ("reply_to_author_name", "TEXT"),
        ],
        "catalogproduct": [
            ("lueurs", "INTEGER"),
        ],
        "stripepayment": [
            ("lueurs_amount", "INTEGER NOT NULL DEFAULT 0"),
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
        # PR S — handle unique modulo NULL. SQLite supporte les index
        # partiels, ce qui permet de laisser plusieurs profils sans handle
        # pendant la phase de backfill sans violer la contrainte.
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS userprofile_handle_unique "
            "ON userprofile (handle) WHERE handle IS NOT NULL"
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
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS communityreward_week_user_unique "
            "ON communityactivityreward (week_start_iso, user_id)"
        )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS communityreward_week_rank_unique "
            "ON communityactivityreward (week_start_iso, rank)"
        )
        # Système de familiers (PR familiers#1).
        # Un seul familier actif par user — index partiel pour bloquer la
        # double activation au niveau SQL (en plus de la garde transaction).
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS userfamiliar_active_per_user "
            "ON userfamiliar (user_id) WHERE is_active = 1"
        )
        # Un user ne peut posséder qu'une seule fois le même familier.
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS userfamiliar_user_familiar_unique "
            "ON userfamiliar (user_id, familiar_id)"
        )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS worldpresence_world_user_unique "
            "ON worldpresence (world_id, user_id)"
        )

        # One-shot : reset du wallet de Dreyna (dé-Dreyna-isation du site).
        # Son compte devient un profil normal d'animatrice ; on purge les
        # Sylvins/Lueurs qui ont pu être accumulés pendant la phase où elle
        # avait un traitement spécial. Idempotent via PRAGMA user_version :
        # tant que la version < 1, on applique et on bump. Les éventuels
        # Sylvins gagnés après le déploiement sont respectés.
        user_version = conn.exec_driver_sql(
            "PRAGMA user_version"
        ).fetchone()[0]
        if user_version < 1:
            conn.exec_driver_sql(
                "UPDATE userprofile SET "
                "lueurs = 0, "
                "sylvins = 0, "
                "sylvins_paid = 0, "
                "sylvins_earnings = 0, "
                "earnings_paid = 0 "
                "WHERE id = 'user-dreyna'"
            )
            conn.exec_driver_sql("PRAGMA user_version = 1")

        # user_version = 2 — Backfill des abonnements aux comptes officiels
        # (Dreyna, Kamestars, Roi des zems). Pendant longtemps, `/auth/
        # register` créait directement le `UserProfile` sans appeler
        # `_auto_follow_officials` (qui n'existait que dans `POST /users`,
        # plus appelé par le front). Conséquence : la grande majorité des
        # comptes récents n'avaient aucun abonnement aux officiels, ce qui
        # se manifestait par une "perte d'abonnés" pour Dreyna/Kamestars/
        # Roi des zems.
        #
        # On rejoue rétroactivement l'auto-follow pour tous les
        # `UserProfile` non-officiels existants. `INSERT OR IGNORE` +
        # l'index unique `follow_unique_pair` garantissent l'idempotence
        # (les utilisateurs qui avaient déjà follow manuellement ne sont
        # pas dupliqués).
        if user_version < 2:
            official_ids = (
                "user-dreyna",
                "user-kamestars",
                "user-roi-des-zems",
            )
            now_iso = datetime.now(timezone.utc).isoformat()
            inserted = 0
            for target_id in official_ids:
                exists = conn.exec_driver_sql(
                    "SELECT 1 FROM userprofile WHERE id = ?",
                    (target_id,),
                ).fetchone()
                if not exists:
                    continue
                cur = conn.exec_driver_sql(
                    "INSERT OR IGNORE INTO follow "
                    "(follower_id, following_id, created_at) "
                    "SELECT u.id, ?, ? FROM userprofile u "
                    "WHERE u.id NOT IN (?, ?, ?) "
                    "AND u.id != ? "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM follow f "
                    "  WHERE f.follower_id = u.id "
                    "    AND f.following_id = ?"
                    ")",
                    (
                        target_id,
                        now_iso,
                        official_ids[0],
                        official_ids[1],
                        official_ids[2],
                        target_id,
                        target_id,
                    ),
                )
                inserted += cur.rowcount or 0
            conn.exec_driver_sql("PRAGMA user_version = 2")
            if inserted:
                logging.getLogger("vaelyndra.db").info(
                    "auto_follow_officials backfill: %d Follow rows inserted",
                    inserted,
                )


def get_session() -> Session:
    return Session(engine)
