"""Point d'entrée FastAPI pour la cour de Vaelyndra."""
from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlmodel import select

from .auth.rate_limit import limiter
from .auth.routes import router as auth_router
from .db import get_session, init_db
from .models import UserProfile
from .routers import posts, streamers, users

app = FastAPI(title="Vaelyndra API", version="0.1.0")

# Rate limiter (slowapi) — partagé entre tous les routeurs sensibles.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Trop de tentatives. Réessaie dans quelques minutes.",
        },
    )


# CORS : on autorise Vaelyndra (prod + www), les previews Vercel scopées au
# projet `dreyna-vaelyndra*` et l'ancien domaine devinapps le temps de la
# transition. allow_credentials=True est **obligatoire** pour que le cookie
# de session HttpOnly traverse depuis `www.vaelyndra.com` → `api.vaelyndra.com`.
_cors_origins = os.environ.get(
    "VAELYNDRA_CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173,https://dist-tsbfgcct.devinapps.com",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    # Autorise toutes les previews Vercel du projet (dreyna-vaelyndra* et
    # dreyna-vaelyndra-<hash>.vercel.app). Regex scopée au projet pour ne
    # pas laisser passer un site attaquant type "dreyna-vaelyndrafaux".
    allow_origin_regex=r"https://dreyna-vaelyndra(-[a-z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
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
        # écraser sa photo déjà configurée si elle en a une.
        "avatar_image_url": "",
        "creature_id": "elfe",
        # Credentials seed pour login immédiat (PR "Mon compte").
        # À changer au premier login via /auth/change-password.
        "email": "dreyna@vaelyndra.realm",
        "password": "reineelfes2024",
    },
    {
        "id": "user-kamestars",
        "username": "Kamestars LV",
        "role": "animator",
        "avatar_image_url": "https://api.dicebear.com/7.x/lorelei/svg?seed=Kamestars",
        "creature_id": "fee",
        "email": "kamestars@vaelyndra.realm",
        "password": "kamestars2024",
    },
    {
        "id": "user-roi-des-zems",
        "username": "Le roi des zems💎",
        "role": "admin",
        "avatar_image_url": "https://api.dicebear.com/7.x/personas/svg?seed=RoiDesZems",
        "creature_id": "dragon",
        "email": "roi@vaelyndra.realm",
        "password": "zemsdiamant",
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
                # veut pas écraser la photo de Dreyna par ex.).
                if not existing.avatar_image_url and account["avatar_image_url"]:
                    existing.avatar_image_url = account["avatar_image_url"]
        session.commit()


def _seed_official_credentials() -> None:
    """Crée les identifiants pour les comptes officiels (PR "Mon compte").

    Idempotent :
    - Si aucun Credential pour ce user_id → crée avec mot de passe seed
      + email pré-vérifié (ces comptes n'ont pas besoin de l'étape email).
    - Si Credential existe déjà → on ne touche à rien (pas de reset forcé,
      le mot de passe éventuellement changé par l'utilisateur est respecté).
    """
    from .auth.crypto import hash_password
    from .auth.models import Credential

    with get_session() as session:
        for account in OFFICIAL_ACCOUNTS:
            email = account.get("email")
            password = account.get("password")
            if not email or not password:
                continue
            existing = session.get(Credential, account["id"])
            if existing is not None:
                continue
            session.add(
                Credential(
                    user_id=account["id"],
                    email=email.lower(),
                    password_hash=hash_password(password),
                    # Email pré-vérifié : ces comptes sont officiels et
                    # pré-configurés par l'équipe Vaelyndra.
                    email_verified_at=__import__(
                        "datetime"
                    ).datetime.now(
                        __import__("datetime").timezone.utc
                    ).isoformat(),
                )
            )
        session.commit()


@app.on_event("startup")
def _startup() -> None:
    init_db()
    _seed_official_accounts()
    _seed_official_credentials()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(posts.router)
app.include_router(users.router)
app.include_router(users.creatures_router)
app.include_router(streamers.router)
app.include_router(auth_router)
