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
    - `lueurs` est la monnaie gratuite (daily claim, récompenses), `sylvins`
      la monnaie premium (packs achetés).
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
    lueurs: int = Field(default=0)
    sylvins: int = Field(default=0)
    sylvins_earnings: int = Field(default=0)
    last_daily_at: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
