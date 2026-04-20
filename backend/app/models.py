"""Modèles SQL pour la cour de Vaelyndra.

On garde les tables minimales (posts / comments / reactions) et on laisse la
logique métier dans les routeurs. Les réactions sont stockées en lignes
(postId, emoji, userId) pour permettre du toggle sans race.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Post(SQLModel, table=True):
    id: str = Field(primary_key=True)
    author_id: str = Field(index=True)
    author_name: str
    author_avatar: str
    content: str
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso, index=True)


class Comment(SQLModel, table=True):
    id: str = Field(primary_key=True)
    post_id: str = Field(index=True, foreign_key="post.id")
    author_id: str
    author_name: str
    author_avatar: str
    content: str
    created_at: str = Field(default_factory=_now_iso)


class Reaction(SQLModel, table=True):
    """Une ligne = une réaction d'un utilisateur à un post avec un emoji donné."""

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: str = Field(index=True, foreign_key="post.id")
    user_id: str = Field(index=True)
    emoji: str
    created_at: str = Field(default_factory=_now_iso)


class UserProfile(SQLModel, table=True):
    """Profil serveur d'un utilisateur : avatar, inventaire et bourses.

    - `avatar_url` est l'URL glb Ready Player Me (ou autre) retournée par
      l'éditeur. `avatar_image_url` est le rendu 2D (png) utilisé pour les
      vignettes (header, posts, chat).
    - `inventory` est une liste d'ids d'items possédés, encodée en JSON. Les
      items équipés sont dans `equipped` (dict slot → itemId).
    - `lueurs` est la monnaie gratuite (daily claim, récompenses). Les
      Sylvins (monnaie premium) sont **séparés en deux pots** pour empêcher
      l'auto-fraude (fondateur qui se crédite gratuitement des Sylvins et
      les retire en vrai argent) :

      - `sylvins_paid` = solde acheté avec du vrai € via Stripe. Seul pot
        convertible en € à la sortie (cashout streamer).
      - `sylvins_promo` (anciennement `sylvins`) = solde "promo" gagné
        gratuitement (daily claim, events, top-up admin, cadeaux reçus
        depuis un autre pot promo). Non convertible en € ; utilisable
        uniquement pour dépenser dans la plateforme (cadeaux, items).

      Côté recettes streamer, même split :

      - `earnings_paid` = part reçue depuis des cadeaux payés par un vrai
        achat €. Seul pot autorisé à alimenter les retraits Stripe Connect.
      - `earnings_promo` (anciennement `sylvins_earnings`) = part reçue
        depuis des cadeaux issus d'un solde promo. Non retirable — le
        streamer ne peut que le réinjecter dans la plateforme (offrir à
        son tour, acheter des items…).

      Rétro-compat : les colonnes `sylvins` et `sylvins_earnings` gardent
      leur nom physique en SQLite mais sont lues/écrites comme les pots
      PROMO. Les nouvelles colonnes `sylvins_paid` / `earnings_paid`
      démarrent à 0 pour tous les profils existants (aucun vrai paiement
      encore). Quand Stripe sera branché, le webhook créditera `sylvins_paid`.
    - `last_daily_at` : ISO timestamp du dernier claim quotidien.
    """

    id: str = Field(primary_key=True)
    username: str
    avatar_image_url: str = ""
    avatar_url: Optional[str] = None
    # JSON sérialisé (list[str] et dict[str, str]) — SQLite ne gère pas les
    # types structurés nativement, on garde du texte pour rester portable.
    inventory_json: str = Field(default="[]")
    equipped_json: str = Field(default="{}")
    # Liste de souhaits : item ids que le user aimerait recevoir en cadeau
    # (PR G). JSON sérialisé, dédupliqué à l'écriture. Un item peut être dans
    # la wishlist en étant déjà possédé (ex. si l'utilisateur a oublié de
    # l'enlever), mais l'UI filtre à l'affichage.
    wishlist_json: str = Field(default="[]")
    lueurs: int = Field(default=0)
    # ⚠️ La colonne `sylvins` stocke désormais uniquement le pot PROMO (cf.
    # docstring). Pour le solde "payé" vraiment retirable, voir
    # `sylvins_paid`.
    sylvins: int = Field(default=0)
    sylvins_earnings: int = Field(default=0)
    sylvins_paid: int = Field(default=0)
    earnings_paid: int = Field(default=0)
    last_daily_at: Optional[str] = None
    # Créature choisie à l'inscription (Elfe, Dragon, Fée…). Catalogue figé
    # côté code dans `creatures.py` — on stocke juste l'id ici pour pouvoir
    # faire évoluer le catalogue (nouvelles descriptions, skins…) sans
    # réécrire toutes les lignes.
    creature_id: Optional[str] = Field(default=None, index=True)
    # Rôle sur la plateforme : "user" (défaut), "animator" (compte officiel
    # sans droits admin, juste un badge), "admin" (droits complets).
    # Source de vérité unique pour les badges 🎭 et 👑.
    role: str = Field(default="user", index=True)
    # PR M — système de grades spirituels. `streamer_xp` accumule l'XP gagné
    # par les activités du membre (cadeaux reçus, abonnés, posts…). Le grade
    # affiché est dérivé de cet XP à la lecture (cf. `app.grades`). Un admin
    # peut forcer un grade via `streamer_grade_override` (slug, ex.
    # "legende-vaelyndra") — utile pour les comptes officiels / events.
    streamer_xp: int = Field(default=0, index=True)
    streamer_grade_override: Optional[str] = Field(default=None, max_length=32)
    # PR J — modération : None = compte actif ; ISO timestamp = date du bannissement.
    # Un compte banni ne peut plus se connecter (ses sessions actives sont
    # révoquées à la pose du ban) et apparaît marqué "suspendu" côté admin.
    banned_at: Optional[str] = Field(default=None, index=True)
    banned_reason: Optional[str] = None
    banned_by: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)


class Follow(SQLModel, table=True):
    """Relation d'abonnement user→user.

    Une ligne = `follower_id` suit `following_id`. La paire
    (follower, following) est unique (cf. contrainte en base).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: str = Field(index=True)
    following_id: str = Field(index=True)
    created_at: str = Field(default_factory=_now_iso)


class AdminAuditLog(SQLModel, table=True):
    """Journal append-only des actions admin (PR J).

    Trace qui a fait quoi sur qui, quand, combien et pourquoi. Ce journal
    est consultable depuis `/admin → Utilisateurs → Journal`, et sert à
    la responsabilisation mutuelle des admins + à un éventuel rollback
    manuel.

    `action` est un slug parmi :
      - `wallet_adjust` — détails : currency, delta, pot, reason
      - `role_change` — détails : old_role, new_role
      - `ban` / `unban` — détails : reason
    `details_json` est un JSON libre pour les données spécifiques à
    l'action (gardé plat pour pouvoir être lu par un script de rollback).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: str = Field(index=True)
    actor_username: str
    target_id: str = Field(index=True)
    target_username: str
    action: str = Field(index=True)
    details_json: str = Field(default="{}")
    created_at: str = Field(default_factory=_now_iso, index=True)


class Report(SQLModel, table=True):
    """Signalement posé par un user contre un profil, un live ou un post (PR K).

    `target_type` ∈ {"user", "live", "post", "comment"} et `target_id` est
    l'id opaque du contenu. `target_url` est une URL cliquable calculée
    côté serveur à la création — permet à l'admin de cliquer directement
    dessus dans l'inbox sans avoir à reconstruire la route.

    `status` ∈ {"open", "resolved", "rejected"}. `resolved_by` et
    `resolved_at` tracent qui a fermé le signalement.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: str = Field(index=True)
    reporter_username: str
    target_type: str = Field(index=True)
    target_id: str = Field(index=True)
    target_label: str = ""
    target_url: str = ""
    reason: str = Field(index=True)
    description: str = ""
    status: str = Field(default="open", index=True)
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso, index=True)


class LiveSession(SQLModel, table=True):
    """Registre serveur des lives en cours (tous streamers confondus).

    Avant cette table, le "liveRegistry" était uniquement stocké en
    localStorage côté client. Résultat : quand Alexandre lançait un live,
    Dreyna (qui naviguait dans `/communaute` depuis son propre browser) ne
    voyait rien. Cette table centralise les lives actifs pour qu'ils
    apparaissent pour tout le monde, peu importe le device.

    `mode` ∈ {"screen", "camera", "twitch"} — l'UI adapte le rendu
    (iframe Twitch vs player WebRTC). `category` vient du catalogue
    `liveCategories.ts`. `last_heartbeat_at` est mis à jour par le host
    toutes les ~30 s ; un GET /live filtre les entrées obsolètes
    (> 90 s sans heartbeat → crash, kill, changement d'onglet).
    """

    broadcaster_id: str = Field(primary_key=True)
    broadcaster_name: str
    broadcaster_avatar: str = ""
    title: str = ""
    description: str = ""
    category: str = "autre"
    mode: str = "screen"
    twitch_channel: str = ""
    started_at: str = Field(default_factory=_now_iso, index=True)
    last_heartbeat_at: str = Field(default_factory=_now_iso, index=True)


class LiveModeration(SQLModel, table=True):
    """Actions de modération du broadcaster sur son propre live.

    Un broadcaster peut :
      - MUTE un user pendant X secondes → ce user ne peut plus envoyer de
        message dans le chat de *ce* live jusqu'à `expires_at`.
      - KICK un user → ce user est déconnecté de *ce* live et ne peut pas
        le rejoindre jusqu'à `expires_at`.

    Les deux actions sont scopées au `broadcaster_id` : muter quelqu'un sur
    un live ne le mute pas sur un autre live. Une ligne par (broadcaster,
    target, action). Les anciennes lignes expirées sont tolérées (pas
    nettoyées automatiquement) — la lecture compare toujours `expires_at`.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    broadcaster_id: str = Field(index=True)
    target_user_id: str = Field(index=True)
    action: str = Field(index=True)  # "mute" | "kick"
    expires_at: str = Field(index=True)
    created_at: str = Field(default_factory=_now_iso)


class GiftLedger(SQLModel, table=True):
    """Journal append-only de chaque cadeau Sylvins envoyé.

    Alimente :
      - Classement hebdo des streamers (agrégé par `receiver_id` sur une
        plage [week_start, week_start + 7j)).
      - Module BFF (plus gros donateur par streamer, agrégé par
        `(receiver_id, sender_id)`).

    `week_start_iso` = date ISO (YYYY-MM-DD) du lundi UTC de la semaine,
    stockée explicitement pour pouvoir indexer + filtrer sans calcul au
    runtime. Recalculable depuis `created_at`, mais gelée à l'insertion
    pour garantir qu'un gift envoyé le dimanche à 23:59:59 UTC reste dans
    "sa" semaine même si le serveur bascule le lundi 00:00 entre l'écriture
    et la lecture (corner case CI/horloge).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    sender_id: str = Field(index=True)
    receiver_id: str = Field(index=True)
    amount: int
    # Classement "retirable" vs "cadeau" : on trace paid et promo
    # séparément pour pouvoir, plus tard, exposer un classement par type.
    # Pour l'instant le classement affiché somme les deux.
    amount_paid: int = Field(default=0)
    amount_promo: int = Field(default=0)
    week_start_iso: str = Field(index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)
