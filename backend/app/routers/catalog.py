"""Endpoints catalogue (boutique + chroniques) — PR #76.

Migration de la boutique et des chroniques du `localStorage` du navigateur
vers la DB backend. Source de vérité unique pour tout le monde, toutes
plateformes, toutes sessions.

Endpoints publics :
- `GET  /catalog/products`                      liste des produits
- `GET  /catalog/articles`                      liste des articles
- `POST /catalog/articles/{id}/like`            toggle like (auth)
- `POST /catalog/articles/{id}/comments`        ajoute un commentaire (auth)

Endpoints admin :
- `POST   /admin/catalog/products`              crée un produit
- `PATCH  /admin/catalog/products/{id}`         modifie un produit
- `DELETE /admin/catalog/products/{id}`         supprime un produit
- Idem pour les articles.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..auth.dependencies import (
    require_admin,
    require_admin_or_animator,
    require_auth,
)
from ..db import get_session
from ..models import CatalogArticle, CatalogProduct, UserProfile


router_public = APIRouter(prefix="/catalog", tags=["catalog"])
router_admin = APIRouter(prefix="/admin/catalog", tags=["catalog-admin"])


def _session_dep():
    with get_session() as session:
        yield session


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_list(raw: str) -> list:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


# --- Produits --------------------------------------------------------------


class ProductOut(BaseModel):
    id: str
    name: str
    tagline: str
    description: str
    price: float
    currency: str
    image: str
    category: str
    sylvins: Optional[int]
    rating: float
    stock: int
    featured: bool
    tags: list[str]


def _product_out(p: CatalogProduct) -> ProductOut:
    return ProductOut(
        id=p.id,
        name=p.name,
        tagline=p.tagline,
        description=p.description,
        price=p.price,
        currency=p.currency,
        image=p.image,
        category=p.category,
        sylvins=p.sylvins,
        rating=p.rating,
        stock=p.stock,
        featured=p.featured,
        tags=_json_list(p.tags_json),
    )


class ProductIn(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=120)
    tagline: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=4000)
    price: float = Field(default=0, ge=0)
    currency: str = Field(default="€", max_length=8)
    image: str = Field(default="", max_length=1000)
    category: str = Field(default="Merch", max_length=40)
    sylvins: Optional[int] = Field(default=None, ge=0)
    rating: float = Field(default=5.0, ge=0, le=5)
    stock: int = Field(default=0, ge=0)
    featured: bool = False
    tags: list[str] = Field(default_factory=list)


class ProductPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    tagline: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=4000)
    price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, max_length=8)
    image: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=40)
    sylvins: Optional[int] = Field(default=None, ge=0)
    rating: Optional[float] = Field(default=None, ge=0, le=5)
    stock: Optional[int] = Field(default=None, ge=0)
    featured: Optional[bool] = None
    tags: Optional[list[str]] = None


@router_public.get("/products", response_model=list[ProductOut])
def list_products(session: Session = Depends(_session_dep)) -> list[ProductOut]:
    rows = session.exec(select(CatalogProduct)).all()
    rows.sort(key=lambda p: (not p.featured, p.created_at or ""))
    return [_product_out(p) for p in rows]


@router_admin.post("/products", response_model=ProductOut)
def create_product(
    body: ProductIn,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> ProductOut:
    pid = body.id or f"prod-{uuid.uuid4().hex[:10]}"
    if session.get(CatalogProduct, pid):
        raise HTTPException(409, "Un produit avec cet id existe déjà.")
    now = _now_iso()
    product = CatalogProduct(
        id=pid,
        name=body.name,
        tagline=body.tagline,
        description=body.description,
        price=body.price,
        currency=body.currency,
        image=body.image,
        category=body.category,
        sylvins=body.sylvins,
        rating=body.rating,
        stock=body.stock,
        featured=body.featured,
        tags_json=json.dumps(body.tags, ensure_ascii=False),
        created_at=now,
        updated_at=now,
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return _product_out(product)


@router_admin.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    body: ProductPatch,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> ProductOut:
    product = session.get(CatalogProduct, product_id)
    if product is None:
        raise HTTPException(404, "Produit introuvable.")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if key == "tags":
            product.tags_json = json.dumps(val or [], ensure_ascii=False)
        else:
            setattr(product, key, val)
    product.updated_at = _now_iso()
    session.add(product)
    session.commit()
    session.refresh(product)
    return _product_out(product)


@router_admin.delete("/products/{product_id}")
def delete_product(
    product_id: str,
    admin: UserProfile = Depends(require_admin),
    session: Session = Depends(_session_dep),
) -> dict:
    product = session.get(CatalogProduct, product_id)
    if product is None:
        raise HTTPException(404, "Produit introuvable.")
    session.delete(product)
    session.commit()
    return {"status": "ok", "deletedId": product_id}


# --- Articles --------------------------------------------------------------


class ArticleCommentOut(BaseModel):
    id: str
    authorId: str
    authorName: str
    authorAvatar: str = ""
    content: str
    createdAt: str
    likes: list[str] = Field(default_factory=list)


class ArticleOut(BaseModel):
    id: str
    slug: str
    title: str
    excerpt: str
    content: str
    category: str
    cover: str
    author: str
    readingTime: int
    tags: list[str]
    likes: list[str]
    comments: list[ArticleCommentOut]
    createdAt: str


def _article_out(a: CatalogArticle) -> ArticleOut:
    raw_comments = _json_list(a.comments_json)
    comments: list[ArticleCommentOut] = []
    for c in raw_comments:
        if not isinstance(c, dict):
            continue
        try:
            comments.append(ArticleCommentOut(**c))
        except Exception:
            continue
    return ArticleOut(
        id=a.id,
        slug=a.slug,
        title=a.title,
        excerpt=a.excerpt,
        content=a.content,
        category=a.category,
        cover=a.cover,
        author=a.author,
        readingTime=a.reading_time,
        tags=_json_list(a.tags_json),
        likes=[x for x in _json_list(a.likes_json) if isinstance(x, str)],
        comments=comments,
        createdAt=a.created_at,
    )


class ArticleIn(BaseModel):
    id: Optional[str] = None
    slug: str = Field(..., min_length=1, max_length=200)
    title: str = Field(..., min_length=1, max_length=300)
    excerpt: str = Field(default="", max_length=1000)
    content: str = Field(default="", max_length=100_000)
    category: str = Field(default="Lore", max_length=40)
    cover: str = Field(default="", max_length=1000)
    author: str = Field(default="", max_length=120)
    readingTime: int = Field(default=3, ge=0, le=600)
    tags: list[str] = Field(default_factory=list)


class ArticlePatch(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=1, max_length=200)
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    excerpt: Optional[str] = Field(default=None, max_length=1000)
    content: Optional[str] = Field(default=None, max_length=100_000)
    category: Optional[str] = Field(default=None, max_length=40)
    cover: Optional[str] = Field(default=None, max_length=1000)
    author: Optional[str] = Field(default=None, max_length=120)
    readingTime: Optional[int] = Field(default=None, ge=0, le=600)
    tags: Optional[list[str]] = None


class ArticleCommentIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


@router_public.get("/articles", response_model=list[ArticleOut])
def list_articles(session: Session = Depends(_session_dep)) -> list[ArticleOut]:
    rows = session.exec(select(CatalogArticle)).all()
    rows.sort(key=lambda a: a.created_at or "", reverse=True)
    return [_article_out(a) for a in rows]


@router_public.post("/articles/{article_id}/like", response_model=ArticleOut)
def toggle_article_like(
    article_id: str,
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> ArticleOut:
    article = session.get(CatalogArticle, article_id)
    if article is None:
        raise HTTPException(404, "Article introuvable.")
    likes = [x for x in _json_list(article.likes_json) if isinstance(x, str)]
    if me.id in likes:
        likes = [uid for uid in likes if uid != me.id]
    else:
        likes.append(me.id)
    article.likes_json = json.dumps(likes, ensure_ascii=False)
    article.updated_at = _now_iso()
    session.add(article)
    session.commit()
    session.refresh(article)
    return _article_out(article)


@router_public.post(
    "/articles/{article_id}/comments", response_model=ArticleOut
)
def add_article_comment(
    article_id: str,
    body: ArticleCommentIn,
    me: UserProfile = Depends(require_auth),
    session: Session = Depends(_session_dep),
) -> ArticleOut:
    article = session.get(CatalogArticle, article_id)
    if article is None:
        raise HTTPException(404, "Article introuvable.")
    comments = _json_list(article.comments_json)
    comments.append(
        {
            "id": f"c-{uuid.uuid4().hex[:10]}",
            "authorId": me.id,
            "authorName": me.username,
            "authorAvatar": me.avatar_image_url or "",
            "content": body.content.strip(),
            "createdAt": _now_iso(),
            "likes": [],
        }
    )
    article.comments_json = json.dumps(comments, ensure_ascii=False)
    article.updated_at = _now_iso()
    session.add(article)
    session.commit()
    session.refresh(article)
    return _article_out(article)


@router_admin.post("/articles", response_model=ArticleOut)
def create_article(
    body: ArticleIn,
    editor: UserProfile = Depends(require_admin_or_animator),
    session: Session = Depends(_session_dep),
) -> ArticleOut:
    aid = body.id or f"art-{uuid.uuid4().hex[:10]}"
    if session.get(CatalogArticle, aid):
        raise HTTPException(409, "Un article avec cet id existe déjà.")
    now = _now_iso()
    article = CatalogArticle(
        id=aid,
        slug=body.slug,
        title=body.title,
        excerpt=body.excerpt,
        content=body.content,
        category=body.category,
        cover=body.cover,
        author=body.author,
        reading_time=body.readingTime,
        tags_json=json.dumps(body.tags, ensure_ascii=False),
        likes_json="[]",
        comments_json="[]",
        created_at=now,
        updated_at=now,
    )
    session.add(article)
    session.commit()
    session.refresh(article)
    return _article_out(article)


@router_admin.patch("/articles/{article_id}", response_model=ArticleOut)
def update_article(
    article_id: str,
    body: ArticlePatch,
    editor: UserProfile = Depends(require_admin_or_animator),
    session: Session = Depends(_session_dep),
) -> ArticleOut:
    article = session.get(CatalogArticle, article_id)
    if article is None:
        raise HTTPException(404, "Article introuvable.")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if key == "tags":
            article.tags_json = json.dumps(val or [], ensure_ascii=False)
        elif key == "readingTime":
            article.reading_time = val
        else:
            setattr(article, key, val)
    article.updated_at = _now_iso()
    session.add(article)
    session.commit()
    session.refresh(article)
    return _article_out(article)


@router_admin.delete("/articles/{article_id}")
def delete_article(
    article_id: str,
    editor: UserProfile = Depends(require_admin_or_animator),
    session: Session = Depends(_session_dep),
) -> dict:
    article = session.get(CatalogArticle, article_id)
    if article is None:
        raise HTTPException(404, "Article introuvable.")
    session.delete(article)
    session.commit()
    return {"status": "ok", "deletedId": article_id}
