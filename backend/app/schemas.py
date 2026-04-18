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
