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


class CommunityActivityReward(SQLModel, table=True):
    """Récompense hebdo du classement communauté.

    Une ligne = un gain de Lueurs déjà attribué pour une semaine donnée.
    Sert de garde-fou idempotent : si le cron/endpoint de sync est rejoué,
    on ne recrédite jamais deux fois les mêmes gagnants.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    week_start_iso: str = Field(index=True)
    user_id: str = Field(index=True)
    rank: int = Field(index=True)
    reward_lueurs: int = 0
    awarded_at: str = Field(default_factory=_now_iso, index=True)


class OracleGameSession(SQLModel, table=True):
    """Historique serveur du mini-jeu Oracle des Runes.

    Une ligne = une tentative. Le résultat est figé côté serveur pour éviter
    toute triche front : le client envoie uniquement la rune choisie.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    day_key: str = Field(index=True)
    rune_key: str = Field(max_length=32)
    reward_currency: str = Field(default="none", index=True, max_length=16)
    reward_amount: int = Field(default=0)
    reward_label: str = Field(default="", max_length=64)
    created_at: str = Field(default_factory=_now_iso, index=True)


class WorldPresence(SQLModel, table=True):
    """Présence temps réel d'un membre dans un monde social.

    Heartbeat court envoyé par le front tant que l'utilisateur garde
    l'onglet `/mondes` ouvert. Les lignes expirent rapidement côté API
    pour n'afficher que les membres réellement présents.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    world_id: str = Field(index=True, max_length=64)
    user_id: str = Field(index=True, foreign_key="userprofile.id")
    district: str = Field(default="place", max_length=64)
    pos_x: int = Field(default=50)
    pos_y: int = Field(default=50)
    voice_enabled: bool = Field(default=False)
    last_seen_at: str = Field(default_factory=_now_iso, index=True)


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
    # PR S — identifiant public unique sous forme `@le_roi_des_zems`.
    # Dérivé automatiquement du pseudo à la création (cf. `app.handles`).
    # Modifiable par le user depuis `/compte` avec un cooldown de 30 j
    # (anti-impersonation). `None` est autorisé le temps qu'un profil
    # pré-PR S soit migré au prochain démarrage du backend.
    handle: Optional[str] = Field(default=None, index=True, max_length=20)
    handle_updated_at: Optional[str] = None
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
    stripe_connect_account_id: Optional[str] = Field(default=None, index=True)
    stripe_connect_onboarded_at: Optional[str] = None
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


class NativeLiveSignal(SQLModel, table=True):
    """Signalisation WebRTC pour les lives Android natifs.

    PeerJS ne peut pas transporter une piste créée côté Android natif
    (`MediaProjection`). On utilise donc une signalisation serveur légère :
    le viewer web poste une offre SDP, l'app Android polle les offres de
    son live, répond avec une answer SDP, puis les deux côtés échangent les
    candidats ICE via cette table.
    """

    session_id: str = Field(primary_key=True)
    broadcaster_id: str = Field(index=True)
    viewer_id: str = Field(index=True)
    offer_sdp: str
    answer_sdp: str = ""
    viewer_ice_json: str = Field(default="[]")
    broadcaster_ice_json: str = Field(default="[]")
    created_at: str = Field(default_factory=_now_iso, index=True)
    updated_at: str = Field(default_factory=_now_iso, index=True)


class NativeLiveBroadcastToken(SQLModel, table=True):
    """Jeton court pour authentifier le service Android natif du broadcaster."""

    token: str = Field(primary_key=True)
    broadcaster_id: str = Field(index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)
    expires_at: str = Field(index=True)


class LiveChatMessage(SQLModel, table=True):
    """Message de chat live persistant court, lu par le web et l'overlay natif."""

    id: str = Field(primary_key=True)
    broadcaster_id: str = Field(index=True)
    author_id: str = Field(index=True)
    author_name: str = ""
    author_avatar: str = ""
    content: str
    created_at: str = Field(default_factory=_now_iso, index=True)
    highlight: bool = False
    grade_short: Optional[str] = None


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


class LiveJoinRequest(SQLModel, table=True):
    """Demande temps réel d'un viewer pour monter sur scène d'un live.

    Remplace le flux localStorage du PR H par un canal serveur polled,
    afin que la demande d'un viewer (mobile) arrive au broadcaster (PC)
    même quand ils ne sont pas sur le même browser.

    Statuts :
      - "pending" : file d'attente, en haut de la liste côté broadcaster
      - "accepted" : invité accepté (le broadcaster devra ouvrir l'audio)
      - "refused" : refusé récemment (purgé après 3 min côté client)

    Clé logique : `(broadcaster_id, user_id)` — un viewer ne peut avoir
    qu'une demande active par broadcaster. Si elle existe déjà, on
    met à jour le statut / l'horodatage (upsert idempotent).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    broadcaster_id: str = Field(index=True)
    user_id: str = Field(index=True)
    username: str = ""
    avatar: str = ""
    creature_id: str = ""
    status: str = Field(default="pending", index=True)
    requested_at: str = Field(default_factory=_now_iso, index=True)
    decided_at: Optional[str] = None


class CatalogProduct(SQLModel, table=True):
    """Produit vendu dans la boutique (PR #76 — migration localStorage → DB).

    Avant cette table, les produits étaient stockés dans le `localStorage`
    de chaque navigateur, avec un seed `INITIAL_PRODUCTS` côté frontend.
    Conséquence : une suppression ou ajout faite par l'admin n'était
    visible que sur SON device. Un visiteur voyait un catalogue
    potentiellement différent.

    Maintenant le backend est la source de vérité. Le frontend fetch
    depuis `GET /catalog/products` et affiche ce qu'il reçoit. Les
    mutations (add/update/delete) passent par `/admin/catalog/products/*`.

    Les champs suivent à l'identique le type `Product` du frontend
    (`src/types.ts`) pour ne pas avoir de mapping côté client.
    `tags_json` stocke la liste `tags: string[]` en JSON (SQLite).
    """

    id: str = Field(primary_key=True)
    name: str
    tagline: str = ""
    description: str = ""
    price: float = 0
    # Toujours "€" en v1 ; on garde la colonne pour compat future.
    currency: str = Field(default="€")
    image: str = ""
    # "Merch" | "Digital" | "VIP" | "Exclusif" | "Sylvins"
    category: str = Field(default="Merch", index=True)
    # Null sauf pour les packs Sylvins (montant crédité à l'achat).
    sylvins: Optional[int] = None
    rating: float = Field(default=5.0)
    stock: int = Field(default=0)
    featured: bool = Field(default=False, index=True)
    tags_json: str = Field(default="[]")
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso, index=True)


class CatalogArticle(SQLModel, table=True):
    """Chronique / article de blog (PR #76).

    Migration identique à `CatalogProduct` : avant, les articles étaient
    en localStorage, maintenant en DB. `likes_json` est la liste des
    `user_id` qui ont liké. Les commentaires restent pour l'instant en
    JSON (liste de dict) dans `comments_json` — moins normalisé qu'une
    vraie table `ArticleComment` mais suffisant pour v1 où on veut juste
    persister les actions admin. Pourra être normalisé plus tard.
    """

    id: str = Field(primary_key=True)
    slug: str = Field(index=True)
    title: str
    excerpt: str = ""
    content: str = ""
    # "Lore" | "Lifestyle" | "Annonces" | "Communauté"
    category: str = Field(default="Lore", index=True)
    cover: str = ""
    author: str = ""
    reading_time: int = Field(default=3)
    tags_json: str = Field(default="[]")
    likes_json: str = Field(default="[]")
    comments_json: str = Field(default="[]")
    created_at: str = Field(default_factory=_now_iso, index=True)
    updated_at: str = Field(default_factory=_now_iso, index=True)


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


class StripePayment(SQLModel, table=True):
    """Journal des paiements Stripe — permet l'idempotence du webhook.

    La PK est le `checkout_session_id` renvoyé par Stripe. Quand le webhook
    `checkout.session.completed` arrive, on vérifie si la ligne existe déjà
    avec `status == "paid"` : si oui, on n'applique pas deux fois le crédit
    (Stripe peut renvoyer le même événement à cause d'un retry réseau).

    - `user_id` : qui a payé.
    - `product_id` : id du `CatalogProduct` (catégorie "Sylvins") acheté.
    - `sylvins_amount` : nombre de Sylvins à créditer sur le pot PAID.
    - `amount_cents` / `currency` : montant brut de la transaction (pour audit).
    - `status` : `"pending"` à la création, `"paid"` après webhook, `"failed"`
      si Stripe rapporte un échec.
    """

    id: str = Field(primary_key=True)  # checkout_session_id Stripe
    user_id: str = Field(index=True)
    product_id: str = Field(index=True)
    sylvins_amount: int
    amount_cents: int
    currency: str = "eur"
    status: str = Field(default="pending", index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)
    completed_at: Optional[str] = None


class StripePayout(SQLModel, table=True):
    """Journal des retraits streamer vers Stripe Connect.

    - `id` = `transfer_id` Stripe, unique et suffisant pour l'audit.
    - `earnings_paid_amount` garde le montant débité en Sylvins retirable.
    - `amount_cents` garde le net réellement transféré au compte Connect.
    """

    id: str = Field(primary_key=True)  # transfer_id Stripe
    user_id: str = Field(index=True)
    stripe_account_id: str = Field(index=True)
    earnings_paid_amount: int
    amount_cents: int
    currency: str = "eur"
    status: str = Field(default="paid", index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)


class DirectMessage(SQLModel, table=True):
    """Message privé entre deux membres (1-to-1, texte).

    - `conversation_key` = `"{min(a,b)}|{max(a,b)}"` (ids triés). Une seule
      clé par paire de users, ce qui permet d'indexer un fil sans se
      soucier de savoir qui a envoyé à qui. Renseigné à l'insertion.
    - `read_at` : ISO timestamp posé quand le destinataire ouvre le fil.
      `None` = pas encore lu → l'UI affiche "Envoyé". Sinon "Vu à HH:MM".
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_key: str = Field(index=True)
    sender_id: str = Field(index=True)
    recipient_id: str = Field(index=True)
    content: str
    created_at: str = Field(default_factory=_now_iso, index=True)
    read_at: Optional[str] = Field(default=None, index=True)


class WalletLedger(SQLModel, table=True):
    """Journal append-only de chaque mouvement sur les pots wallet d'un
    user (Lueurs / Sylvins promo / Sylvins paid / earnings promo /
    earnings paid).

    Une ligne par mouvement, écrite dans la même transaction que la
    modification du `UserProfile` correspondant. Permet :

    1. **Auditer** une plainte "j'ai perdu mes Lueurs" : on retrouve la
       chronologie exacte (10 Lueurs au daily, +120 à l'Oracle, -120
       achat boutique, etc.) et on identifie le bug ou la fraude.
    2. **Restaurer** un solde perdu en rejouant ou en compensant.
    3. **Détecter** des anomalies : un débit sans contrepartie d'item
       livré, deux débits identiques à 1ms d'intervalle (double-click),
       etc.

    Schéma volontairement plat pour pouvoir indexer / agréger en SQL :
    - `pot` ∈ {"lueurs", "sylvins_promo", "sylvins_paid",
       "earnings_promo", "earnings_paid"}
    - `delta` : entier signé (positif = crédit, négatif = débit)
    - `balance_after` : valeur du pot juste après l'écriture, pour
       repérer un saut inexpliqué (ex. balance_after - balance_before
       != delta) sans avoir à recalculer.
    - `reason` : tag textuel court ("oracle:reward", "shop:prod-xxx",
       "stripe:cs_test_...", "daily-claim", "admin:user-yyy:adj", etc.)
    - `reference_id` : id externe optionnel (gift id, checkout session
       id, order id, …). Permet de joindre WalletLedger ↔ autre table
       côté analytics.

    On ne supprime JAMAIS de ligne, même quand un user est hard-delete
    (cf. `admin._hard_delete_user`). Le sentinel `"user-deleted"` est
    posé sur `user_id` à la place. Sans ça l'audit comptable global du
    site (somme des deltas par pot) deviendrait incohérent à chaque
    suppression."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    pot: str = Field(index=True)
    delta: int
    balance_after: int
    reason: str = Field(default="", index=True)
    reference_id: Optional[str] = Field(default=None, index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)


class ShopOrder(SQLModel, table=True):
    """Commandes boutique payées en Lueurs (ou autre monnaie interne).

    Crée un enregistrement persistent pour chaque achat fait dans
    `/boutique` avec des Lueurs, afin que :

    1. Le user retrouve son historique d'achats même après vidage du
       cache navigateur (avant cette table, les "orders" étaient en
       localStorage et disparaissaient à chaque clear, donnant
       l'impression d'avoir "perdu" ses Lueurs sans rien acheter en
       échange).
    2. L'item acheté soit livré atomiquement à l'inventaire dans la
       même transaction que le débit des Lueurs (impossible d'avoir un
       débit sans livraison ou inversement).

    `status` ∈ {"paid", "refunded"}. On ne fait pas encore de refund
    automatique mais le champ est là pour un futur SAV admin."""

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    product_id: str = Field(index=True)
    quantity: int = Field(default=1)
    unit_price: int
    total_price: int
    currency: str = Field(default="Lueurs")
    status: str = Field(default="paid", index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)


class UserFamiliar(SQLModel, table=True):
    """Familier possédé par un membre.

    Une ligne par (user, familier). Au max un seul `is_active=True` par
    user (garanti par un index partiel côté DB + une logique anti-double
    activation côté routeur dans la même transaction que le switch).

    - `familiar_id` : slug du catalogue figé (`app.familiars.FAMILIARS_BY_ID`).
    - `xp` : XP cumulé sur ce familier — converti en niveau via
      `app.familiars.level_from_xp`. **L'XP n'est PAS partagé entre les
      familiers d'un même user** : chaque familier a sa propre courbe de
      niveau. Au "switch" (changement de familier actif), on TRANSFÈRE
      l'XP courant du familier sortant vers le familier entrant pour
      respecter la promesse produit "le familier neuf récupère la
      progression" — cf. la logique du routeur.
    - `nickname` : surnom donné par le user (optionnel).
    - `acquired_at` : ISO timestamp d'acquisition.
    - `last_active_at` : dernier ISO où ce familier a été l'actif. Sert
      à afficher l'historique sur la page collection.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    familiar_id: str = Field(index=True)
    xp: int = Field(default=0)
    nickname: Optional[str] = Field(default=None, max_length=40)
    is_active: bool = Field(default=False, index=True)
    acquired_at: str = Field(default_factory=_now_iso, index=True)
    last_active_at: Optional[str] = Field(default=None)


class FamiliarSwitchLedger(SQLModel, table=True):
    """Journal append-only des changements de familier actif.

    Une ligne par switch. Utile pour :
    1. Auditer la règle "1er switch gratuit, suivants payants" :
       en comptant les lignes pour un user on sait combien de switchs il
       a déjà faits.
    2. Tracer la consommation Sylvins liée aux switchs (la ligne pointe
       sur la `WalletLedger` correspondante via `reference_id`).
    3. Détecter de l'abus (trop de switchs très rapprochés = sans doute
       un bug client qui spam le bouton).

    `from_familiar_id` est `None` au tout premier switch (familier
    d'onboarding choisi sans rien posséder avant).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    from_familiar_id: Optional[str] = None
    to_familiar_id: str = Field(index=True)
    sylvins_cost: int = Field(default=0)
    reason: str = Field(default="switch", index=True)
    reference_id: Optional[str] = Field(default=None, index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)


class FamiliarXPLedger(SQLModel, table=True):
    """Journal append-only des gains d'XP du familier actif d'un membre.

    Utile pour :
    1. Limiter les farms (un seul gain "post" par jour, etc.) en
       comptant les lignes récentes avec un `reason` donné.
    2. Auditer les pertes / contestations XP.

    Chaque ligne pointe sur le `UserFamiliar.id` de la cible (donc on
    sait toujours QUEL familier a effectivement encaissé les XP au
    moment du gain — un user qui switch plus tard ne perd pas la trace).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    user_familiar_id: int = Field(index=True)
    familiar_id: str = Field(index=True)
    delta_xp: int
    xp_after: int
    reason: str = Field(default="", index=True)
    reference_id: Optional[str] = Field(default=None, index=True)
    created_at: str = Field(default_factory=_now_iso, index=True)
