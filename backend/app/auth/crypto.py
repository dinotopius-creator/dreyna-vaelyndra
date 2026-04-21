"""Primitives cryptographiques pour l'authentification.

- Hashing de mot de passe : argon2id (paramètres OWASP 2024).
- JWT : HS256 avec secret serveur (VAELYNDRA_JWT_SECRET).
- Génération de tokens opaques pour email verification / reset.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


# Paramètres argon2id OWASP 2024 (memory-hard, résistant GPU).
# m=64MB, t=3, p=4 — équilibre coût (~50ms/hash sur CPU 2024) et résistance.
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=64 * 1024,  # 64 MiB
    parallelism=4,
)


def hash_password(password: str) -> str:
    """Retourne un hash argon2id du mot de passe.

    Le format encode les paramètres (algo, m, t, p, salt) directement dans la
    string, donc on peut changer les paramètres sans migration : les anciens
    hashes restent vérifiables avec leurs anciens paramètres.
    """
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Vérifie qu'un mot de passe correspond au hash stocké."""
    try:
        _hasher.verify(hashed, password)
        return True
    except VerifyMismatchError:
        return False
    except Exception:
        # Hash corrompu / format inconnu → on traite comme invalide sans
        # remonter l'erreur (pour ne pas leak).
        return False


def needs_rehash(hashed: str) -> bool:
    """Indique si le hash a été généré avec des paramètres plus faibles que
    les actuels et devrait être recalculé au prochain login réussi."""
    try:
        return _hasher.check_needs_rehash(hashed)
    except Exception:
        return False


# --- JWT sessions ---------------------------------------------------------

# Algo HS256 (symmetric) — suffit tant qu'on a un seul backend. Si on passe
# à plusieurs services, on migrera vers RS256.
_JWT_ALGO = "HS256"


def _jwt_secret() -> str:
    secret = os.environ.get("VAELYNDRA_JWT_SECRET")
    if not secret:
        # En dev, on tolère l'absence — mais on log un warning et on génère
        # un secret volatile pour que ça marche. En prod, Fly.io set ce
        # secret obligatoirement (cf. `fly secrets set VAELYNDRA_JWT_SECRET`).
        # Attention : sans secret fixe, toutes les sessions sont invalidées
        # à chaque redémarrage du serveur — ce qui est OK en dev.
        import warnings

        warnings.warn(
            "VAELYNDRA_JWT_SECRET non défini ; génération d'un secret volatile "
            "(toutes les sessions seront perdues au redémarrage).",
            stacklevel=2,
        )
        secret = secrets.token_urlsafe(64)
        os.environ["VAELYNDRA_JWT_SECRET"] = secret
    return secret


def issue_session_jwt(session_id: str, user_id: str, ttl_days: int = 30) -> str:
    """Signe un JWT contenant le session_id + user_id."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sid": session_id,
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=ttl_days)).timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALGO)


def decode_session_jwt(token: str) -> dict[str, Any] | None:
    """Décode + vérifie le JWT. Retourne None si invalide/expiré."""
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[_JWT_ALGO])
    except jwt.PyJWTError:
        return None


# --- Tokens opaques (email verification, password reset) ------------------

def generate_opaque_token() -> str:
    """Token URL-safe, 32 bytes d'entropie (~256 bits)."""
    return secrets.token_urlsafe(32)


def hash_opaque_token(token: str) -> str:
    """Hash argon2 d'un token (pour ne pas stocker les tokens en clair)."""
    return _hasher.hash(token)


def verify_opaque_token(token: str, hashed: str) -> bool:
    return verify_password(token, hashed)


# --- Utilitaire : comparaison sécurisée ------------------------------------

def constant_time_equals(a: str, b: str) -> bool:
    """Wrapper sur `secrets.compare_digest` pour lisibilité."""
    return secrets.compare_digest(a, b)
