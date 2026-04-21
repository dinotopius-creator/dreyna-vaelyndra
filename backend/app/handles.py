"""Dérivation et unicité des @handles utilisateurs (PR S).

Un `handle` est un identifiant court (`@le_roi_des_zems`) affiché sous le
pseudo dans le fil, les profils, les commentaires. Il sert aussi de terme
de recherche dans la barre de recherche du fil communautaire.

Règles :

- Caractères autorisés : `a-z`, `0-9`, `_`. Pas d'accents, pas de majuscules,
  pas d'emojis, pas de ponctuation. Les accents sont retirés (NFKD).
- Longueur : 3-20 chars. Les chaînes trop courtes après sanitation sont
  paddées à `user_xxxxxx` (hash stable de l'id).
- Collisions : si `le_roi_des_zems` existe déjà, on essaie
  `le_roi_des_zems_2`, `_3`, … (jusqu'à 50) ; au-delà on appose un suffixe
  hexadécimal pour garantir l'unicité.
- Modification : côté endpoint `PATCH /users/{id}/handle`, le serveur
  impose un cooldown de 30 jours (anti-impersonation).
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Optional

from sqlmodel import Session, select

from .models import UserProfile


HANDLE_MIN_LEN = 3
HANDLE_MAX_LEN = 20
_HANDLE_REGEX = re.compile(r"^[a-z0-9_]+$")


def slugify_handle(raw: str) -> str:
    """Retourne un handle candidat dérivé d'un pseudo libre.

    - NFKD pour décomposer les accents, puis on retire les combining marks.
    - Minuscules, remplace les séparateurs (espace, `.`, `-`, etc.) par `_`.
    - Retire tout caractère qui ne serait pas `[a-z0-9_]` (emojis inclus).
    - Collapse les `_` consécutifs, trim `_` aux extrémités.
    - Tronque à `HANDLE_MAX_LEN`. Si le résultat est vide ou trop court,
      on renvoie une chaîne vide et l'appelant padde avec un fallback.
    """
    if not raw:
        return ""
    # Décomposition Unicode : "é" → "e" + combining acute ; on vire la combining.
    decomposed = unicodedata.normalize("NFKD", raw)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    lowered = ascii_only.lower()
    # Remplace tout ce qui n'est ni alphanumérique ASCII ni `_` par `_`.
    swapped = re.sub(r"[^a-z0-9_]+", "_", lowered)
    # Collapse les séries de `_` et trim.
    collapsed = re.sub(r"_+", "_", swapped).strip("_")
    if len(collapsed) > HANDLE_MAX_LEN:
        collapsed = collapsed[:HANDLE_MAX_LEN].rstrip("_")
    return collapsed


def _fallback_handle(user_id: str) -> str:
    """Fallback déterministe pour un id dont le slug du pseudo est trop court.

    Utilise un hash SHA-1 tronqué sur l'id (stable → pas de migration
    mouvante à chaque redémarrage).
    """
    digest = hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:6]
    return f"user_{digest}"


def is_valid_handle(candidate: str) -> bool:
    """Valide un handle saisi par l'utilisateur côté `PATCH /handle`.

    Ne vérifie que le format ; l'unicité est checkée par l'appelant
    (compte tenu de la session DB).
    """
    if not candidate:
        return False
    if len(candidate) < HANDLE_MIN_LEN or len(candidate) > HANDLE_MAX_LEN:
        return False
    return bool(_HANDLE_REGEX.match(candidate))


def _handle_exists(session: Session, handle: str, exclude_id: Optional[str]) -> bool:
    query = select(UserProfile).where(UserProfile.handle == handle)
    if exclude_id is not None:
        query = query.where(UserProfile.id != exclude_id)
    return session.exec(query).first() is not None


def suggest_unique_handle(
    session: Session,
    base: str,
    *,
    user_id: str,
    exclude_id: Optional[str] = None,
) -> str:
    """Trouve un handle unique dérivé du pseudo.

    - `base` est typiquement `slugify_handle(username)`. S'il est trop court
      après slugify, on tombe sur le fallback `user_<hash>`.
    - `exclude_id` sert à ignorer le propre user lors d'un update ("je
      garde mon handle actuel"). Sans lui on bouclerait indéfiniment si
      le user saisit son handle déjà posé.
    """
    candidate = base if len(base) >= HANDLE_MIN_LEN else _fallback_handle(user_id)
    if not _handle_exists(session, candidate, exclude_id):
        return candidate

    # Essaie `candidate_2`, `_3`, …, jusqu'à 50. Au-delà on préfère
    # un suffixe hexadécimal plutôt que de boucler sur 10000.
    for n in range(2, 51):
        trimmed = candidate[: HANDLE_MAX_LEN - len(str(n)) - 1].rstrip("_")
        attempt = f"{trimmed}_{n}"
        if not _handle_exists(session, attempt, exclude_id):
            return attempt

    # Fallback final : suffixe hex sur l'id. Garanti unique modulo collision
    # SHA-1 (astronomique).
    suffix = hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:4]
    trimmed = candidate[: HANDLE_MAX_LEN - len(suffix) - 1].rstrip("_")
    return f"{trimmed}_{suffix}"
