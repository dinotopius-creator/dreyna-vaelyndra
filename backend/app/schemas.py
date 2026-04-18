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
    """

    id: str = Field(..., min_length=1, max_length=128)
    username: str = Field(..., min_length=1, max_length=64)
    avatar_image_url: str = Field(..., min_length=1, max_length=1024)


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
    """

    lueurs: int = 0
    sylvins: int = 0
    sylvins_earnings: int = 0
    reason: Optional[str] = Field(default=None, max_length=128)


class UserProfileOut(BaseModel):
    id: str
    username: str
    avatarImageUrl: str
    avatarUrl: Optional[str] = None
    inventory: List[str] = []
    equipped: Dict[str, str] = {}
    lueurs: int = 0
    sylvins: int = 0
    sylvinsEarnings: int = 0
    lastDailyAt: Optional[str] = None
    createdAt: str
    updatedAt: str


class DailyClaimOut(BaseModel):
    granted: int
    already_claimed: bool = False
    profile: UserProfileOut
