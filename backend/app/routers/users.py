"""Endpoints REST pour les profils utilisateurs (avatar, inventaire, bourses)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..creatures import CREATURES, get_creature
from ..db import get_session
from ..grades import (
    grade_by_slug,
    grade_for_xp,
    next_grade,
    progress_in_current_grade,
)
from ..models import Follow, GiftLedger, UserProfile
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
    InventoryUpdate,
    StreamerGradeOut,
    UserProfileOut,
    UserProfileUpsert,
    WalletDelta,
    XPAdjustPayload,
)


# PR M — XP gagné par type d'activité. Réglage "doux" : recevoir 100 Sylvins
# donne 100 XP (≈ 1 palier suivant), s'abonner à 10 personnes donne 500 XP, un
# post de qualité 10 XP. Ajustable sans migration.
XP_PER_SYLVIN_RECEIVED = 1
XP_PER_SUBSCRIBER = 50
XP_PER_POST = 10


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
    p = session.get(UserProfile, payload.id)
    is_new = p is None
    if p is None:
        creature_id = payload.creature_id
        if creature_id is not None and get_creature(creature_id) is None:
            creature_id = None
        p = UserProfile(
            id=payload.id,
            username=payload.username,
            avatar_image_url=payload.avatar_image_url,
            creature_id=creature_id,
        )
        session.add(p)
    else:
        p.username = payload.username
        # On ne remplace l'avatar_image_url que s'il n'en avait pas (pour ne
        # pas écraser un rendu RPM déjà généré par l'utilisateur).
        if not p.avatar_image_url:
            p.avatar_image_url = payload.avatar_image_url
        # Rétro-compat : si l'user n'a pas encore de créature (ancien compte)
        # et que le front en fournit une, on l'enregistre. Pas d'écrasement
        # tant qu'il a déjà fait son choix.
        if not p.creature_id and payload.creature_id:
            if get_creature(payload.creature_id) is not None:
                p.creature_id = payload.creature_id
        _touch(p)
    if is_new:
        _auto_follow_officials(session, p.id)
    session.commit()
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
