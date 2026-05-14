"""Catalogue des familiers de Vaelyndra (système séparé des créatures + avatar).

Chaque membre possède :
- une **créature** (identité, choisie à l'inscription, badge cosmétique fixe),
- un **avatar 3D** (apparence dans header / posts / lives),
- un **familier actif** (créature compagnon, vie sa propre vie, gagne de l'XP
  pour son owner et réagit en live). C'est ce dernier que ce module décrit.

Le catalogue est figé côté code (pas de table SQL) pour les raisons habituelles :
- moins de migration / déploiement quand on ajoute un familier,
- moins de surface d'attaque (l'admin ne peut pas y casser les contraintes
  d'équilibre par erreur depuis l'UI catalogue produits classique),
- on garde une seule source de vérité (le seed initial + ce fichier).

Toute modification d'équilibrage (prix, stats, palier d'évolution) se fait
ici, dans le code, et est versionnée comme du code normal.

Catalogue :
- 4 familiers GRATUITS (un de chaque ambiance, parité visuelle assurée)
- 5 familiers PREMIUM (achat en Sylvins, prix 800 → 3000)

Stats : intentionnellement légères pour ne PAS être pay-to-win.
- `aura` (cosmétique pur, halos de réactions sociales)
- `energy` (énergie live : amplitude des animations pendant le stream)
- `harvest` (bonus discret sur le daily-claim Lueurs, capé à +20 %)
- `affinity` (cosmétique premium : effets de particules supplémentaires)
- `charisma` (intensité visuelle des réactions sociales)

Ces stats sont _principalement_ cosmétiques : seul `harvest` impacte une
mécanique concrète (le daily-claim) et reste plafonné. Tout le reste est de
l'effet visuel pour éviter le pay-to-win.
"""
from __future__ import annotations

from typing import Dict, List, Literal, TypedDict


FamiliarRarity = Literal["commun", "rare", "epique", "legendaire", "mythique"]
FamiliarTier = Literal["free", "premium"]


class FamiliarStats(TypedDict):
    """Stats de base du familier au niveau 1.

    Toutes les stats évoluent linéairement avec le niveau (cf.
    `compute_familiar_stats`). Valeurs entre 0 et 100 pour rester
    interprétables.
    """

    aura: int
    energy: int
    harvest: int
    affinity: int
    charisma: int


class FamiliarDef(TypedDict):
    """Définition d'un familier dans le catalogue figé."""

    id: str
    name: str
    tier: FamiliarTier
    rarity: FamiliarRarity
    # Emoji-fallback affiché partout où l'animation ne s'est pas chargée.
    icon: str
    # Couleur d'accent (cadre, halo, glow) — hex.
    color: str
    description: str
    tagline: str
    # Coût en Sylvins pour l'achat. 0 pour les gratuits.
    price_sylvins: int
    # Stats de base au niveau 1 (cf. `compute_familiar_stats`).
    base_stats: FamiliarStats


FAMILIARS: List[FamiliarDef] = [
    # --- GRATUITS ---------------------------------------------------------
    {
        "id": "renard-stellaire",
        "name": "Renard Stellaire",
        "tier": "free",
        "rarity": "commun",
        "icon": "🦊",
        "color": "#fb923c",
        "tagline": "Filou des nuits étoilées",
        "description": "Un petit renard rusé né d'une éclipse, qui suit les membres curieux des recoins du royaume.",
        "price_sylvins": 0,
        "base_stats": {
            "aura": 22,
            "energy": 24,
            "harvest": 20,
            "affinity": 18,
            "charisma": 24,
        },
    },
    {
        "id": "hibou-des-lueurs",
        "name": "Hibou des Lueurs",
        "tier": "free",
        "rarity": "commun",
        "icon": "🦉",
        "color": "#a78bfa",
        "tagline": "Veilleur silencieux",
        "description": "Hibou crépusculaire au plumage parsemé de Lueurs. Il guide les insomniaques de Vaelyndra.",
        "price_sylvins": 0,
        "base_stats": {
            "aura": 24,
            "energy": 20,
            "harvest": 24,
            "affinity": 18,
            "charisma": 22,
        },
    },
    {
        "id": "loup-de-brume",
        "name": "Loup de Brume",
        "tier": "free",
        "rarity": "commun",
        "icon": "🐺",
        "color": "#94a3b8",
        "tagline": "Compagnon des landes",
        "description": "Un loup gris semi-spectral, fidèle, qui veille à la lisière des forêts du Nord.",
        "price_sylvins": 0,
        "base_stats": {
            "aura": 22,
            "energy": 26,
            "harvest": 18,
            "affinity": 20,
            "charisma": 24,
        },
    },
    {
        "id": "chat-astral",
        "name": "Chat Astral",
        "tier": "free",
        "rarity": "commun",
        "icon": "🐱",
        "color": "#22d3ee",
        "tagline": "Tisseur de rêves",
        "description": "Petit chat couleur azur qui ronronne dans les rêves des membres. Voit l'invisible.",
        "price_sylvins": 0,
        "base_stats": {
            "aura": 26,
            "energy": 22,
            "harvest": 20,
            "affinity": 20,
            "charisma": 22,
        },
    },
    # --- PREMIUM ----------------------------------------------------------
    {
        "id": "dragon-astral",
        "name": "Dragon Astral",
        "tier": "premium",
        "rarity": "legendaire",
        "icon": "🐉",
        "color": "#f59e0b",
        "tagline": "Souffle des constellations",
        "description": "Dragon céleste forgé dans l'or et la nuit. Sa présence illumine le live d'écailles dorées et de comètes.",
        "price_sylvins": 2500,
        "base_stats": {
            "aura": 38,
            "energy": 42,
            "harvest": 30,
            "affinity": 44,
            "charisma": 46,
        },
    },
    {
        "id": "phoenix-sylvain",
        "name": "Phénix Sylvain",
        "tier": "premium",
        "rarity": "epique",
        "icon": "🔥",
        "color": "#ef4444",
        "tagline": "Renaît des cendres roses",
        "description": "Phénix sylvain aux plumes flamboyantes. À chaque évolution, il renaît dans une pluie de pétales ardents.",
        "price_sylvins": 1800,
        "base_stats": {
            "aura": 36,
            "energy": 38,
            "harvest": 28,
            "affinity": 38,
            "charisma": 42,
        },
    },
    {
        "id": "serpent-cosmique",
        "name": "Serpent Cosmique",
        "tier": "premium",
        "rarity": "epique",
        "icon": "🐍",
        "color": "#8b5cf6",
        "tagline": "Anneau d'étoiles",
        "description": "Serpent enroulé autour des constellations. Ses écailles reflètent les nébuleuses lointaines.",
        "price_sylvins": 1500,
        "base_stats": {
            "aura": 40,
            "energy": 32,
            "harvest": 30,
            "affinity": 36,
            "charisma": 38,
        },
    },
    {
        "id": "kitsune-royal",
        "name": "Kitsuné Royal",
        "tier": "premium",
        "rarity": "legendaire",
        "icon": "🌸",
        "color": "#f472b6",
        "tagline": "Neuf queues, neuf miracles",
        "description": "Kitsuné aux neuf queues d'or rose. Chaque évolution ouvre une nouvelle queue et libère un sortilège visuel inédit.",
        "price_sylvins": 2200,
        "base_stats": {
            "aura": 42,
            "energy": 36,
            "harvest": 28,
            "affinity": 44,
            "charisma": 48,
        },
    },
    {
        "id": "tigre-lunaire",
        "name": "Tigre Lunaire",
        "tier": "premium",
        "rarity": "mythique",
        "icon": "🐯",
        "color": "#fde68a",
        "tagline": "Rugissement de pleine lune",
        "description": "Tigre majestueux au pelage clair de lune. Sa présence en live est aperçue comme un présage royal.",
        "price_sylvins": 3000,
        "base_stats": {
            "aura": 44,
            "energy": 46,
            "harvest": 32,
            "affinity": 46,
            "charisma": 50,
        },
    },
]


FAMILIARS_BY_ID: Dict[str, FamiliarDef] = {f["id"]: f for f in FAMILIARS}


# Paliers d'évolution (apparence + animations + effets). Le familier garde son
# id, son nom et sa rareté ; seuls les visuels changent selon le palier.
EVOLUTION_TIERS = [
    {"id": "bebe", "name": "Bébé", "min_level": 1},
    {"id": "eveille", "name": "Éveillé", "min_level": 10},
    {"id": "mythique", "name": "Mythique", "min_level": 25},
    {"id": "celeste", "name": "Céleste", "min_level": 50},
]

MAX_LEVEL = 60


def evolution_for_level(level: int) -> dict:
    """Retourne le palier d'évolution courant pour un niveau donné."""
    tier = EVOLUTION_TIERS[0]
    for t in EVOLUTION_TIERS:
        if level >= t["min_level"]:
            tier = t
    return tier


# Switch payant : le premier changement est gratuit (cf. logique côté
# router), les suivants coûtent un montant fixe en Sylvins (PROMO ou PAID,
# débit prioritairement PROMO).
SWITCH_PRICE_SYLVINS = 300


def get_familiar(familiar_id: str | None) -> FamiliarDef | None:
    if not familiar_id:
        return None
    return FAMILIARS_BY_ID.get(familiar_id)


def xp_required_for_level(level: int) -> int:
    """XP requis pour passer du niveau (level-1) au niveau `level`.

    Progression douce, exponentielle modérée. Calibrage indicatif :
    - Niveau 10 (Éveillé) atteint vers ~1 600 XP (~2 semaines d'usage actif)
    - Niveau 25 (Mythique) atteint vers ~12 500 XP (~2 mois)
    - Niveau 50 (Céleste) atteint vers ~57 000 XP (~6-12 mois)
    """
    if level <= 1:
        return 0
    return int(12 * (level - 1) ** 1.25) + 18 * (level - 1)


def total_xp_for_level(level: int) -> int:
    """XP TOTAL cumulé pour atteindre exactement `level`."""
    if level <= 1:
        return 0
    return sum(xp_required_for_level(lvl) for lvl in range(2, level + 1))


def level_from_xp(xp: int) -> int:
    """Niveau d'un familier pour un XP cumulé donné."""
    xp = max(0, int(xp))
    level = 1
    while level < MAX_LEVEL and total_xp_for_level(level + 1) <= xp:
        level += 1
    return level


def progress_in_level(xp: int) -> tuple[int, int, int]:
    """Retourne (level, xp_into_level, xp_to_next_level).

    Pour afficher une barre de progression sur la page Mon Familier :
        progress = xp_into_level / xp_to_next_level
    Au niveau max, `xp_to_next_level = 0` (à gérer côté UI).
    """
    level = level_from_xp(xp)
    base = total_xp_for_level(level)
    if level >= MAX_LEVEL:
        return (level, max(0, xp - base), 0)
    next_total = total_xp_for_level(level + 1)
    return (level, max(0, xp - base), next_total - base)


def compute_familiar_stats(familiar_id: str | None, xp: int) -> FamiliarStats:
    """Retourne les stats effectives d'un familier (base + bonus de niveau).

    Chaque stat gagne `+1` tous les 2 niveaux au-dessus de 1 et est plafonnée
    à 99. Volontairement plate pour ne pas devenir un système RPG complexe.
    """
    fam = get_familiar(familiar_id)
    if fam is None:
        return {
            "aura": 0,
            "energy": 0,
            "harvest": 0,
            "affinity": 0,
            "charisma": 0,
        }
    level = level_from_xp(xp)
    bonus = max(0, (level - 1) // 2)
    base = fam["base_stats"]
    return {
        "aura": min(99, base["aura"] + bonus),
        "energy": min(99, base["energy"] + bonus),
        "harvest": min(99, base["harvest"] + bonus),
        "affinity": min(99, base["affinity"] + bonus),
        "charisma": min(99, base["charisma"] + bonus),
    }
