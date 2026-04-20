"""Schémas Pydantic (I/O) exposés par l'API.

On renvoie les posts dans le même shape que le front (`reactions` en
`Record<emoji, userIds[]>` + `comments` en tableau) pour limiter les écarts.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AuthorIn(BaseModel):
    author_id: str = Field(..., min_length=1, max_length=128)
    author_name: str = Field(..., min_length=1, max_length=64)
    author_avatar: str = Field(..., min_length=1, max_length=512)


class PostCreate(AuthorIn):
    content: str = Field(..., min_length=1, max_length=2000)
    image_url: Optional[str] = Field(default=None, max_length=1024)
    video_url: Optional[str] = Field(default=None, max_length=1024)


class CommentCreate(AuthorIn):
    content: str = Field(..., min_length=1, max_length=1000)


class ReactionToggle(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    emoji: str = Field(..., min_length=1, max_length=16)


class CommentOut(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorAvatar: str
    content: str
    createdAt: str
    likes: List[str] = []


class PostOut(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorAvatar: str
    content: str
    imageUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    createdAt: str
    reactions: Dict[str, List[str]] = {}
    comments: List[CommentOut] = []


# --- Profils utilisateur ---------------------------------------------------


class UserProfileUpsert(BaseModel):
    """Payload d'upsert minimal envoyé par le front lors de la 1re connexion.

    Permet au serveur de créer le profil s'il n'existe pas encore. `id` est
    l'identifiant stable du user côté front (ex. `user-lyria`).

    `creature_id` est optionnel (rétro-compat pour les anciens users pré-PR A
    qui n'en ont pas) ; côté inscription, le front l'envoie obligatoirement.
    """

    id: str = Field(..., min_length=1, max_length=128)
    username: str = Field(..., min_length=1, max_length=64)
    avatar_image_url: str = Field(..., min_length=1, max_length=1024)
    creature_id: Optional[str] = Field(default=None, max_length=32)


class CreatureChoice(BaseModel):
    """Choix / changement de créature. Slug du catalogue figé."""

    creature_id: str = Field(..., min_length=1, max_length=32)


class FollowAction(BaseModel):
    """Identité du follower pour les endpoints follow/unfollow."""

    follower_id: str = Field(..., min_length=1, max_length=128)


class CreatureOut(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    description: str


class FollowerOut(BaseModel):
    """Extrait d'un profil utilisé pour afficher follower/following lists."""

    id: str
    username: str
    avatarImageUrl: str
    creature: Optional[CreatureOut] = None
    role: str = "user"


class AvatarUpdate(BaseModel):
    avatar_url: Optional[str] = Field(default=None, max_length=1024)
    avatar_image_url: Optional[str] = Field(default=None, max_length=1024)


class InventoryUpdate(BaseModel):
    """Remplace l'inventaire complet (list d'ids) et/ou l'équipement."""

    inventory: Optional[List[str]] = None
    equipped: Optional[Dict[str, str]] = None


class WalletDelta(BaseModel):
    """Crédit / débit atomique sur l'une des bourses.

    Les valeurs peuvent être négatives (débit). Le serveur refuse les soldes
    négatifs finaux (HTTP 400).

    Sylvins split (anti-fraude, cf. `UserProfile`) :

    - `sylvins_paid` / `earnings_paid` : pots **réellement payés en €**
      (webhook Stripe). Seuls ces pots alimentent les retraits streamer.
    - `sylvins_promo` / `earnings_promo` : pots gratuits (daily, events,
      admin top-up). Non retirables.
    - Les champs legacy `sylvins` / `sylvins_earnings` sont routés
      automatiquement vers les pots PROMO côté serveur (rétro-compat) :
      un `sylvins: +100` admin top-up → `+100` en promo.
    - Pour un **débit** legacy (`sylvins: -N`), le serveur consomme d'abord
      le pot PROMO (si suffisant), puis déborde sur PAID. Ça garantit que
      les achats d'items ne grignotent pas le pot retirable avant d'avoir
      épuisé le promo.
    """

    lueurs: int = 0
    sylvins: int = 0
    sylvins_earnings: int = 0
    sylvins_paid: int = 0
    sylvins_promo: int = 0
    earnings_paid: int = 0
    earnings_promo: int = 0
    reason: Optional[str] = Field(default=None, max_length=128)


class GiftItem(BaseModel):
    """Offre un item cosmétique depuis la wishlist d'un autre utilisateur.

    Le serveur :
    - Vérifie que l'item est bien dans la wishlist du receiver (anti-triche :
      on ne peut pas forcer un item quelconque).
    - Vérifie que le receiver ne possède pas déjà l'item.
    - Débite le sender (consomme PROMO d'abord, déborde sur PAID), crédite le
      receiver (inventaire + retire de sa wishlist). Atomique.
    - Price + currency sont portés par le client (catalogue boutique figé
      côté front). Le serveur rejette les prix négatifs (pydantic) et les
      soldes insuffisants.
    """

    receiver_id: str = Field(..., min_length=1, max_length=128)
    item_id: str = Field(..., min_length=1, max_length=128)
    price: int = Field(..., gt=0)
    currency: str = Field(..., pattern=r"^(lueurs|sylvins)$")
    reason: Optional[str] = Field(default=None, max_length=128)


class GiftTransfer(BaseModel):
    """Transfert atomique de Sylvins du pot sender vers les earnings receiver.

    Respecte le split paid/promo : consomme d'abord le pot PROMO du sender
    (si suffisant) puis PAID. Crédite les earnings du receiver dans le pot
    miroir (PROMO → earnings_promo, PAID → earnings_paid). Ça empêche de
    "blanchir" un solde promo en cashable via un gift entre complices.
    """

    receiver_id: str = Field(..., min_length=1, max_length=128)
    amount: int = Field(..., gt=0)
    reason: Optional[str] = Field(default=None, max_length=128)


class StreamerGradeOut(BaseModel):
    """Grade spirituel d'un membre (PR M).

    - `slug` identifie le palier (stable, ex. "gardien-flux").
    - `xp` est le total cumulé ; `progressXp` / `nextXp` sont extraits pour
      alimenter la barre de progression. `nextXp=None` signifie que le
      membre est au palier maximum ("Légende de Vaelyndra").
    - `override=True` quand un admin a forcé le grade (utile pour ne pas
      afficher la progression dans ce cas).
    """

    slug: str
    name: str
    emoji: str
    motto: str
    theme: str
    color: str
    minXp: int
    xp: int
    progressXp: int
    nextXp: Optional[int] = None
    override: bool = False


class UserProfileOut(BaseModel):
    id: str
    username: str
    avatarImageUrl: str
    avatarUrl: Optional[str] = None
    inventory: List[str] = []
    equipped: Dict[str, str] = {}
    # PR G — liste de souhaits (item ids). Exposée partout pour afficher la
    # section "Liste de souhaits" sur /moi et /u/:id + cœur filled/empty dans
    # la boutique.
    wishlist: List[str] = []
    lueurs: int = 0
    # Champs legacy (= pots PROMO) conservés pour les anciens clients qui
    # lisent encore `sylvins` / `sylvinsEarnings`. Un client à jour lit les
    # 4 sous-pots explicites.
    sylvins: int = 0
    sylvinsEarnings: int = 0
    # Nouveaux champs du split paid/promo.
    sylvinsPaid: int = 0
    sylvinsPromo: int = 0
    earningsPaid: int = 0
    earningsPromo: int = 0
    lastDailyAt: Optional[str] = None
    # PR A — créature, rôle, compteurs follow (sources de vérité uniques
    # pour les badges partout dans le front).
    creature: Optional[CreatureOut] = None
    role: str = "user"
    followersCount: int = 0
    followingCount: int = 0
    # PR M — grade spirituel dérivé de streamer_xp (+ override admin).
    grade: Optional[StreamerGradeOut] = None
    createdAt: str
    updatedAt: str


class GradeOverridePayload(BaseModel):
    """Admin override du grade d'un streamer (slug figé, ou None pour retirer)."""

    grade_slug: Optional[str] = Field(default=None, max_length=32)


class XPAdjustPayload(BaseModel):
    """Admin adjust XP — delta signé + raison pour l'audit."""

    delta: int
    reason: Optional[str] = Field(default=None, max_length=128)


class DailyClaimOut(BaseModel):
    granted: int
    already_claimed: bool = False
    profile: UserProfileOut


class GiftTransferOut(BaseModel):
    sender: UserProfileOut
    receiver: UserProfileOut
    consumed_promo: int
    consumed_paid: int


class GiftItemOut(BaseModel):
    """Résultat d'un cadeau d'item (PR G).

    Expose sender + receiver mis à jour (le receiver a l'item dans son
    inventaire + il est retiré de sa wishlist) ainsi que la consommation
    détaillée PROMO/PAID côté sender.
    """

    sender: UserProfileOut
    receiver: UserProfileOut
    consumed_promo: int = 0
    consumed_paid: int = 0


# --- Classement streamers + BFF -------------------------------------------


class StreamerMiniOut(BaseModel):
    """Profil minimal utilisé dans les modules classement / BFF."""

    id: str
    username: str
    avatarImageUrl: str
    creature: Optional[CreatureOut] = None
    role: str = "user"
    grade: Optional["StreamerGradeOut"] = None


class StreamerLeaderboardEntryOut(BaseModel):
    rank: int
    userId: str
    username: str
    avatarImageUrl: str
    totalSylvins: int
    creature: Optional[CreatureOut] = None
    role: str = "user"
    grade: Optional["StreamerGradeOut"] = None


class StreamerLeaderboardOut(BaseModel):
    week: str  # "this" | "last"
    weekStart: str  # ISO date (YYYY-MM-DD)
    weekEnd: str  # ISO datetime (fin de semaine)
    entries: List[StreamerLeaderboardEntryOut] = []


class BFFEntryOut(BaseModel):
    streamer: StreamerMiniOut
    donor: StreamerMiniOut
    totalSylvins: int
