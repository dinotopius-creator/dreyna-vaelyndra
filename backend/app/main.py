"""Point d'entrée FastAPI pour la cour de Vaelyndra."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select

from .db import get_session, init_db
from .models import UserProfile
from .routers import posts, streamers, users

app = FastAPI(title="Vaelyndra API", version="0.1.0")


# En prod on restreindra aux domaines deployés ; en dev on ouvre tout.
_cors_origins = os.environ.get(
    "VAELYNDRA_CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173,https://dist-tsbfgcct.devinapps.com",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Comptes officiels ----------------------------------------------------
# PR A : transfert du rôle admin de Dreyna vers `Le roi des zems💎`, et
# création des deux nouvelles animatrices officielles (badge 🎭 sans droits).
# Les pseudos sont conservés à l'identique (cf. validation utilisateur).
OFFICIAL_ACCOUNTS: list[dict[str, str]] = [
    {
        "id": "user-dreyna",
        "username": "Dreyna",
        "role": "animator",
        # Dreyna existe déjà ; pas d'avatar par défaut ici, on ne veut pas
        # écraser sa photo ZEPETO si elle est déjà configurée.
        "avatar_image_url": "",
        "creature_id": "elfe",
    },
    {
        "id": "user-kamestars",
        "username": "Kamestars LV",
        "role": "animator",
        "avatar_image_url": "https://api.dicebear.com/7.x/lorelei/svg?seed=Kamestars",
        "creature_id": "fee",
    },
    {
        "id": "user-roi-des-zems",
        "username": "Le roi des zems💎",
        "role": "admin",
        "avatar_image_url": "https://api.dicebear.com/7.x/personas/svg?seed=RoiDesZems",
        "creature_id": "dragon",
    },
]


def _seed_official_accounts() -> None:
    """Crée / met à jour les 3 comptes officiels et leur rôle.

    Idempotent : si le compte existe déjà, on se contente de synchroniser
    son rôle (transfert admin) et son pseudo affiché. On ne touche pas à
    l'avatar si le compte a déjà personnalisé le sien.
    """
    with get_session() as session:
        official_ids = {a["id"] for a in OFFICIAL_ACCOUNTS}

        # 1. Tout user actuellement marqué "admin" mais qui n'est plus dans
        #    la liste officielle est rétrogradé à "user". Garantit qu'il ne
        #    reste qu'un seul admin après migration (cf. transfert de
        #    Dreyna vers `Le roi des zems💎`).
        stale_admins = session.exec(
            select(UserProfile).where(UserProfile.role == "admin")
        ).all()
        for p in stale_admins:
            if p.id not in official_ids:
                p.role = "user"

        for account in OFFICIAL_ACCOUNTS:
            existing = session.get(UserProfile, account["id"])
            if existing is None:
                existing = UserProfile(
                    id=account["id"],
                    username=account["username"],
                    avatar_image_url=account["avatar_image_url"],
                    creature_id=account["creature_id"],
                    role=account["role"],
                )
                session.add(existing)
            else:
                # Synchronise systématiquement le pseudo + rôle + créature :
                # le seed est la source de vérité pour ces champs.
                existing.username = account["username"]
                existing.role = account["role"]
                if not existing.creature_id:
                    existing.creature_id = account["creature_id"]
                # Seed d'un avatar uniquement si le compte n'en a pas (on ne
                # veut pas écraser la photo ZEPETO de Dreyna par ex.).
                if not existing.avatar_image_url and account["avatar_image_url"]:
                    existing.avatar_image_url = account["avatar_image_url"]
        session.commit()


@app.on_event("startup")
def _startup() -> None:
    init_db()
    _seed_official_accounts()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(posts.router)
app.include_router(users.router)
app.include_router(users.creatures_router)
app.include_router(streamers.router)
