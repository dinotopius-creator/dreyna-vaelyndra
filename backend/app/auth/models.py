"""Tables SQL pour l'authentification.

On sépare ces tables de `app/models.py` (qui contient les entités métier) pour
garder une frontière claire. Chaque user a :

- Un `UserProfile` (existant, monde applicatif)
- Un `Credential` (mot de passe, email vérifié, 2FA) — relation 1-1
- Plusieurs `AuthSession` (une par appareil connecté)
- Des `EmailVerificationToken` / `PasswordResetToken` (éphémères)
- Des `LoginAttempt` (historique + rate limit)

Le lien avec `UserProfile` se fait par `user_id` (texte, pas de FK stricte au
niveau SQL car certaines tables tournent en mémoire avant le seed, mais on
respecte la convention d'ID partout).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Credential(SQLModel, table=True):
    """Identifiants + métadonnées de sécurité d'un compte."""

    user_id: str = Field(primary_key=True)
    # Email normalisé (lowercase). Unique.
    email: str = Field(unique=True, index=True)
    # Hash argon2id (format `$argon2id$v=19$m=...,t=...,p=...$...$...`).
    password_hash: str
    # ISO timestamp ; None = email jamais vérifié (inscription en attente).
    email_verified_at: Optional[str] = None
    # Secret TOTP base32 (stocké en clair en DB — acceptable vu le reste de
    # la stack, à l'avenir on pourra le chiffrer avec une master key KMS).
    totp_secret: Optional[str] = None
    totp_enabled: bool = Field(default=False)
    # Codes de récupération 2FA, JSON (list[hash argon2]). Chaque code ne
    # peut être consommé qu'une fois.
    totp_recovery_hashes_json: str = Field(default="[]")
    created_at: str = Field(default_factory=_utcnow_iso)
    updated_at: str = Field(default_factory=_utcnow_iso)


class AuthSession(SQLModel, table=True):
    """Une session active = un appareil connecté.

    On fait des sessions *server-side* (pas juste un JWT stateless) pour
    pouvoir révoquer individuellement (logout d'un device, password change
    qui logout toutes les sessions sauf la courante, etc.).

    Le JWT en cookie contient juste le `id` de cette session + le `user_id`.
    La validation vérifie que la session existe et n'a pas été révoquée.
    """

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    created_at: str = Field(default_factory=_utcnow_iso, index=True)
    # Expiration absolue (on coupe au bout de 30 jours même si refresh).
    expires_at: str
    # Dernière fois que cette session a été utilisée (refresh).
    last_seen_at: str = Field(default_factory=_utcnow_iso)
    # IP + UA du login (informatif, affiché sur /compte > sessions).
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    # None = active ; ISO timestamp = révoquée.
    revoked_at: Optional[str] = None


class EmailVerificationToken(SQLModel, table=True):
    """Token envoyé par email pour valider l'adresse.

    On utilise la même table pour :
    - Validation initiale à l'inscription
    - Validation d'un changement d'email ultérieur

    Le token est un `secrets.token_urlsafe(32)` stocké haché (argon2id) pour
    ne pas avoir le token en clair en DB.
    """

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    # Email à valider (peut différer du Credential.email si changement).
    email: str
    token_hash: str
    created_at: str = Field(default_factory=_utcnow_iso)
    expires_at: str
    consumed_at: Optional[str] = None


class PasswordResetToken(SQLModel, table=True):
    """Token envoyé par email pour reset un mot de passe oublié."""

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    token_hash: str
    created_at: str = Field(default_factory=_utcnow_iso)
    expires_at: str
    consumed_at: Optional[str] = None


class LoginAttempt(SQLModel, table=True):
    """Historique d'authentification (succès + échecs).

    Sert à 2 choses :
    - Affichage côté `/compte` > historique ("dernière connexion Chrome 192...")
    - Rate limiting en complément de slowapi (on peut bloquer par email
      indépendamment de l'IP pour contrer des attaques distribuées).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    # Email tenté (peut ne pas correspondre à un user si tentative sur email
    # inexistant ; on le stocke quand même pour analyse).
    email: str = Field(index=True)
    # user_id si résolu, None sinon.
    user_id: Optional[str] = Field(default=None, index=True)
    success: bool = Field(index=True)
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    # Raison de l'échec (pas affichée au user pour éviter l'enumération :
    # "mauvais mot de passe" vs "email inconnu" donne la même réponse) ;
    # juste loggée côté serveur pour debug.
    failure_reason: Optional[str] = None
    created_at: str = Field(default_factory=_utcnow_iso, index=True)
