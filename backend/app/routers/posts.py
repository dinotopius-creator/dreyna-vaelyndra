"""Endpoints REST pour les posts de la cour."""
from __future__ import annotations

import os
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
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
from ..models import (  # noqa: E402
    Comment,
    CommunityActivityReward,
    Post,
    Reaction,
    UserProfile,
)
from ..schemas import (  # noqa: E402
    CommentCreate,
    CommunityActivityEntryOut,
    CommunityActivityLeaderboardOut,
    CommentOut,
    CommunityActivityRewardOut,
    CommunityActivityRewardSyncOut,
    PostCreate,
    PostOut,
    ReactionToggle,
)


# PR M — XP offert à l'auteur quand son post est publié. Volontairement bas
# (10 XP = 10 % d'un palier de base) pour éviter qu'un spam de posts vides
# ne propulse un compte dans les grades supérieurs. Le gros du XP vient des
# Sylvins reçus (=engagement) et des nouveaux liens d'âme.
XP_PER_POST = 10
COMMUNITY_REWARD_BY_RANK = {1: 600, 2: 450, 3: 300}
MOCK_COMMUNITY_USER_IDS = {
    "user-lyria",
    "user-caelum",
    "user-mira",
    "user-aeris",
    "user-sylas",
    "user-thalia",
}


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


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _week_start(date: datetime | None = None) -> datetime:
    now = (date or datetime.now(UTC)).astimezone(UTC)
    return datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(
        days=now.weekday()
    )


def _serialize_reward(row: CommunityActivityReward) -> CommunityActivityRewardOut:
    return CommunityActivityRewardOut(
        weekStartIso=row.week_start_iso,
        userId=row.user_id,
        rank=row.rank,
        rewardLueurs=row.reward_lueurs,
        awardedAt=row.awarded_at,
    )


def _community_activity_rows(
    session: Session,
    week_start: datetime,
) -> list[dict]:
    week_end = week_start + timedelta(days=7)
    week_start_iso = week_start.isoformat()
    week_end_iso = week_end.isoformat()
    profiles = {
        p.id: p
        for p in session.exec(select(UserProfile)).all()
        if p.id not in MOCK_COMMUNITY_USER_IDS and p.banned_at is None
    }

    stats: dict[str, dict] = {}

    def ensure_member(user_id: str, username: str = "", avatar: str = "") -> dict | None:
        if not user_id or user_id in MOCK_COMMUNITY_USER_IDS:
            return None
        profile = profiles.get(user_id)
        if profile is None:
            return None
        current = stats.get(user_id)
        if current is None:
            current = {
                "id": user_id,
                "username": profile.username or username,
                "handle": profile.handle,
                "avatarImageUrl": profile.avatar_image_url or avatar,
                "postCount": 0,
                "commentCount": 0,
                "reactionCount": 0,
                "score": 0,
                "latestActivity": "",
            }
            stats[user_id] = current
        return current

    posts = session.exec(
        select(Post)
        .where(Post.created_at >= week_start_iso)
        .where(Post.created_at < week_end_iso)
        .order_by(Post.created_at.desc())
    ).all()
    for post in posts:
        member = ensure_member(post.author_id, post.author_name, post.author_avatar)
        if member is None:
            continue
        member["postCount"] += 1
        created_at = _parse_iso(post.created_at)
        if created_at is not None:
            member["latestActivity"] = max(
                member["latestActivity"], created_at.isoformat()
            )

    comments = session.exec(
        select(Comment)
        .where(Comment.created_at >= week_start_iso)
        .where(Comment.created_at < week_end_iso)
    ).all()
    for comment in comments:
        member = ensure_member(
            comment.author_id, comment.author_name, comment.author_avatar
        )
        if member is None:
            continue
        member["commentCount"] += 1
        created_at = _parse_iso(comment.created_at)
        if created_at is not None:
            member["latestActivity"] = max(
                member["latestActivity"], created_at.isoformat()
            )

    reactions = session.exec(
        select(Reaction)
        .where(Reaction.created_at >= week_start_iso)
        .where(Reaction.created_at < week_end_iso)
    ).all()
    for reaction in reactions:
        member = ensure_member(reaction.user_id)
        if member is None:
            continue
        member["reactionCount"] += 1
        created_at = _parse_iso(reaction.created_at)
        if created_at is not None:
            member["latestActivity"] = max(
                member["latestActivity"], created_at.isoformat()
            )

    rows = []
    for member in stats.values():
        if (
            member["postCount"] <= 0
            and member["commentCount"] <= 0
            and member["reactionCount"] <= 0
        ):
            continue
        member["score"] = (
            member["postCount"] * 12
            + member["commentCount"] * 4
            + member["reactionCount"] * 2
        )
        rows.append(member)

    rows.sort(
        key=lambda row: (
            -row["score"],
            -row["postCount"],
            -row["commentCount"],
            -row["reactionCount"],
            -int((_parse_iso(row["latestActivity"]) or week_start).timestamp()),
            row["username"].lower(),
        )
    )
    return rows


def _serialize_activity_entry(row: dict) -> CommunityActivityEntryOut:
    return CommunityActivityEntryOut(
        id=row["id"],
        username=row["username"],
        handle=row.get("handle"),
        avatarImageUrl=row.get("avatarImageUrl") or "",
        postCount=int(row.get("postCount") or 0),
        commentCount=int(row.get("commentCount") or 0),
        reactionCount=int(row.get("reactionCount") or 0),
        score=int(row.get("score") or 0),
        latestActivity=row.get("latestActivity") or None,
    )


def _sync_previous_week_rewards(
    session: Session,
) -> tuple[str, list[CommunityActivityReward], list[CommunityActivityReward]]:
    previous_week = _week_start() - timedelta(days=7)
    week_start_iso = previous_week.isoformat()
    existing = session.exec(
        select(CommunityActivityReward).where(
            CommunityActivityReward.week_start_iso == week_start_iso
        )
    ).all()
    if existing:
        return week_start_iso, [], existing

    leaderboard = _community_activity_rows(session, previous_week)
    awarded: list[CommunityActivityReward] = []
    for rank, row in enumerate(leaderboard[:3], start=1):
        reward = COMMUNITY_REWARD_BY_RANK.get(rank, 0)
        if reward <= 0:
            continue
        winner = session.get(UserProfile, row["id"])
        if winner is None or winner.banned_at is not None:
            continue
        winner.lueurs += reward
        entry = CommunityActivityReward(
            week_start_iso=week_start_iso,
            user_id=winner.id,
            rank=rank,
            reward_lueurs=reward,
        )
        session.add(entry)
        awarded.append(entry)

    if awarded:
        session.commit()
        for entry in awarded:
            session.refresh(entry)
        return week_start_iso, awarded, []

    session.rollback()
    return week_start_iso, [], []


def _resolve_handles(
    session: Session, author_ids: List[str]
) -> Dict[str, str]:
    """PR S — Résout les `@handle` pour une liste d'author_id en 1 requête.

    On ne snapshot pas le handle sur Post/Comment (contrairement au pseudo/
    avatar) pour qu'un renommage côté user se propage à tous ses anciens
    posts. Le cache local frontend revient de toute façon à 0 tous les
    refresh, donc l'impact perf d'une jointure par liste est négligeable.
    """
    unique_ids = [uid for uid in {aid for aid in author_ids if aid} if uid]
    if not unique_ids:
        return {}
    rows = session.exec(
        select(UserProfile).where(UserProfile.id.in_(unique_ids))
    ).all()
    return {p.id: p.handle for p in rows if p.handle}


def _serialize_post(
    post: Post,
    reactions: Dict[str, List[str]],
    comments: List[Comment],
    handles: Dict[str, str] | None = None,
) -> PostOut:
    handles = handles or {}
    return PostOut(
        id=post.id,
        authorId=post.author_id,
        authorName=post.author_name,
        authorHandle=handles.get(post.author_id),
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
                authorHandle=handles.get(c.author_id),
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

    # PR S — on résout les handles en 1 requête pour tout l'affichage.
    all_author_ids: List[str] = [p.author_id for p in posts]
    for comment_list in comments_by_post.values():
        all_author_ids.extend(c.author_id for c in comment_list)
    handles = _resolve_handles(session, all_author_ids)

    return [
        _serialize_post(
            p,
            {emoji: users for emoji, users in reactions_by_post[p.id].items()},
            comments_by_post[p.id],
            handles,
        )
        for p in posts
    ]


@router.get(
    "/activity-leaderboard", response_model=CommunityActivityLeaderboardOut
)
def community_activity_leaderboard(
    limit: int = 5,
    session: Session = Depends(_session_dep),
) -> CommunityActivityLeaderboardOut:
    safe_limit = max(1, min(int(limit or 5), 10))
    week_start = _week_start()
    rows = _community_activity_rows(session, week_start)[:safe_limit]
    return CommunityActivityLeaderboardOut(
        weekStartIso=week_start.isoformat(),
        entries=[_serialize_activity_entry(row) for row in rows],
    )


@router.post(
    "/activity-rewards/sync", response_model=CommunityActivityRewardSyncOut
)
def sync_community_activity_rewards(
    session: Session = Depends(_session_dep),
) -> CommunityActivityRewardSyncOut:
    week_start_iso, newly_awarded, already_awarded = _sync_previous_week_rewards(
        session
    )
    return CommunityActivityRewardSyncOut(
        weekStartIso=week_start_iso,
        newlyAwarded=[_serialize_reward(row) for row in newly_awarded],
        alreadyAwarded=[_serialize_reward(row) for row in already_awarded],
    )


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
    handles = _resolve_handles(session, [post.author_id])
    return _serialize_post(post, {}, [], handles)


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
    handles = _resolve_handles(
        session, [post.author_id, *[c.author_id for c in comments]]
    )
    return _serialize_post(post, dict(by_emoji), comments, handles)


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
    handles = _resolve_handles(session, [comment.author_id])
    return CommentOut(
        id=comment.id,
        authorId=comment.author_id,
        authorName=comment.author_name,
        authorHandle=handles.get(comment.author_id),
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
