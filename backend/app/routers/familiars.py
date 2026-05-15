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

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..familiars import (
    FAMILIARS,
    SWITCH_PRICE_SYLVINS,
    RENAME_PRICE_SYLVINS,
    compute_familiar_stats,
    evolution_for_level,
    get_familiar,
    progress_in_level,
)
from ..models import (
    FamiliarSwitchLedger,
    UserFamiliar,
    UserProfile,
    WalletLedger,
)


router = APIRouter(prefix="/familiers", tags=["familiers"])
user_router = APIRouter(prefix="/users", tags=["familiers"])


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
    return OwnedFamiliarOut(
        id=row.id or 0,
        familiarId=row.familiar_id,
        name=fam["name"],
        rarity=fam.get("rarity", "commun"),
        tier=fam.get("tier", "free"),
        icon=fam.get("icon", "❓"),
        color=fam.get("color", "#888"),
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
