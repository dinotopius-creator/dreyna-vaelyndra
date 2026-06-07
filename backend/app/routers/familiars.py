"""Endpoints du système de familiers (PR familiers#1).

Système séparé de la **créature** (identité d'inscription) et de l'**avatar 3D**
(apparence). Le familier est une troisième entité indépendante :
- chaque membre possède 0…N familiers dans sa "collection",
- au plus 1 actif à un instant T,
- l'XP n'est PAS partagé entre familiers d'un même user, MAIS au "switch"
  on TRANSFÈRE l'XP du sortant vers l'entrant (cf. règle produit
  "le nouveau familier récupère la progression").

Cette PR pose les fondations : catalogue, ownership, switch, achat,
ledger anti-perte. La progression XP, l'onboarding obligatoire et l'UI
viennent dans des PRs suivantes.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..familiars import (
    FAMILIARS,
    FAMILIAR_COSMETICS,
    DEFAULT_FAMILIAR_COSMETIC_IDS,
    SWITCH_PRICE_SYLVINS,
    RENAME_PRICE_SYLVINS,
    compute_familiar_stats,
    evolution_for_level,
    get_familiar,
    get_familiar_cosmetic,
    progress_in_level,
)
from ..familiars_xp import grant_gift_received_xp, grant_gift_sent_xp
from ..models import (
    FamiliarGiftLedger,
    FamiliarSwitchLedger,
    UserFamiliar,
    UserProfile,
    WalletLedger,
)


router = APIRouter(prefix="/familiers", tags=["familiers"])
user_router = APIRouter(prefix="/users", tags=["familiers"])

AFFECTION_HEART_REQUIREMENTS = [10, 15, 20, 30, 45, 60, 80, 105, 135, 170]
AFFECTION_HEART_REWARDS = [50, 75, 100, 150, 200, 275, 350, 450, 600, 800]
ENCLOSURE_CLEANING_COOLDOWN_SECONDS = 20 * 60


def _session_dep() -> Session:
    return next(_session_gen())


def _session_gen():
    session = get_session()
    try:
        yield session
    finally:
        session.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _affection_cumulative_thresholds() -> list[int]:
    total = 0
    thresholds: list[int] = []
    for required in AFFECTION_HEART_REQUIREMENTS:
        total += required
        thresholds.append(total)
    return thresholds


def _affection_hearts(feedings: int) -> int:
    total = max(0, int(feedings or 0))
    hearts = 0
    for threshold in _affection_cumulative_thresholds():
        if total >= threshold:
            hearts += 1
    return min(10, hearts)


def _load_rewarded_hearts(row: UserFamiliar) -> list[int]:
    try:
        raw = json.loads(row.affection_rewarded_hearts_json or "[]")
    except (TypeError, ValueError):
        raw = []
    out: list[int] = []
    for item in raw:
        try:
            heart = int(item)
        except (TypeError, ValueError):
            continue
        if 1 <= heart <= 10 and heart not in out:
            out.append(heart)
    return sorted(out)


def _store_rewarded_hearts(row: UserFamiliar, hearts: list[int]) -> None:
    clean = sorted({heart for heart in hearts if 1 <= int(heart) <= 10})
    row.affection_rewarded_hearts_json = json.dumps(clean)


def _affection_out(row: UserFamiliar) -> FamiliarAffectionOut:
    feedings = max(0, int(row.affection_feedings or 0))
    hearts = _affection_hearts(feedings)
    thresholds = _affection_cumulative_thresholds()
    previous_threshold = thresholds[hearts - 1] if hearts > 0 else 0
    next_threshold = thresholds[hearts] if hearts < 10 else thresholds[-1]
    meals_for_next = (
        AFFECTION_HEART_REQUIREMENTS[hearts] if hearts < 10 else 0
    )
    meals_into = min(max(0, feedings - previous_threshold), meals_for_next)
    meals_until = max(0, next_threshold - feedings) if hearts < 10 else 0
    return FamiliarAffectionOut(
        foodStock=max(0, int(row.food_stock or 0)),
        affectionFeedings=feedings,
        affectionHearts=hearts,
        affectionMealsIntoHeart=meals_into,
        affectionMealsForNextHeart=meals_for_next,
        affectionMealsUntilNextHeart=meals_until,
        affectionRewardedHearts=_load_rewarded_hearts(row),
        heartRequirements=list(AFFECTION_HEART_REQUIREMENTS),
        heartRewards=list(AFFECTION_HEART_REWARDS),
    )


def _roll_cleaning_food() -> int:
    roll = random.random()
    if roll < 0.60:
        return 1
    if roll < 0.85:
        return 2
    if roll < 0.95:
        return 3
    return 0


def _cleaning_cooldown_remaining(row: UserFamiliar) -> int:
    last = _parse_iso(row.enclosure_last_cleaned_at)
    if last is None:
        return 0
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    ready_at = last + timedelta(seconds=ENCLOSURE_CLEANING_COOLDOWN_SECONDS)
    remaining = ready_at - datetime.now(timezone.utc)
    return max(0, int(remaining.total_seconds()))


# --- DTOs ------------------------------------------------------------------


class FamiliarCatalogItemOut(BaseModel):
    """Item du catalogue figé exposé au client.

    Volontairement plat / cosmétique : les stats *exactes* d'un familier
    appartenu sont calculées dynamiquement à partir de son XP (cf.
    `OwnedFamiliarOut`). Ici on ne renvoie que les `base_stats` indicatives
    à afficher en boutique.
    """

    id: str
    name: str
    tier: str  # "free" | "premium"
    rarity: str
    icon: str
    color: str
    tagline: str
    description: str
    priceSylvins: int
    baseStats: dict


class FamiliarCosmeticOut(BaseModel):
    id: str
    slot: str
    name: str
    description: str
    rarity: str
    currency: str
    price: int
    icon: str = ""
    color: str = ""
    accent: str = ""
    compatibleFamiliars: Optional[List[str]] = None


class OwnedFamiliarOut(BaseModel):
    """Un familier possédé par un user, avec sa progression vivante."""

    id: int
    familiarId: str
    name: str
    rarity: str
    tier: str
    icon: str
    color: str
    nickname: Optional[str] = None
    isActive: bool
    xp: int
    level: int
    xpIntoLevel: int
    xpToNextLevel: int
    evolution: dict  # {id, name, min_level}
    stats: dict
    acquiredAt: str
    lastActiveAt: Optional[str] = None
    cosmeticInventory: List[str] = []
    cosmeticEquipped: dict = {}
    cosmetics: dict = {}
    foodStock: int = 0
    affectionFeedings: int = 0
    affectionHearts: int = 0
    affectionMealsIntoHeart: int = 0
    affectionMealsForNextHeart: int = 0
    affectionMealsUntilNextHeart: int = 0
    affectionRewardedHearts: List[int] = []
    enclosureLastCleanedAt: Optional[str] = None


class FamiliarAffectionOut(BaseModel):
    foodStock: int
    affectionFeedings: int
    affectionHearts: int
    affectionMealsIntoHeart: int
    affectionMealsForNextHeart: int
    affectionMealsUntilNextHeart: int
    affectionRewardedHearts: List[int]
    heartRequirements: List[int]
    heartRewards: List[int]


class FamiliarEnclosureActionOut(BaseModel):
    familiar: OwnedFamiliarOut
    affection: FamiliarAffectionOut
    foodFound: int = 0
    heartGained: Optional[int] = None
    lueursRewarded: int = 0
    profileLueurs: int = 0
    cooldownRemainingSeconds: int = 0
    message: str


class FamiliarCollectionOut(BaseModel):
    activeFamiliarId: Optional[str] = None
    activeUserFamiliarId: Optional[int] = None
    activeXp: int = 0
    activeLevel: int = 1
    owned: List[OwnedFamiliarOut]
    switchCount: int
    nextSwitchFree: bool
    switchPriceSylvins: int


class BuyFamiliarPayload(BaseModel):
    familiarId: str = Field(..., min_length=1, max_length=64)


class SwitchFamiliarPayload(BaseModel):
    familiarId: str = Field(..., min_length=1, max_length=64)


class NicknamePayload(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=40)


class OnboardingPayload(BaseModel):
    familiarId: str = Field(..., min_length=1, max_length=64)


class GiftFamiliarPayload(BaseModel):
    senderId: str = Field(..., min_length=1, max_length=128)
    amount: int = Field(..., gt=0, le=10000)


class BuyFamiliarCosmeticPayload(BaseModel):
    cosmeticId: str = Field(..., min_length=1, max_length=80)


class EquipFamiliarCosmeticPayload(BaseModel):
    slot: str = Field(..., min_length=1, max_length=32)
    cosmeticId: Optional[str] = Field(default=None, max_length=80)


# --- Helpers --------------------------------------------------------------


def _catalog_item_out(definition) -> FamiliarCatalogItemOut:
    return FamiliarCatalogItemOut(
        id=definition["id"],
        name=definition["name"],
        tier=definition["tier"],
        rarity=definition["rarity"],
        icon=definition["icon"],
        color=definition["color"],
        tagline=definition["tagline"],
        description=definition["description"],
        priceSylvins=definition["price_sylvins"],
        baseStats=dict(definition["base_stats"]),
    )


def _cosmetic_out(definition) -> FamiliarCosmeticOut:
    return FamiliarCosmeticOut(
        id=definition["id"],
        slot=definition["slot"],
        name=definition["name"],
        description=definition["description"],
        rarity=definition["rarity"],
        currency=definition["currency"],
        price=definition["price"],
        icon=definition.get("icon", ""),
        color=definition.get("color", ""),
        accent=definition.get("accent", ""),
        compatibleFamiliars=definition.get("compatible_familiars"),
    )


def _load_cosmetic_inventory(row: UserFamiliar) -> List[str]:
    try:
        raw = json.loads(row.cosmetic_inventory_json or "[]")
    except (TypeError, ValueError):
        raw = []
    ids = [str(item) for item in raw if isinstance(item, str)]
    merged: list[str] = []
    for cosmetic_id in [*DEFAULT_FAMILIAR_COSMETIC_IDS, *ids]:
        if cosmetic_id in merged:
            continue
        if get_familiar_cosmetic(cosmetic_id) is not None:
            merged.append(cosmetic_id)
    return merged


def _store_cosmetic_inventory(row: UserFamiliar, inventory: List[str]) -> None:
    clean = []
    for cosmetic_id in inventory:
        if cosmetic_id in clean:
            continue
        if get_familiar_cosmetic(cosmetic_id) is not None:
            clean.append(cosmetic_id)
    row.cosmetic_inventory_json = json.dumps(clean)


def _load_cosmetic_equipped(row: UserFamiliar) -> dict[str, str]:
    try:
        raw = json.loads(row.cosmetic_equipped_json or "{}")
    except (TypeError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        return {}
    inventory = set(_load_cosmetic_inventory(row))
    out: dict[str, str] = {}
    for slot, cosmetic_id in raw.items():
        if not isinstance(slot, str) or not isinstance(cosmetic_id, str):
            continue
        cosmetic = get_familiar_cosmetic(cosmetic_id)
        if cosmetic is None or cosmetic_id not in inventory:
            continue
        if cosmetic["slot"] != slot:
            continue
        out[slot] = cosmetic_id
    return out


def _store_cosmetic_equipped(row: UserFamiliar, equipped: dict[str, str]) -> None:
    clean: dict[str, str] = {}
    inventory = set(_load_cosmetic_inventory(row))
    for slot, cosmetic_id in equipped.items():
        cosmetic = get_familiar_cosmetic(cosmetic_id)
        if cosmetic is None or cosmetic_id not in inventory:
            continue
        if cosmetic["slot"] != slot:
            continue
        clean[slot] = cosmetic_id
    row.cosmetic_equipped_json = json.dumps(clean)


def _equipped_cosmetics(row: UserFamiliar) -> dict:
    out = {}
    for slot, cosmetic_id in _load_cosmetic_equipped(row).items():
        cosmetic = get_familiar_cosmetic(cosmetic_id)
        if cosmetic is not None:
            out[slot] = dict(_cosmetic_out(cosmetic))
    return out


def _owned_out(row: UserFamiliar) -> OwnedFamiliarOut:
    fam = get_familiar(row.familiar_id) or {
        "id": row.familiar_id,
        "name": row.familiar_id,
        "tier": "free",
        "rarity": "commun",
        "icon": "❓",
        "color": "#888",
    }
    level, xp_into, xp_to_next = progress_in_level(row.xp)
    inventory = _load_cosmetic_inventory(row)
    equipped = _load_cosmetic_equipped(row)
    cosmetics = _equipped_cosmetics(row)
    affection = _affection_out(row)
    display_color = fam.get("color", "#888")
    color_cosmetic = cosmetics.get("color")
    if color_cosmetic and color_cosmetic.get("color"):
        display_color = color_cosmetic["color"]
    return OwnedFamiliarOut(
        id=row.id or 0,
        familiarId=row.familiar_id,
        name=fam["name"],
        rarity=fam.get("rarity", "commun"),
        tier=fam.get("tier", "free"),
        icon=fam.get("icon", "❓"),
        color=display_color,
        nickname=row.nickname,
        isActive=row.is_active,
        xp=row.xp,
        level=level,
        xpIntoLevel=xp_into,
        xpToNextLevel=xp_to_next,
        evolution=evolution_for_level(level),
        stats=dict(compute_familiar_stats(row.familiar_id, row.xp)),
        acquiredAt=row.acquired_at,
        lastActiveAt=row.last_active_at,
        cosmeticInventory=inventory,
        cosmeticEquipped=equipped,
        cosmetics=cosmetics,
        foodStock=affection.foodStock,
        affectionFeedings=affection.affectionFeedings,
        affectionHearts=affection.affectionHearts,
        affectionMealsIntoHeart=affection.affectionMealsIntoHeart,
        affectionMealsForNextHeart=affection.affectionMealsForNextHeart,
        affectionMealsUntilNextHeart=affection.affectionMealsUntilNextHeart,
        affectionRewardedHearts=affection.affectionRewardedHearts,
        enclosureLastCleanedAt=row.enclosure_last_cleaned_at,
    )


def _list_owned(session: Session, user_id: str) -> List[UserFamiliar]:
    rows = session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .order_by(UserFamiliar.acquired_at.asc())
    ).all()
    return list(rows)


def _switch_count(session: Session, user_id: str) -> int:
    rows = session.exec(
        select(FamiliarSwitchLedger).where(
            FamiliarSwitchLedger.user_id == user_id,
        )
    ).all()
    return len(rows)


def _consume_sylvins(p: UserProfile, amount: int) -> tuple[int, int]:
    """Débite `amount` Sylvins, PROMO d'abord puis PAID.

    Retourne (`take_promo`, `take_paid`) effectivement débités. Lève
    `HTTPException(400)` si le solde total est insuffisant. Appel à
    faire AVANT de bâtir le `WalletLedger` (qui lit l'état après).
    """
    if amount <= 0:
        return (0, 0)
    total = p.sylvins + p.sylvins_paid
    if total < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solde Sylvins insuffisant.",
        )
    remaining = amount
    take_promo = min(remaining, max(0, p.sylvins))
    p.sylvins -= take_promo
    remaining -= take_promo
    take_paid = 0
    if remaining > 0:
        take_paid = remaining
        p.sylvins_paid -= remaining
    return (take_promo, take_paid)


def _record_purchase_ledger(
    session: Session,
    user_id: str,
    take_promo: int,
    take_paid: int,
    balance_promo_after: int,
    balance_paid_after: int,
    reason: str,
    reference_id: str,
) -> None:
    if take_promo:
        session.add(
            WalletLedger(
                user_id=user_id,
                pot="sylvins_promo",
                delta=-take_promo,
                balance_after=balance_promo_after,
                reason=reason,
                reference_id=reference_id,
            )
        )
    if take_paid:
        session.add(
            WalletLedger(
                user_id=user_id,
                pot="sylvins_paid",
                delta=-take_paid,
                balance_after=balance_paid_after,
                reason=reason,
                reference_id=reference_id,
            )
        )


def _active_row(session: Session, user_id: str) -> Optional[UserFamiliar]:
    return session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .where(UserFamiliar.is_active == True)  # noqa: E712
    ).first()


def _collection_out(session: Session, user_id: str) -> FamiliarCollectionOut:
    owned = _list_owned(session, user_id)
    active = next((r for r in owned if r.is_active), None)
    switch_count = _switch_count(session, user_id)
    return FamiliarCollectionOut(
        activeFamiliarId=active.familiar_id if active else None,
        activeUserFamiliarId=active.id if active else None,
        activeXp=active.xp if active else 0,
        activeLevel=progress_in_level(active.xp)[0] if active else 1,
        owned=[_owned_out(r) for r in owned],
        switchCount=switch_count,
        nextSwitchFree=switch_count == 0,
        switchPriceSylvins=SWITCH_PRICE_SYLVINS,
    )


# --- Endpoints ------------------------------------------------------------


@router.get("/catalog", response_model=List[FamiliarCatalogItemOut])
def get_catalog() -> List[FamiliarCatalogItemOut]:
    """Catalogue figé des familiers (gratuits + premium)."""
    return [_catalog_item_out(f) for f in FAMILIARS]


@router.get("/cosmetics/catalog", response_model=List[FamiliarCosmeticOut])
def get_cosmetics_catalog() -> List[FamiliarCosmeticOut]:
    """Catalogue serveur des cosmétiques de familiers."""
    return [_cosmetic_out(c) for c in FAMILIAR_COSMETICS]


@user_router.get(
    "/{user_id}/familiers", response_model=FamiliarCollectionOut
)
def list_user_familiars(
    user_id: str,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/enclosure/clean",
    response_model=FamiliarEnclosureActionOut,
)
def clean_familiar_enclosure(
    user_id: str,
    session: Session = Depends(_session_dep),
) -> FamiliarEnclosureActionOut:
    """Nettoie l'enclos du familier actif et donne de la nourriture.

    Le gain est scelle cote serveur pour eviter les recompenses purement
    client. Le cooldown limite le farm sans bloquer l'usage de l'enclos.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    active = _active_row(session, user_id)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu n'as pas encore de familier actif.",
        )

    remaining = _cleaning_cooldown_remaining(active)
    if remaining > 0:
        return FamiliarEnclosureActionOut(
            familiar=_owned_out(active),
            affection=_affection_out(active),
            cooldownRemainingSeconds=remaining,
            profileLueurs=p.lueurs,
            message="L'enclos est déjà propre. Revenez un peu plus tard.",
        )

    food_found = _roll_cleaning_food()
    active.food_stock = max(0, int(active.food_stock or 0)) + food_found
    active.enclosure_last_cleaned_at = _now_iso()
    session.add(active)
    p.updated_at = _now_iso()
    session.add(p)
    session.commit()
    session.refresh(active)
    session.refresh(p)
    message = (
        f"Vous avez gagné {food_found} nourriture{'s' if food_found > 1 else ''}."
        if food_found > 0
        else "Aucune nourriture trouvée cette fois."
    )
    return FamiliarEnclosureActionOut(
        familiar=_owned_out(active),
        affection=_affection_out(active),
        foodFound=food_found,
        cooldownRemainingSeconds=_cleaning_cooldown_remaining(active),
        profileLueurs=p.lueurs,
        message=message,
    )


@user_router.post(
    "/{user_id}/familiers/enclosure/feed",
    response_model=FamiliarEnclosureActionOut,
)
def feed_active_familiar(
    user_id: str,
    session: Session = Depends(_session_dep),
) -> FamiliarEnclosureActionOut:
    """Nourrit le familier actif et crédite les Lueurs au changement de coeur."""
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    active = _active_row(session, user_id)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu n'as pas encore de familier actif.",
        )
    if int(active.food_stock or 0) <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous n'avez plus de nourriture. Nettoyez l'enclos pour en trouver.",
        )

    before_hearts = _affection_hearts(active.affection_feedings)
    active.food_stock = max(0, int(active.food_stock or 0) - 1)
    active.affection_feedings = max(0, int(active.affection_feedings or 0)) + 1
    after_hearts = _affection_hearts(active.affection_feedings)
    rewarded = _load_rewarded_hearts(active)
    heart_gained: Optional[int] = None
    lueurs_rewarded = 0
    reference_id = (
        f"famaff-{active.id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        f"-{user_id[-6:]}"
    )

    if after_hearts > before_hearts and after_hearts not in rewarded:
        heart_gained = after_hearts
        lueurs_rewarded = AFFECTION_HEART_REWARDS[after_hearts - 1]
        p.lueurs += lueurs_rewarded
        rewarded.append(after_hearts)
        _store_rewarded_hearts(active, rewarded)
        session.add(
            WalletLedger(
                user_id=user_id,
                pot="lueurs",
                delta=lueurs_rewarded,
                balance_after=p.lueurs,
                reason=f"familier:affection-heart:{after_hearts}",
                reference_id=reference_id,
            )
        )

    session.add(active)
    p.updated_at = _now_iso()
    session.add(p)
    session.commit()
    session.refresh(active)
    session.refresh(p)

    affection = _affection_out(active)
    if heart_gained:
        message = f"Votre familier gagne un cœur ! +{lueurs_rewarded} lueurs."
    elif affection.affectionHearts >= 10:
        message = "Votre familier est déjà au maximum d'affection."
    else:
        message = (
            "Votre familier a été nourri. "
            f"Encore {affection.affectionMealsUntilNextHeart} repas avant le prochain cœur."
        )
    return FamiliarEnclosureActionOut(
        familiar=_owned_out(active),
        affection=affection,
        heartGained=heart_gained,
        lueursRewarded=lueurs_rewarded,
        profileLueurs=p.lueurs,
        message=message,
    )


@user_router.post(
    "/{user_id}/familiers/cosmetics/buy",
    response_model=FamiliarCollectionOut,
)
def buy_familiar_cosmetic(
    user_id: str,
    payload: BuyFamiliarCosmeticPayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Achete un cosmetique pour le familier actif avec prix serveur."""
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    active = _active_row(session, user_id)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu n'as pas encore de familier actif.",
        )
    cosmetic = get_familiar_cosmetic(payload.cosmeticId)
    if cosmetic is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cosmétique de familier inconnu.",
        )
    compatible = cosmetic.get("compatible_familiars")
    if compatible and active.familiar_id not in compatible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce cosmétique n'est pas compatible avec ce familier.",
        )

    inventory = _load_cosmetic_inventory(active)
    if cosmetic["id"] in inventory:
        return _collection_out(session, user_id)

    reference_id = f"famcos-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    price = int(cosmetic.get("price", 0) or 0)
    currency = cosmetic["currency"]
    if currency == "lueurs" and price > 0:
        if p.lueurs < price:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solde Lueurs insuffisant.",
            )
        p.lueurs -= price
        session.add(
            WalletLedger(
                user_id=user_id,
                pot="lueurs",
                delta=-price,
                balance_after=p.lueurs,
                reason=f"familier:cosmetic:{cosmetic['id']}",
                reference_id=reference_id,
            )
        )
    elif currency == "sylvins" and price > 0:
        take_promo, take_paid = _consume_sylvins(p, price)
        _record_purchase_ledger(
            session,
            user_id,
            take_promo,
            take_paid,
            p.sylvins,
            p.sylvins_paid,
            reason=f"familier:cosmetic:{cosmetic['id']}",
            reference_id=reference_id,
        )

    inventory.append(cosmetic["id"])
    _store_cosmetic_inventory(active, inventory)
    session.add(active)
    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/cosmetics/equip",
    response_model=FamiliarCollectionOut,
)
def equip_familiar_cosmetic(
    user_id: str,
    payload: EquipFamiliarCosmeticPayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Equipe ou retire un cosmetique du familier actif."""
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    active = _active_row(session, user_id)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu n'as pas encore de familier actif.",
        )
    slot = payload.slot.strip()
    equipped = _load_cosmetic_equipped(active)
    if payload.cosmeticId is None:
        equipped.pop(slot, None)
        _store_cosmetic_equipped(active, equipped)
        session.add(active)
        p.updated_at = _now_iso()
        session.commit()
        return _collection_out(session, user_id)

    cosmetic = get_familiar_cosmetic(payload.cosmeticId)
    if cosmetic is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cosmétique de familier inconnu.",
        )
    if cosmetic["slot"] != slot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce cosmétique ne correspond pas à cette catégorie.",
        )
    inventory = _load_cosmetic_inventory(active)
    if cosmetic["id"] not in inventory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Achète ou débloque ce cosmétique avant de l'équiper.",
        )
    compatible = cosmetic.get("compatible_familiars")
    if compatible and active.familiar_id not in compatible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce cosmétique n'est pas compatible avec ce familier.",
        )
    equipped[slot] = cosmetic["id"]
    _store_cosmetic_equipped(active, equipped)
    session.add(active)
    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


def _grant_familiar(
    session: Session,
    user_id: str,
    familiar_id: str,
    *,
    activate: bool,
    inherit_xp_from: Optional[UserFamiliar] = None,
) -> UserFamiliar:
    """Ajoute un familier à la collection d'un user. NE COMMIT PAS.

    Si `inherit_xp_from` est passé, le familier nouvellement créé hérite
    de son XP (logique de switch — la progression est portée par le
    user, pas par le familier).
    """
    if get_familiar(familiar_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Familier inconnu.",
        )
    # Anti-duplication : si l'utilisateur a déjà cette ligne, on la réactive
    # éventuellement plutôt que d'insérer (et lever sur l'index unique).
    existing = session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .where(UserFamiliar.familiar_id == familiar_id)
    ).first()
    if existing is not None:
        if activate and not existing.is_active:
            existing.is_active = True
            existing.last_active_at = _now_iso()
            session.add(existing)
        return existing

    row = UserFamiliar(
        user_id=user_id,
        familiar_id=familiar_id,
        xp=inherit_xp_from.xp if inherit_xp_from else 0,
        is_active=activate,
        acquired_at=_now_iso(),
        last_active_at=_now_iso() if activate else None,
    )
    session.add(row)
    session.flush()  # pour récupérer l'id si on en a besoin plus tard
    return row


@user_router.post(
    "/{user_id}/familiers/onboarding",
    response_model=FamiliarCollectionOut,
)
def onboard_familiar(
    user_id: str,
    payload: OnboardingPayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Choix initial gratuit du familier (1re sélection après mise à jour).

    Refusé si l'utilisateur possède déjà un familier (il doit passer par
    `buy` ou `switch` pour en obtenir un autre). Premier `to_familiar`
    GRATUIT pour les 4 familiers `tier=free` ; pour un premium en
    onboarding, on facture normalement le prix Sylvins.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    target = get_familiar(payload.familiarId)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Familier inconnu.",
        )

    owned = _list_owned(session, user_id)
    if owned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tu as déjà choisi un familier.",
        )

    reference_id = f"famonb-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    cost = target["price_sylvins"] if target["tier"] == "premium" else 0
    take_promo = take_paid = 0
    if cost > 0:
        take_promo, take_paid = _consume_sylvins(p, cost)

    _grant_familiar(session, user_id, target["id"], activate=True)

    session.add(
        FamiliarSwitchLedger(
            user_id=user_id,
            from_familiar_id=None,
            to_familiar_id=target["id"],
            sylvins_cost=cost,
            reason="onboarding",
            reference_id=reference_id,
        )
    )
    if cost > 0:
        _record_purchase_ledger(
            session,
            user_id,
            take_promo,
            take_paid,
            p.sylvins,
            p.sylvins_paid,
            reason=f"familier:onboarding:{target['id']}",
            reference_id=reference_id,
        )
    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/buy", response_model=FamiliarCollectionOut
)
def buy_familiar(
    user_id: str,
    payload: BuyFamiliarPayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Achat d'un familier premium avec des Sylvins.

    Atomique :
      1. Vérifie le solde Sylvins (promo + paid)
      2. Refuse si déjà possédé
      3. Débite Sylvins (PROMO d'abord, PAID en débordement)
      4. Ajoute le familier à la collection (inactif par défaut)
      5. Écrit `WalletLedger` (-cost, `familier:buy:{id}`)

    Le familier acheté n'est PAS automatiquement activé — l'utilisateur
    doit explicitement appeler `/switch` pour changer son actif (qui peut
    être gratuit ou payant selon son historique de switchs).
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    target = get_familiar(payload.familiarId)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Familier inconnu.",
        )
    if target["tier"] != "premium":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce familier est gratuit, pas besoin de l'acheter.",
        )
    cost = target["price_sylvins"]
    if cost <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prix invalide.",
        )

    existing = session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .where(UserFamiliar.familiar_id == target["id"])
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu possèdes déjà ce familier.",
        )

    reference_id = f"fambuy-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    take_promo, take_paid = _consume_sylvins(p, cost)

    _grant_familiar(session, user_id, target["id"], activate=False)
    _record_purchase_ledger(
        session,
        user_id,
        take_promo,
        take_paid,
        p.sylvins,
        p.sylvins_paid,
        reason=f"familier:buy:{target['id']}",
        reference_id=reference_id,
    )
    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/switch", response_model=FamiliarCollectionOut
)
def switch_familiar(
    user_id: str,
    payload: SwitchFamiliarPayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Change le familier actif.

    Règles :
    - Le nouveau familier doit déjà être possédé (sinon erreur — passer
      par `/buy` ou `/onboarding` d'abord, ou utiliser un familier
      gratuit qui sera auto-octroyé pour ne pas bloquer).
    - Le premier switch (compteur = 0) est GRATUIT pour tout le monde.
    - Tout switch suivant coûte `SWITCH_PRICE_SYLVINS` (default 300).
    - L'XP est TRANSFÉRÉ de l'actif sortant vers l'actif entrant
      (`new.xp = max(new.xp, old.xp)` — on garde le meilleur pour ne
      jamais perdre de progression).
    - Atomique : verrouille, transfère XP, désactive l'ancien, active
      le nouveau, débite Sylvins, écrit `FamiliarSwitchLedger` +
      éventuel `WalletLedger`.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    target = get_familiar(payload.familiarId)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Familier inconnu.",
        )

    current = _active_row(session, user_id)
    if current is not None and current.familiar_id == target["id"]:
        # No-op : déjà actif. Pas d'erreur, on renvoie juste l'état courant.
        return _collection_out(session, user_id)

    # Octroi auto si on demande un gratuit pas encore possédé (UX : depuis
    # la page Mon Familier on doit pouvoir switcher direct sans passer
    # par une étape "acquisition" pour un gratuit).
    new_row = session.exec(
        select(UserFamiliar)
        .where(UserFamiliar.user_id == user_id)
        .where(UserFamiliar.familiar_id == target["id"])
    ).first()
    if new_row is None:
        if target["tier"] != "free":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Achète d'abord ce familier dans la boutique.",
            )
        new_row = _grant_familiar(
            session, user_id, target["id"], activate=False
        )

    switch_count = _switch_count(session, user_id)
    is_free = switch_count == 0
    cost = 0 if is_free else SWITCH_PRICE_SYLVINS

    reference_id = f"famswi-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    take_promo = take_paid = 0
    if cost > 0:
        take_promo, take_paid = _consume_sylvins(p, cost)

    # Transfert XP : on garde l'XP MAX entre l'ancien actif et le nouveau,
    # de sorte qu'aucun switch ne fasse perdre de progression. (Un user
    # qui revient sur un vieux familier ne perd pas l'XP gagné entre-temps
    # sur un autre.)
    if current is not None and current.xp > new_row.xp:
        new_row.xp = current.xp

    # Désactivation FLUSHÉE avant l'activation du nouvel actif, sinon
    # l'index partiel (userfamiliar_active_per_user) voit deux lignes
    # actives pour le même user au moment où SQLite vérifie la contrainte
    # et lève "UNIQUE constraint failed: userfamiliar.user_id".
    if current is not None:
        current.is_active = False
        session.add(current)
        session.flush()
    new_row.is_active = True
    new_row.last_active_at = _now_iso()
    session.add(new_row)

    session.add(
        FamiliarSwitchLedger(
            user_id=user_id,
            from_familiar_id=current.familiar_id if current else None,
            to_familiar_id=target["id"],
            sylvins_cost=cost,
            reason="switch" if not is_free else "switch:free",
            reference_id=reference_id,
        )
    )
    if cost > 0:
        _record_purchase_ledger(
            session,
            user_id,
            take_promo,
            take_paid,
            p.sylvins,
            p.sylvins_paid,
            reason=f"familier:switch:{target['id']}",
            reference_id=reference_id,
        )
    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/nickname", response_model=FamiliarCollectionOut
)
def rename_active_familiar(
    user_id: str,
    payload: NicknamePayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Rename (surnom) du familier actif. `None` ou `""` retire le surnom.

    Première attribution de surnom GRATUITE. Tout changement ultérieur vers
    un nouveau surnom non vide coûte `RENAME_PRICE_SYLVINS` Sylvins.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    current = _active_row(session, user_id)
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu n'as pas encore de familier actif.",
        )
    raw = (payload.nickname or "").strip()

    # No-op if nothing changed
    if (current.nickname or "") == raw:
        return _collection_out(session, user_id)

    # Determine cost: first time setting a nickname (from None -> non-empty) is free.
    cost = 0
    if raw and current.nickname:
        # Changing an existing non-empty nickname -> charge rename price
        cost = RENAME_PRICE_SYLVINS

    reference_id = f"famrename-{current.id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    take_promo = take_paid = 0
    if cost > 0:
        take_promo, take_paid = _consume_sylvins(p, cost)

    # Apply nickname change
    current.nickname = raw or None
    session.add(current)

    # Record ledger if paid
    if cost > 0:
        _record_purchase_ledger(
            session,
            user_id,
            take_promo,
            take_paid,
            p.sylvins,
            p.sylvins_paid,
            reason=f"familier:rename:{current.id}",
            reference_id=reference_id,
        )

    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


@user_router.post(
    "/{user_id}/familiers/{familiar_user_id}/nickname",
    response_model=FamiliarCollectionOut,
)
def rename_specific_familiar(
    user_id: str,
    familiar_user_id: int,
    payload: NicknamePayload,
    session: Session = Depends(_session_dep),
) -> FamiliarCollectionOut:
    """Rename surnom pour un familier précis (par son `UserFamiliar.id`).

    Même règle : première attribution gratuite, changements ultérieurs
    vers un surnom non vide coûtent `RENAME_PRICE_SYLVINS` Sylvins.
    """
    p = session.get(UserProfile, user_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profil introuvable.")
    row = session.get(UserFamiliar, familiar_user_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Familier utilisateur introuvable.")

    raw = (payload.nickname or "").strip()

    # No-op if nothing changed
    if (row.nickname or "") == raw:
        return _collection_out(session, user_id)

    cost = 0
    if raw and row.nickname:
        cost = RENAME_PRICE_SYLVINS

    reference_id = f"famrename-{row.id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{user_id[-6:]}"
    take_promo = take_paid = 0
    if cost > 0:
        take_promo, take_paid = _consume_sylvins(p, cost)

    row.nickname = raw or None
    session.add(row)

    if cost > 0:
        _record_purchase_ledger(
            session,
            user_id,
            take_promo,
            take_paid,
            p.sylvins,
            p.sylvins_paid,
            reason=f"familier:rename:{row.id}",
            reference_id=reference_id,
        )

    p.updated_at = _now_iso()
    session.commit()
    return _collection_out(session, user_id)


class GiftFamiliarOut(BaseModel):
    xpGranted: int
    newLevel: int
    newXp: int
    familiarName: str
    familiarIcon: str


@user_router.post(
    "/{user_id}/familiers/gift", response_model=GiftFamiliarOut
)
def gift_familiar(
    user_id: str,
    payload: GiftFamiliarPayload,
    session: Session = Depends(_session_dep),
) -> GiftFamiliarOut:
    """Offrir des Sylvins au familier actif d'un autre utilisateur.

    Le sender paie `amount` Sylvins (PROMO puis PAID). Le familier actif
    du receiver gagne `amount` XP (ratio 1:1, capé 1000 XP/jour). Le
    sender gagne aussi de l'XP sur son propre familier (amount // 3,
    capé 200 XP/jour).
    """
    if payload.senderId == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu ne peux pas offrir à ton propre familier.",
        )
    sender_profile = session.get(UserProfile, payload.senderId)
    if not sender_profile:
        raise HTTPException(status_code=404, detail="Profil envoyeur introuvable.")
    receiver_profile = session.get(UserProfile, user_id)
    if not receiver_profile:
        raise HTTPException(status_code=404, detail="Profil destinataire introuvable.")

    active = _active_row(session, user_id)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce membre n'a pas de familier actif.",
        )

    reference_id = f"famgift-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{payload.senderId[-6:]}"

    take_promo, take_paid = _consume_sylvins(sender_profile, payload.amount)
    _record_purchase_ledger(
        session,
        payload.senderId,
        take_promo,
        take_paid,
        sender_profile.sylvins,
        sender_profile.sylvins_paid,
        reason=f"familier:gift:{user_id}",
        reference_id=reference_id,
    )

    xp_granted = grant_gift_received_xp(
        session, user_id, payload.amount, reference_id
    )
    grant_gift_sent_xp(
        session, payload.senderId, payload.amount, reference_id
    )

    # Trace sociale pour notifier le destinataire ("X a offert N Sylvins à
    # ton familier") et lui proposer d'offrir en retour.
    session.add(
        FamiliarGiftLedger(
            sender_id=payload.senderId,
            sender_name=sender_profile.username or payload.senderId,
            receiver_id=user_id,
            receiver_familiar_id=active.id or 0,
            amount=payload.amount,
            xp_granted=xp_granted,
            reference_id=reference_id,
        )
    )

    sender_profile.updated_at = _now_iso()
    receiver_profile.updated_at = _now_iso()
    session.commit()
    session.refresh(active)

    fam = get_familiar(active.familiar_id)
    level, _, _ = progress_in_level(active.xp)
    return GiftFamiliarOut(
        xpGranted=xp_granted,
        newLevel=level,
        newXp=active.xp,
        familiarName=fam["name"] if fam else active.familiar_id,
        familiarIcon=fam.get("icon", "❓") if fam else "❓",
    )


class ReceivedFamiliarGiftOut(BaseModel):
    """Une offrande reçue par le familier d'un membre.

    Alimente le centre de notifications du destinataire (qui a offert,
    combien, quand) et le bouton "Offrir en retour" qui pointe vers le
    profil de l'envoyeur (`senderId`).
    """

    id: int
    senderId: str
    senderName: str
    senderAvatar: str
    amount: int
    xpGranted: int
    createdAt: str


@user_router.get(
    "/{user_id}/familiers/gifts/received",
    response_model=List[ReceivedFamiliarGiftOut],
)
def list_received_familiar_gifts(
    user_id: str,
    limit: int = 50,
    session: Session = Depends(_session_dep),
) -> List[ReceivedFamiliarGiftOut]:
    """Liste les offrandes Sylvins reçues par le familier du membre.

    Trié du plus récent au plus ancien. Le client poll cet endpoint pour
    générer les notifications "X a offert N Sylvins à ton familier".
    """
    capped = max(1, min(limit, 100))
    rows = session.exec(
        select(FamiliarGiftLedger)
        .where(FamiliarGiftLedger.receiver_id == user_id)
        .order_by(FamiliarGiftLedger.created_at.desc())
        .limit(capped)
    ).all()

    sender_ids = {row.sender_id for row in rows}
    profiles: dict[str, UserProfile] = {}
    if sender_ids:
        for prof in session.exec(
            select(UserProfile).where(UserProfile.id.in_(sender_ids))
        ).all():
            profiles[prof.id] = prof

    out: List[ReceivedFamiliarGiftOut] = []
    for row in rows:
        prof = profiles.get(row.sender_id)
        name = (prof.username if prof else "") or row.sender_name or row.sender_id
        avatar = (prof.avatar_image_url if prof else "") or ""
        out.append(
            ReceivedFamiliarGiftOut(
                id=row.id or 0,
                senderId=row.sender_id,
                senderName=name,
                senderAvatar=avatar,
                amount=row.amount,
                xpGranted=row.xp_granted,
                createdAt=row.created_at,
            )
        )
    return out
