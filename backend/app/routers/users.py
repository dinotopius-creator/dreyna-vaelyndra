"""Endpoints REST pour les profils utilisateurs (avatar, inventaire, bourses)."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

logger = logging.getLogger(__name__)

from ..auth.dependencies import require_auth
from ..creatures import CREATURES, get_creature
from ..db import get_session
from ..grades import (
    LEGEND_SLUG,
    grade_by_slug,
    grade_for_xp,
    next_grade,
    progress_in_current_grade,
)
from ..handles import (
    is_valid_handle,
    slugify_handle,
    suggest_unique_handle,
)
from ..models import Follow, GiftLedger, UserProfile
from .messages import (
    DIRECT_MESSAGE_LEGEND_SACRE,
    DREYNA_USER_ID,
    post_system_dm,
)
from .streamers import iso_week_start
from ..schemas import (
    AvatarUpdate,
    CreatureChoice,
    CreatureOut,
    DailyClaimOut,
    FollowAction,
    FollowerOut,
    GiftItem,
    GiftItemOut,
    GiftTransfer,
    GiftTransferOut,
    GradeOverridePayload,
    HandleUpdate,
    InventoryUpdate,
    StreamerGradeOut,
    UserProfileOut,
    UserProfileUpsert,
    UserSearchHitOut,
    WalletDelta,
    XPAdjustPayload,
)


# PR M — XP gagné par type d'activité pour les deux flux accordés dans ce
# fichier (réception de Sylvins via gift + nouveau follower). Le troisième flux
# XP (post créé) vit dans `routers/posts.py` avec sa propre constante
# `XP_PER_POST`, au plus près de la route qui le déclenche — ne pas dupliquer
# ici pour éviter qu'un mainteneur change la valeur dans users.py et croie
# avoir mis à jour la règle côté posts.
XP_PER_SYLVIN_RECEIVED = 1
XP_PER_SUBSCRIBER = 50


router = APIRouter(prefix="/users", tags=["users"])


# Récompense quotidienne : 50 Lueurs / jour (cooldown 20 h pour lisser l'heure
# de connexion — comme la plupart des jeux mobiles).
DAILY_REWARD_LUEURS = 50
DAILY_COOLDOWN = timedelta(hours=20)

# Comptes officiels suivis automatiquement à la création d'un nouveau profil.
# `Le roi des zems💎` est admin (tous droits) ; les deux autres sont
# animatrices (badge 🎭 uniquement). Sources de vérité côté seed (cf.
# `app.main.seed_official_accounts`).
OFFICIAL_FOLLOW_TARGETS: list[str] = [
    "user-dreyna",
    "user-kamestars",
    "user-roi-des-zems",
]


def _session_dep():
    with get_session() as session:
        yield session


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _creature_out(creature_id: str | None) -> CreatureOut | None:
    c = get_creature(creature_id)
    if c is None:
        return None
    return CreatureOut(**c)


def _count_follows(session: Session, user_id: str) -> tuple[int, int]:
    """Compte (followers, following) pour un user en 2 requêtes SQL."""
    followers = session.exec(
        select(Follow).where(Follow.following_id == user_id)
    ).all()
    following = session.exec(
        select(Follow).where(Follow.follower_id == user_id)
    ).all()
    return len(followers), len(following)


def _grade_out(p: UserProfile) -> StreamerGradeOut:
    """Calcule le grade spirituel pour un profil.

    - Si `streamer_grade_override` est posé et pointe vers un slug valide,
      on affiche ce grade forcé avec `override=True` et on gèle la barre
      de progression sur son propre palier.
    - Sinon on dérive le grade depuis `streamer_xp` (source de vérité).
    """
    xp = max(0, int(p.streamer_xp or 0))
    override_slug = p.streamer_grade_override
    override_grade = grade_by_slug(override_slug) if override_slug else None
    if override_grade is not None:
        nxt = next_grade(override_grade)
        return StreamerGradeOut(
            slug=override_grade.slug,
            name=override_grade.name,
            short=override_grade.short,
            emoji=override_grade.emoji,
            motto=override_grade.motto,
            theme=override_grade.theme,
            color=override_grade.color,
            minXp=override_grade.min_xp,
            xp=xp,
            progressXp=0,
            nextXp=(nxt.min_xp - override_grade.min_xp) if nxt else None,
            override=True,
        )
    g = grade_for_xp(xp)
    progress, next_threshold = progress_in_current_grade(xp)
    return StreamerGradeOut(
        slug=g.slug,
        name=g.name,
        short=g.short,
        emoji=g.emoji,
        motto=g.motto,
        theme=g.theme,
        color=g.color,
        minXp=g.min_xp,
        xp=xp,
        progressXp=progress,
        nextXp=next_threshold,
        override=False,
    )


def _to_out(p: UserProfile, session: Session | None = None) -> UserProfileOut:
    # Pour un client à jour, on expose les 4 sous-pots explicites. Les
    # champs legacy `sylvins` / `sylvinsEarnings` retournent la somme
    # paid+promo pour les clients qui ne savent pas encore lire le split.
    # (Avant PR 5, la colonne `sylvins` stockait tout ; depuis, elle ne
    # stocke plus que le PROMO. On préserve la sémantique "solde total" côté
    # DTO pour rester rétro-compatible.)
    followers_count = 0
    following_count = 0
    if session is not None:
        followers_count, following_count = _count_follows(session, p.id)
    return UserProfileOut(
        id=p.id,
        username=p.username,
        handle=p.handle,
        handleUpdatedAt=p.handle_updated_at,
        avatarImageUrl=p.avatar_image_url,
        avatarUrl=p.avatar_url,
        inventory=json.loads(p.inventory_json or "[]"),
        equipped=json.loads(p.equipped_json or "{}"),
        wishlist=json.loads(p.wishlist_json or "[]"),
        lueurs=p.lueurs,
        sylvins=p.sylvins + p.sylvins_paid,
        sylvinsEarnings=p.sylvins_earnings + p.earnings_paid,
        sylvinsPaid=p.sylvins_paid,
        sylvinsPromo=p.sylvins,
        earningsPaid=p.earnings_paid,
        earningsPromo=p.sylvins_earnings,
        lastDailyAt=p.last_daily_at,
        creature=_creature_out(p.creature_id),
        role=p.role or "user",
        followersCount=followers_count,
        followingCount=following_count,
        grade=_grade_out(p),
        createdAt=p.created_at,
        updatedAt=p.updated_at,
    )


def _touch(p: UserProfile) -> None:
    p.updated_at = _now().isoformat()


@router.get("", response_model=List[UserProfileOut])
def list_users(session: Session = Depends(_session_dep)) -> List[UserProfileOut]:
    rows = session.exec(select(UserProfile)).all()
    return [_to_out(p, session) for p in rows]


@router.get("/search", response_model=List[UserSearchHitOut])
def search_users(
    q: str = "",
    limit: int = 10,
    session: Session = Depends(_session_dep),
) -> List[UserSearchHitOut]:
    """PR S — Recherche de membres par `@handle` ou pseudo.

    - `q` : terme saisi par l'utilisateur. Peut commencer par `@` (strippé).
      Case-insensitive. Si vide / trop court, renvoie `[]` pour éviter
      d'exposer l'annuaire complet aux bots (privacy-friendly).
    - Match : prefix match sur `handle`, puis LIKE `%q%` sur `username` /
      `handle` pour repêcher les variantes (accents, emojis dans le
      pseudo). Les users bannis sont exclus.
    - Tri : on privilégie les matchs qui commencent par `q` (prefix),
      puis le reste, par ordre alphabétique.
    - `limit` bloqué entre 1 et 20 côté serveur pour ne pas laisser un
      client exfiltrer trop en une seule requête.
    """
    raw = (q or "").strip().lstrip("@").lower()
    if len(raw) < 1:
        return []
    # Protection : on exige au moins 1 char, et on plafonne la longueur
    # du terme pour limiter l'empreinte SQL.
    term = raw[:40]
    safe_limit = max(1, min(int(limit or 10), 20))

    # On rappelle un peu plus que le limit pour pouvoir re-trier en
    # Python par type de match (prefix > contains) avant de couper.
    raw_rows = session.exec(
        select(UserProfile)
        .where(UserProfile.banned_at.is_(None))  # type: ignore[attr-defined]
    ).all()

    prefix_matches: list[UserProfile] = []
    contains_matches: list[UserProfile] = []
    for p in raw_rows:
        handle_l = (p.handle or "").lower()
        username_l = (p.username or "").lower()
        if handle_l.startswith(term) or username_l.startswith(term):
            prefix_matches.append(p)
        elif term in handle_l or term in username_l:
            contains_matches.append(p)

    prefix_matches.sort(key=lambda p: (p.handle or p.username or "").lower())
    contains_matches.sort(key=lambda p: (p.handle or p.username or "").lower())
    combined = (prefix_matches + contains_matches)[:safe_limit]

    return [
        UserSearchHitOut(
            id=p.id,
            username=p.username,
            handle=p.handle,
            avatarImageUrl=p.avatar_image_url,
            creature=_creature_out(p.creature_id),
            role=p.role or "user",
        )
        for p in combined
    ]


@router.get("/{user_id}", response_model=UserProfileOut)
def get_user(
    user_id: str, session: Session = Depends(_session_dep)
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    return _to_out(p, session)


def _auto_follow_officials(session: Session, follower_id: str) -> None:
    """Abonne automatiquement un nouveau user aux 3 comptes officiels.

    Idempotent : l'index unique `follow_unique_pair` ignore silencieusement
    les doublons si la fonction est rappelée. Sauté pour les comptes
    officiels eux-mêmes (pas de self-follow, pas de boucle).
    """
    for target_id in OFFICIAL_FOLLOW_TARGETS:
        if target_id == follower_id:
            continue
        # Vérifie l'existence du compte officiel avant d'insérer la relation
        # (inutile de créer un follow fantôme si le seed n'est pas encore
        # passé en local).
        if session.get(UserProfile, target_id) is None:
            continue
        existing = session.exec(
            select(Follow)
            .where(Follow.follower_id == follower_id)
            .where(Follow.following_id == target_id)
        ).first()
        if existing is not None:
            continue
        session.add(
            Follow(follower_id=follower_id, following_id=target_id)
        )


@router.post("", response_model=UserProfileOut)
def upsert_user(
    payload: UserProfileUpsert, session: Session = Depends(_session_dep)
) -> UserProfileOut:
    """Crée le profil si absent, sinon rafraîchit juste le pseudo/avatar image.

    À la **création** :
    - Enregistre la créature choisie (obligatoire côté front mais
      rétro-compatible ici : un client pré-PR A peut omettre le champ).
    - Abonne automatiquement le nouveau user aux 3 comptes officiels
      (dreyna, Kamestars LV, Le roi des zems💎).
    """
    # PR S — pour l'insertion d'un nouveau profil, on retry jusqu'à 3 fois
    # en cas d'IntegrityError sur le handle (deux inscriptions simultanées
    # avec le même pseudo peuvent calculer le même candidat et se marcher
    # dessus à cause de l'index unique partiel). Toute la création (flush
    # + _auto_follow_officials qui peut déclencher un autoflush + commit)
    # doit être dans le try/except pour attraper l'IntegrityError quel
    # que soit son point de déclenchement.
    base_handle = slugify_handle(payload.username)
    for attempt in range(3):
        p = session.get(UserProfile, payload.id)
        is_new = p is None
        try:
            if p is None:
                creature_id = payload.creature_id
                if creature_id is not None and get_creature(creature_id) is None:
                    creature_id = None
                handle = suggest_unique_handle(
                    session, base_handle, user_id=payload.id
                )
                p = UserProfile(
                    id=payload.id,
                    username=payload.username,
                    handle=handle,
                    avatar_image_url=payload.avatar_image_url,
                    creature_id=creature_id,
                )
                session.add(p)
                # Flush pour matérialiser la ligne avant d'abonner aux
                # officiels (sinon Follow référence un profil qui n'existe
                # pas encore). Attention : un IntegrityError peut déjà se
                # déclencher ici — d'où le try/except englobant.
                session.flush()
            else:
                p.username = payload.username
                # On ne remplace l'avatar_image_url que s'il n'en avait pas
                # (pour ne pas écraser un rendu RPM déjà généré par
                # l'utilisateur).
                if not p.avatar_image_url:
                    p.avatar_image_url = payload.avatar_image_url
                # Rétro-compat : si l'user n'a pas encore de créature
                # (ancien compte) et que le front en fournit une, on
                # l'enregistre. Pas d'écrasement tant qu'il a déjà fait
                # son choix.
                if not p.creature_id and payload.creature_id:
                    if get_creature(payload.creature_id) is not None:
                        p.creature_id = payload.creature_id
                _touch(p)
            if is_new:
                _auto_follow_officials(session, p.id)
            session.commit()
        except IntegrityError:
            session.rollback()
            # Une autre requête a grillé le handle : on re-suggère
            # (l'appel suivant à suggest_unique_handle verra le handle
            # déjà commité et en prendra un autre). Au 3e échec on
            # propage un 409 plutôt qu'un 500.
            if attempt == 2:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Conflit de handle, réessaie dans un instant."
                    ),
                )
            continue
        session.refresh(p)
        return _to_out(p, session)
    # Ne devrait jamais arriver : la boucle retourne ou raise.
    raise HTTPException(status_code=500, detail="Upsert profil échoué.")


@router.patch("/{user_id}/handle", response_model=UserProfileOut)
def set_handle(
    user_id: str,
    payload: HandleUpdate,
    session: Session = Depends(_session_dep),
    auth_user: UserProfile = Depends(require_auth),
) -> UserProfileOut:
    """PR S — Change le `@handle` d'un utilisateur.

    Règles :
    - **Authentification requise** : seul le propriétaire du profil (ou un
      admin) peut changer le handle. Sans ce check, n'importe qui pourrait
      changer le handle d'autrui et déclencher le cooldown 30 j, ce qui
      serait une attaque de déni de service (signalé par Devin Review sur
      PR #64).
    - Format validé via `is_valid_handle` (3-20 chars `[a-z0-9_]+`, lower).
    - Cooldown 30 jours entre deux changements (anti-impersonation). Les
      anciens profils avec `handle_updated_at = None` peuvent poser leur
      premier handle custom sans cooldown.
    - Unicité contrôlée via `suggest_unique_handle(exclude_id=user_id)`.
      Si le handle demandé est déjà pris par quelqu'un d'autre, on
      rejette 409 plutôt que d'inventer un suffixe sans consentement.
    - Si l'utilisateur renvoie exactement son handle actuel, on renvoie
      le profil inchangé (idempotent, aucun effet cooldown).
    """
    # Autorisation : le user authentifié doit être soit le propriétaire,
    # soit un admin (pour dépannage / modération).
    if auth_user.id != user_id and auth_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu ne peux changer que ton propre handle.",
        )

    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")

    desired = payload.handle.strip().lstrip("@").lower()
    if not is_valid_handle(desired):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Handle invalide : 3-20 caractères, lettres (a-z), "
                "chiffres et underscores uniquement."
            ),
        )

    if desired == (p.handle or ""):
        return _to_out(p, session)

    # Cooldown : 30 j depuis le dernier changement explicite. On ne
    # l'applique pas tant que `handle_updated_at` est None (premier
    # changement après le backfill de démarrage).
    if p.handle_updated_at:
        try:
            last = datetime.fromisoformat(p.handle_updated_at)
        except ValueError:
            last = None
        if last is not None:
            # Force l'aware si la string sérialisée est naïve.
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            elapsed = _now() - last
            if elapsed < timedelta(days=30):
                remaining = timedelta(days=30) - elapsed
                days_left = max(1, remaining.days)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Tu pourras changer ton handle dans {days_left} jour"
                        f"{'s' if days_left > 1 else ''}."
                    ),
                )

    # Refuse si un autre profil possède déjà ce handle. On exclut p.id
    # pour qu'un user puisse "reprendre" son handle actuel sans erreur.
    existing = session.exec(
        select(UserProfile)
        .where(UserProfile.handle == desired)
        .where(UserProfile.id != user_id)
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce handle est déjà pris.",
        )

    p.handle = desired
    p.handle_updated_at = _now().isoformat()
    _touch(p)
    try:
        session.commit()
    except IntegrityError:
        # Devin Review (PR #64) : le SELECT ci-dessus + le commit ne sont pas
        # atomiques → deux requêtes concurrentes peuvent passer le check puis
        # violer l'index unique partiel au flush. On rollback et on renvoie
        # 409 plutôt qu'un 500 opaque.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce handle est déjà pris.",
        )
    session.refresh(p)
    return _to_out(p, session)


@router.patch("/{user_id}/creature", response_model=UserProfileOut)
def set_creature(
    user_id: str,
    payload: CreatureChoice,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    """Choix ou changement de créature.

    Rejette 400 si l'id ne correspond à aucune créature du catalogue figé.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if get_creature(payload.creature_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Créature inconnue.",
        )
    p.creature_id = payload.creature_id
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p, session)


@router.patch("/{user_id}/avatar", response_model=UserProfileOut)
def update_avatar(
    user_id: str,
    payload: AvatarUpdate,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if payload.avatar_url is not None:
        p.avatar_url = payload.avatar_url or None
    if payload.avatar_image_url is not None:
        p.avatar_image_url = payload.avatar_image_url
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p, session)


@router.patch("/{user_id}/inventory", response_model=UserProfileOut)
def update_inventory(
    user_id: str,
    payload: InventoryUpdate,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    if payload.inventory is not None:
        # On déduplique tout en gardant l'ordre d'insertion.
        seen: dict[str, None] = {}
        for item_id in payload.inventory:
            if item_id and item_id not in seen:
                seen[item_id] = None
        p.inventory_json = json.dumps(list(seen.keys()))
    if payload.equipped is not None:
        # Sécurise : ne peut équiper qu'un item présent dans l'inventaire.
        owned = set(json.loads(p.inventory_json or "[]"))
        cleaned = {
            slot: item_id
            for slot, item_id in payload.equipped.items()
            if item_id in owned
        }
        p.equipped_json = json.dumps(cleaned)
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p, session)


# --- Wishlist (PR G) -------------------------------------------------------


def _load_wishlist(p: UserProfile) -> list[str]:
    try:
        data = json.loads(p.wishlist_json or "[]")
    except (TypeError, ValueError):
        return []
    return [str(x) for x in data if isinstance(x, str) and x]


def _store_wishlist(p: UserProfile, items: list[str]) -> None:
    # Déduplique en préservant l'ordre d'insertion (les plus récents en fin).
    seen: dict[str, None] = {}
    for item_id in items:
        if item_id and item_id not in seen:
            seen[item_id] = None
    p.wishlist_json = json.dumps(list(seen.keys()))


@router.post("/{user_id}/wishlist/{item_id}", response_model=UserProfileOut)
def add_to_wishlist(
    user_id: str,
    item_id: str,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    """Ajoute `item_id` à la wishlist de `user_id` (idempotent)."""
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    current = _load_wishlist(p)
    if item_id not in current:
        current.append(item_id)
        _store_wishlist(p, current)
        _touch(p)
        session.commit()
        session.refresh(p)
    return _to_out(p, session)


@router.delete("/{user_id}/wishlist/{item_id}", response_model=UserProfileOut)
def remove_from_wishlist(
    user_id: str,
    item_id: str,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    """Retire `item_id` de la wishlist de `user_id` (idempotent)."""
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    current = _load_wishlist(p)
    if item_id in current:
        current = [x for x in current if x != item_id]
        _store_wishlist(p, current)
        _touch(p)
        session.commit()
        session.refresh(p)
    return _to_out(p, session)


def _apply_legacy_sylvins_delta(p: UserProfile, delta: int) -> None:
    """Route un delta sur le champ legacy `sylvins` vers les deux pots.

    - Crédit (`delta > 0`) → tombe dans le pot PROMO. (Un crédit "payé" doit
      passer explicitement par `sylvins_paid` — typiquement depuis le
      webhook Stripe — pour éviter qu'un client bugué gonfle le pot
      retirable.)
    - Débit (`delta < 0`) → consomme le pot PROMO d'abord, déborde sur PAID
      si nécessaire. Le pot PROMO est "spend-first" : on veut préserver le
      pot retirable tant que possible.
    """
    if delta >= 0:
        p.sylvins += delta
        return
    remaining = -delta
    # max(0, ...) : si un delta explicite (`sylvins_promo`) a déjà mis le
    # brouillon du pot promo en négatif, on ne laisse pas un `take_promo`
    # négatif "soigner" l'overdraft et siçhonner le pot PAID au passage.
    # Le check final (tous les pots >= 0) reste le garde-fou atomique.
    take_promo = min(remaining, max(0, p.sylvins))
    p.sylvins -= take_promo
    remaining -= take_promo
    if remaining > 0:
        p.sylvins_paid -= remaining


def _apply_legacy_earnings_delta(p: UserProfile, delta: int) -> None:
    """Comme `_apply_legacy_sylvins_delta` mais pour le pot recettes."""
    if delta >= 0:
        p.sylvins_earnings += delta
        return
    remaining = -delta
    # Idem `_apply_legacy_sylvins_delta` : max(0, ...) bloque le transfert
    # silencieux d'un overdraft promo vers le pot PAID.
    take_promo = min(remaining, max(0, p.sylvins_earnings))
    p.sylvins_earnings -= take_promo
    remaining -= take_promo
    if remaining > 0:
        p.earnings_paid -= remaining


@router.post("/{user_id}/wallet", response_model=UserProfileOut)
def apply_wallet_delta(
    user_id: str,
    payload: WalletDelta,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")

    # On travaille sur des brouillons pour pouvoir refuser atomiquement si
    # n'importe quel pot finit négatif. Après validation, on recopie sur
    # l'instance ORM.
    new_lueurs = p.lueurs + payload.lueurs
    draft = UserProfile(
        id=p.id,
        username=p.username,
        sylvins=p.sylvins,
        sylvins_earnings=p.sylvins_earnings,
        sylvins_paid=p.sylvins_paid,
        earnings_paid=p.earnings_paid,
    )
    # Appliquer d'abord les champs explicites (plus prévisibles), puis les
    # champs legacy (qui peuvent router vers plusieurs pots).
    draft.sylvins += payload.sylvins_promo
    draft.sylvins_earnings += payload.earnings_promo
    draft.sylvins_paid += payload.sylvins_paid
    draft.earnings_paid += payload.earnings_paid
    _apply_legacy_sylvins_delta(draft, payload.sylvins)
    _apply_legacy_earnings_delta(draft, payload.sylvins_earnings)

    if (
        new_lueurs < 0
        or draft.sylvins < 0
        or draft.sylvins_earnings < 0
        or draft.sylvins_paid < 0
        or draft.earnings_paid < 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde insuffisant.",
        )

    p.lueurs = new_lueurs
    p.sylvins = draft.sylvins
    p.sylvins_earnings = draft.sylvins_earnings
    p.sylvins_paid = draft.sylvins_paid
    p.earnings_paid = draft.earnings_paid
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p, session)


@router.post("/{sender_id}/gift-sylvins", response_model=GiftTransferOut)
def gift_sylvins(
    sender_id: str,
    payload: GiftTransfer,
    session: Session = Depends(_session_dep),
) -> GiftTransferOut:
    """Transfère atomiquement `amount` Sylvins du sender au receiver.

    - Consomme le pot PROMO du sender d'abord (évite de gaspiller le pot
      retirable), puis déborde sur PAID.
    - Crédite les recettes du receiver dans le pot miroir : la tranche
      débitée depuis PROMO alimente `earnings_promo`, la tranche PAID
      alimente `earnings_paid`. Impossible de "blanchir" du promo vers du
      cashable en se faisant gifter par un compte complice.
    - Rejette : sender=receiver, sender introuvable, receiver introuvable,
      amount ≤ 0 (validé côté schéma), solde total insuffisant.
    """
    if sender_id == payload.receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de s'envoyer un cadeau à soi-même.",
        )
    sender = session.get(UserProfile, sender_id)
    if not sender:
        raise HTTPException(status_code=404, detail="Sender introuvable.")
    receiver = session.get(UserProfile, payload.receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver introuvable.")

    amount = payload.amount
    if sender.sylvins + sender.sylvins_paid < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde Sylvins insuffisant.",
        )

    # Ordre de consommation : PROMO d'abord (préserve le pot retirable).
    # `max(0, …)` : même garde-fou défensif que `_apply_legacy_sylvins_delta`,
    # au cas où `sender.sylvins` serait négatif suite à une race condition ou
    # un chemin futur. Sans ce garde-fou, un pot PROMO à -5 siphonnerait 5
    # Sylvins supplémentaires depuis le pot PAID retirable et créditerait le
    # receiver en `earnings_paid` au lieu d'`earnings_promo` — exactement le
    # blanchiment que le split est censé empêcher.
    take_promo = min(amount, max(0, sender.sylvins))
    take_paid = amount - take_promo

    sender.sylvins -= take_promo
    sender.sylvins_paid -= take_paid
    receiver.sylvins_earnings += take_promo  # = earnings_promo (colonne legacy)
    receiver.earnings_paid += take_paid
    _touch(sender)
    _touch(receiver)
    # Journal append-only pour alimenter le classement hebdo + BFF dans
    # l'espace communauté. Écrit dans la même transaction que le transfert :
    # impossible de voir un streamer crédité en `earnings_paid` sans ligne
    # correspondante au ledger (et inversement).
    session.add(
        GiftLedger(
            sender_id=sender.id,
            receiver_id=receiver.id,
            amount=amount,
            amount_paid=take_paid,
            amount_promo=take_promo,
            week_start_iso=iso_week_start().isoformat(),
        )
    )
    # PR M — crédit d'XP au streamer qui reçoit le cadeau : chaque Sylvin
    # reçu vaut 1 XP. Le solde d'XP est monotone croissant (jamais débité
    # automatiquement ; un admin peut ajuster via `/admin/users/{id}/xp-adjust`
    # si besoin de modérer).
    receiver.streamer_xp = (receiver.streamer_xp or 0) + amount * XP_PER_SYLVIN_RECEIVED
    session.commit()
    session.refresh(sender)
    session.refresh(receiver)
    return GiftTransferOut(
        sender=_to_out(sender, session),
        receiver=_to_out(receiver, session),
        consumed_promo=take_promo,
        consumed_paid=take_paid,
    )


@router.post("/{sender_id}/gift-item", response_model=GiftItemOut)
def gift_item(
    sender_id: str,
    payload: GiftItem,
    session: Session = Depends(_session_dep),
) -> GiftItemOut:
    """Offre un item cosmétique depuis la wishlist d'un autre utilisateur.

    Règles :
    - sender ≠ receiver (pas de cadeau à soi-même).
    - L'item doit être dans la wishlist du receiver (anti-triche : on ne peut
      pas offrir un item arbitraire en contournant l'UI).
    - Le receiver ne doit pas déjà posséder l'item.
    - En Sylvins, consomme PROMO d'abord puis PAID (même logique que
      `gift-sylvins` — impossible de blanchir un solde promo en cashable en
      passant par un achat croisé).
    - Atomique : soit tout passe (débit + inventaire + retrait wishlist),
      soit rien (commit unique en fin).
    """
    if sender_id == payload.receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de s'offrir un cadeau à soi-même.",
        )
    sender = session.get(UserProfile, sender_id)
    if not sender:
        raise HTTPException(status_code=404, detail="Sender introuvable.")
    receiver = session.get(UserProfile, payload.receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver introuvable.")

    wishlist = _load_wishlist(receiver)
    if payload.item_id not in wishlist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet item n'est pas dans la liste de souhaits.",
        )

    inventory = json.loads(receiver.inventory_json or "[]")
    if payload.item_id in inventory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le destinataire possède déjà cet item.",
        )

    take_promo = 0
    take_paid = 0
    if payload.currency == "lueurs":
        if sender.lueurs < payload.price:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solde Lueurs insuffisant.",
            )
        sender.lueurs -= payload.price
    else:  # sylvins
        if sender.sylvins + sender.sylvins_paid < payload.price:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solde Sylvins insuffisant.",
            )
        take_promo = min(payload.price, max(0, sender.sylvins))
        take_paid = payload.price - take_promo
        sender.sylvins -= take_promo
        sender.sylvins_paid -= take_paid

    # Crédite l'inventaire du receiver + retire de sa wishlist.
    inventory.append(payload.item_id)
    receiver.inventory_json = json.dumps(inventory)
    _store_wishlist(receiver, [x for x in wishlist if x != payload.item_id])
    # PR M — XP accordé au receiver uniquement si le cadeau a été payé en
    # Sylvins (monnaie premium). Les achats en Lueurs (monnaie gratuite
    # via daily claim) ne donnent PAS d'XP, sinon deux comptes complices
    # pourraient se faire grimper en grade gratuitement en s'offrant des
    # items en boucle.
    if payload.currency == "sylvins":
        receiver.streamer_xp = (
            (receiver.streamer_xp or 0) + payload.price * XP_PER_SYLVIN_RECEIVED
        )

    _touch(sender)
    _touch(receiver)
    session.commit()
    session.refresh(sender)
    session.refresh(receiver)
    return GiftItemOut(
        sender=_to_out(sender, session),
        receiver=_to_out(receiver, session),
        consumed_promo=take_promo,
        consumed_paid=take_paid,
    )


@router.post("/{user_id}/daily-claim", response_model=DailyClaimOut)
def daily_claim(
    user_id: str, session: Session = Depends(_session_dep)
) -> DailyClaimOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    now = _now()
    if p.last_daily_at:
        try:
            last = datetime.fromisoformat(p.last_daily_at)
        except ValueError:
            last = None
        if last and now - last < DAILY_COOLDOWN:
            return DailyClaimOut(
                granted=0, already_claimed=True, profile=_to_out(p, session)
            )
    p.lueurs += DAILY_REWARD_LUEURS
    p.last_daily_at = now.isoformat()
    _touch(p)
    session.commit()
    session.refresh(p)
    return DailyClaimOut(
        granted=DAILY_REWARD_LUEURS, already_claimed=False, profile=_to_out(p, session)
    )


# --- Follow / Unfollow ----------------------------------------------------


def _follower_out(p: UserProfile) -> FollowerOut:
    return FollowerOut(
        id=p.id,
        username=p.username,
        handle=p.handle,
        avatarImageUrl=p.avatar_image_url,
        creature=_creature_out(p.creature_id),
        role=p.role or "user",
    )


@router.post("/{target_id}/follow", response_model=UserProfileOut)
def follow_user(
    target_id: str,
    payload: FollowAction,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    """Crée la relation follower_id → target_id.

    Idempotent : si la relation existe déjà, renvoie le profil cible tel
    quel sans ré-insérer. Rejette le self-follow (400) et les ids
    inexistants (404).
    """
    follower_id = payload.follower_id
    if follower_id == target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de s'abonner à soi-même.",
        )
    target = session.get(UserProfile, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Cible introuvable.")
    follower = session.get(UserProfile, follower_id)
    if not follower:
        raise HTTPException(status_code=404, detail="Follower introuvable.")

    existing = session.exec(
        select(Follow)
        .where(Follow.follower_id == follower_id)
        .where(Follow.following_id == target_id)
    ).first()
    if existing is None:
        session.add(
            Follow(follower_id=follower_id, following_id=target_id)
        )
        # PR M — chaque nouveau lien d'âme donne +50 XP à la cible. On ne
        # retire pas d'XP sur unfollow (pour éviter les guerres de trolls) —
        # l'XP est une mesure cumulative de l'activité, pas du solde réel.
        target.streamer_xp = (target.streamer_xp or 0) + XP_PER_SUBSCRIBER
        session.commit()
    return _to_out(target, session)


@router.delete("/{target_id}/follow", response_model=UserProfileOut)
def unfollow_user(
    target_id: str,
    follower_id: str,
    session: Session = Depends(_session_dep),
) -> UserProfileOut:
    """Supprime la relation follower_id → target_id si elle existe.

    N.B. : on ne retire pas l'XP précédemment accordée à la cible — l'XP est
    un compteur cumulatif d'activité (pas le nombre d'abonnés courant).
    """
    target = session.get(UserProfile, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Cible introuvable.")
    existing = session.exec(
        select(Follow)
        .where(Follow.follower_id == follower_id)
        .where(Follow.following_id == target_id)
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    return _to_out(target, session)


@router.get("/{user_id}/followers", response_model=List[FollowerOut])
def list_followers(
    user_id: str, session: Session = Depends(_session_dep)
) -> List[FollowerOut]:
    """Liste les users qui suivent `user_id`."""
    rows = session.exec(
        select(Follow).where(Follow.following_id == user_id)
    ).all()
    follower_ids = [r.follower_id for r in rows]
    if not follower_ids:
        return []
    users = session.exec(
        select(UserProfile).where(UserProfile.id.in_(follower_ids))
    ).all()
    return [_follower_out(u) for u in users]


@router.get("/{user_id}/following", response_model=List[FollowerOut])
def list_following(
    user_id: str, session: Session = Depends(_session_dep)
) -> List[FollowerOut]:
    """Liste les users suivis par `user_id`."""
    rows = session.exec(
        select(Follow).where(Follow.follower_id == user_id)
    ).all()
    target_ids = [r.following_id for r in rows]
    if not target_ids:
        return []
    users = session.exec(
        select(UserProfile).where(UserProfile.id.in_(target_ids))
    ).all()
    return [_follower_out(u) for u in users]


@router.get("/{user_id}/follow-status")
def follow_status(
    user_id: str,
    follower_id: str,
    session: Session = Depends(_session_dep),
) -> dict:
    """`{ following: bool }` — le follower suit-il `user_id` ?"""
    existing = session.exec(
        select(Follow)
        .where(Follow.follower_id == follower_id)
        .where(Follow.following_id == user_id)
    ).first()
    return {"following": existing is not None}


# --- Catalogue créatures --------------------------------------------------


creatures_router = APIRouter(prefix="/creatures", tags=["creatures"])


@creatures_router.get("", response_model=List[CreatureOut])
def list_creatures() -> List[CreatureOut]:
    """Catalogue figé des 9 créatures (affiché à l'inscription)."""
    return [CreatureOut(**c) for c in CREATURES]


# --- Admin grade/XP (PR M) ------------------------------------------------
#
# Ces endpoints sont protégés par `require_admin` (rôle == "admin"). Ils
# complètent le système de grades en permettant :
# - D'ajuster manuellement l'XP d'un membre (ex. compenser un bug, offrir
#   un bonus pour un événement, pénaliser un comportement abusif).
# - De forcer un grade sans passer par l'XP (utile pour les comptes
#   officiels / les events — ex. figer un compte modéré en "Légende").
#
# On n'a pas besoin du logger d'audit pour merger cette PR : PR J (admin
# panel) arrivera en parallèle et branchera ses propres logs. Ici on reste
# minimal et cohérent avec les autres endpoints de ce module.

from ..auth.dependencies import require_admin  # noqa: E402


admin_grades_router = APIRouter(prefix="/admin", tags=["admin-grades"])


@admin_grades_router.post(
    "/users/{user_id}/grade-override",
    response_model=UserProfileOut,
)
def admin_set_grade_override(
    user_id: str,
    payload: GradeOverridePayload,
    session: Session = Depends(_session_dep),
    _admin: UserProfile = Depends(require_admin),
) -> UserProfileOut:
    """Force un grade particulier pour un membre, ou lève l'override.

    - `grade_slug=None` → retire l'override ; le grade redevient dérivé
      de `streamer_xp`.
    - `grade_slug` doit pointer vers un slug existant (sinon 400).
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    previous_override = p.streamer_grade_override
    if payload.grade_slug is not None:
        if grade_by_slug(payload.grade_slug) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Slug de grade inconnu.",
            )
        p.streamer_grade_override = payload.grade_slug
    else:
        p.streamer_grade_override = None
    _touch(p)
    session.commit()
    session.refresh(p)

    # Si on vient d'accorder le sacre Légende (et qu'il n'était pas déjà posé),
    # on envoie un DM de félicitations de la part de Dreyna au membre sacré.
    # On ne renvoie PAS le message si l'admin re-sauvegarde le même override
    # (évite de spammer le membre si on tâtonne dans l'UI). On ne l'envoie pas
    # non plus si le membre sacré **est** Dreyna (impossible en pratique mais
    # défensif, `post_system_dm` lèverait sinon).
    just_awarded_legend = (
        payload.grade_slug == LEGEND_SLUG and previous_override != LEGEND_SLUG
    )
    if just_awarded_legend and p.id != DREYNA_USER_ID:
        try:
            post_system_dm(
                session,
                sender_id=DREYNA_USER_ID,
                recipient_id=p.id,
                content=DIRECT_MESSAGE_LEGEND_SACRE,
            )
        except Exception:  # noqa: BLE001 — DM best-effort, le sacre est déjà committé
            # On catche large volontairement : le sacre (grade_override) est
            # déjà committé ligne ~1115. Si le DM échoue pour n'importe
            # quelle raison (DB error transitoire, race sur la table
            # `direct_messages`, texte mal formé…), on ne veut pas renvoyer
            # un 500 à l'admin — il croirait que le sacre n'a pas marché et
            # retenterait, mais l'idempotency check (`previous_override !=
            # LEGEND_SLUG`) serait maintenant False donc le DM serait
            # perdu. Mieux vaut un sacre sans DM qu'un admin confus.
            #
            # Rollback impératif : si l'erreur est survenue *pendant*
            # `session.commit()` de `post_system_dm`, la session reste en
            # "pending rollback" — le `_to_out(...)` ci-dessous (qui ré-exec
            # des SELECT pour calculer followers/following) lèverait alors
            # `PendingRollbackError` et on renverrait quand même un 500.
            session.rollback()
            logger.exception(
                "DM de sacre Légende impossible (user %s) ; sacre maintenu",
                p.id,
            )
    return _to_out(p, session)


@admin_grades_router.post(
    "/users/{user_id}/xp-adjust",
    response_model=UserProfileOut,
)
def admin_adjust_xp(
    user_id: str,
    payload: XPAdjustPayload,
    session: Session = Depends(_session_dep),
    _admin: UserProfile = Depends(require_admin),
) -> UserProfileOut:
    """Ajoute ou retire de l'XP à un membre (delta signé).

    L'XP ne descend jamais sous 0. Pas de journal d'audit ici — PR J
    branchera son propre logger si besoin. La raison est transportée pour
    pouvoir l'afficher côté admin sans la persister tant que PR J n'a pas
    créé sa table d'audit.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    new_xp = max(0, (p.streamer_xp or 0) + int(payload.delta))
    p.streamer_xp = new_xp
    _touch(p)
    session.commit()
    session.refresh(p)
    return _to_out(p, session)
