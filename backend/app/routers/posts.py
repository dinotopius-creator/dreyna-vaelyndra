"""Endpoints REST pour les posts de la cour."""
from __future__ import annotations

import os
import uuid
from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

# Ensemble des identifiants autorisés à modérer n'importe quel contenu du fil
# (reine et potentiels co-modérateurs). Configurable via la variable
# d'environnement VAELYNDRA_QUEEN_IDS (ids séparés par une virgule).
_QUEEN_IDS = {
    uid.strip()
    for uid in os.environ.get("VAELYNDRA_QUEEN_IDS", "user-dreyna").split(",")
    if uid.strip()
}


from ..db import get_session  # noqa: E402
from ..models import Comment, Post, Reaction, UserProfile  # noqa: E402
from ..schemas import (  # noqa: E402
    CommentCreate,
    CommentOut,
    PostCreate,
    PostOut,
    ReactionToggle,
)


# PR M — XP offert à l'auteur quand son post est publié. Volontairement bas
# (10 XP = 10 % d'un palier de base) pour éviter qu'un spam de posts vides
# ne propulse un compte dans les grades supérieurs. Le gros du XP vient des
# Sylvins reçus (=engagement) et des nouveaux liens d'âme.
XP_PER_POST = 10


def _is_queen(user_id: str) -> bool:
    """Legacy check : user id listé dans l'env VAELYNDRA_QUEEN_IDS."""
    return user_id in _QUEEN_IDS


# Rôles qui peuvent modérer n'importe quel contenu du fil (supprimer les
# posts/commentaires d'autres utilisateurs). `queen` est conservé pour la
# rétro-compatibilité avec les comptes seedés avant PR R ; `admin` est le
# rôle actuel dans le panneau d'administration.
_MOD_ROLES = {"admin", "queen"}


def _is_moderator(session: Session, user_id: str) -> bool:
    """Autorise la modération si :
    - l'id est dans la liste legacy VAELYNDRA_QUEEN_IDS, OU
    - l'utilisateur a `role in {"admin", "queen"}` dans UserProfile.
    """
    if _is_queen(user_id):
        return True
    user = session.get(UserProfile, user_id)
    return bool(user and (user.role or "user") in _MOD_ROLES)


router = APIRouter(prefix="/posts", tags=["posts"])


def _session_dep():
    with get_session() as session:
        yield session


def _generate_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _sanitize_avatar(raw: str) -> str:
    """Évite de stocker un data URI (upload base64, jusqu'à ~200 KB) dans
    chaque row posts/comments. Si l'avatar est une URL classique (http/https),
    on la garde tronquée à 512 chars ; sinon (data URI, chaîne inconnue trop
    longue), on stocke une chaîne vide — le frontend résoudra l'avatar via
    l'auteur grâce à `author_id`.
    """
    if not raw:
        return ""
    if raw.startswith("data:"):
        return ""
    if len(raw) > 512:
        return ""
    return raw


def _serialize_post(
    post: Post,
    reactions: Dict[str, List[str]],
    comments: List[Comment],
) -> PostOut:
    return PostOut(
        id=post.id,
        authorId=post.author_id,
        authorName=post.author_name,
        authorAvatar=post.author_avatar,
        content=post.content,
        imageUrl=post.image_url,
        videoUrl=post.video_url,
        createdAt=post.created_at,
        reactions=reactions,
        comments=[
            CommentOut(
                id=c.id,
                authorId=c.author_id,
                authorName=c.author_name,
                authorAvatar=c.author_avatar,
                content=c.content,
                createdAt=c.created_at,
                likes=[],
            )
            for c in comments
        ],
    )


@router.get("", response_model=List[PostOut])
def list_posts(session: Session = Depends(_session_dep)) -> List[PostOut]:
    posts = session.exec(select(Post).order_by(Post.created_at.desc())).all()
    if not posts:
        return []
    post_ids = [p.id for p in posts]

    reactions_by_post: Dict[str, Dict[str, List[str]]] = defaultdict(
        lambda: defaultdict(list)
    )
    comments_by_post: Dict[str, List[Comment]] = defaultdict(list)

    reactions = session.exec(
        select(Reaction).where(Reaction.post_id.in_(post_ids))
    ).all()
    for r in reactions:
        reactions_by_post[r.post_id][r.emoji].append(r.user_id)

    comments = session.exec(
        select(Comment)
        .where(Comment.post_id.in_(post_ids))
        .order_by(Comment.created_at.asc())
    ).all()
    for c in comments:
        comments_by_post[c.post_id].append(c)

    return [
        _serialize_post(
            p,
            {emoji: users for emoji, users in reactions_by_post[p.id].items()},
            comments_by_post[p.id],
        )
        for p in posts
    ]


@router.post("", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreate, session: Session = Depends(_session_dep)
) -> PostOut:
    post = Post(
        id=_generate_id("post"),
        author_id=payload.author_id,
        author_name=payload.author_name,
        author_avatar=_sanitize_avatar(payload.author_avatar),
        content=payload.content,
        image_url=payload.image_url,
        video_url=payload.video_url,
    )
    session.add(post)
    # PR M — crédit XP à l'auteur. On fait un `get` sur la clé primaire
    # plutôt qu'une requête indexée : la plupart des auteurs ont déjà un
    # profil en DB (créé lors du premier login). Si le profil n'existe pas
    # (cas d'un compte externe / historique), on skip silencieusement.
    author = session.get(UserProfile, payload.author_id)
    if author is not None:
        author.streamer_xp = (author.streamer_xp or 0) + XP_PER_POST
    session.commit()
    session.refresh(post)
    return _serialize_post(post, {}, [])


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: str,
    user_id: str,
    session: Session = Depends(_session_dep),
) -> None:
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post introuvable.")
    # L'auteur du post ou un·e modérateur·rice (admin/queen) peut supprimer.
    if post.author_id != user_id and not _is_moderator(session, user_id):
        raise HTTPException(status_code=403, detail="Interdit.")

    session.exec(
        Comment.__table__.delete().where(Comment.post_id == post_id)  # type: ignore[attr-defined]
    )
    session.exec(
        Reaction.__table__.delete().where(Reaction.post_id == post_id)  # type: ignore[attr-defined]
    )
    session.delete(post)
    session.commit()


@router.post("/{post_id}/reactions", response_model=PostOut)
def toggle_reaction(
    post_id: str,
    payload: ReactionToggle,
    session: Session = Depends(_session_dep),
) -> PostOut:
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post introuvable.")

    existing = session.exec(
        select(Reaction).where(
            Reaction.post_id == post_id,
            Reaction.user_id == payload.user_id,
            Reaction.emoji == payload.emoji,
        )
    ).first()
    if existing:
        session.delete(existing)
    else:
        session.add(
            Reaction(
                post_id=post_id,
                user_id=payload.user_id,
                emoji=payload.emoji,
            )
        )
    session.commit()

    reactions = session.exec(
        select(Reaction).where(Reaction.post_id == post_id)
    ).all()
    by_emoji: Dict[str, List[str]] = defaultdict(list)
    for r in reactions:
        by_emoji[r.emoji].append(r.user_id)
    comments = session.exec(
        select(Comment)
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
    ).all()
    return _serialize_post(post, dict(by_emoji), comments)


@router.post(
    "/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
)
def add_comment(
    post_id: str,
    payload: CommentCreate,
    session: Session = Depends(_session_dep),
) -> CommentOut:
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post introuvable.")
    comment = Comment(
        id=_generate_id("comment"),
        post_id=post_id,
        author_id=payload.author_id,
        author_name=payload.author_name,
        author_avatar=_sanitize_avatar(payload.author_avatar),
        content=payload.content,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return CommentOut(
        id=comment.id,
        authorId=comment.author_id,
        authorName=comment.author_name,
        authorAvatar=comment.author_avatar,
        content=comment.content,
        createdAt=comment.created_at,
        likes=[],
    )


@router.delete(
    "/{post_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    post_id: str,
    comment_id: str,
    user_id: str,
    session: Session = Depends(_session_dep),
) -> None:
    comment = session.get(Comment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail="Commentaire introuvable.")
    # Peuvent supprimer : l'auteur du commentaire, l'auteur du post parent,
    # et les modérateur·rice·s (admin / queen).
    post = session.get(Post, post_id)
    post_author_id = post.author_id if post else None
    if (
        comment.author_id != user_id
        and post_author_id != user_id
        and not _is_moderator(session, user_id)
    ):
        raise HTTPException(status_code=403, detail="Interdit.")
    session.delete(comment)
    session.commit()
