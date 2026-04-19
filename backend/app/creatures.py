"""Catalogue figé des 9 créatures proposées à l'inscription.

Le terme strict est **créature** (jamais « race » / « espèce » / « classe »).
Catalogue stocké en code (pas de table SQL) parce qu'il évolue rarement et
qu'on veut pouvoir ajouter des descriptions riches sans migration.

Chaque créature :
- `id`        : slug stable stocké en base dans `UserProfile.creature_id`.
- `name`      : nom affiché (majuscule initiale, FR).
- `icon`      : emoji — source de vérité pour le badge.
- `color`     : accent hex (pour le liseré du badge, la carte de sélection…).
- `description` : petit paragraphe d'ambiance affiché à l'inscription.
"""
from __future__ import annotations

from typing import Dict, List, TypedDict


class Creature(TypedDict):
    id: str
    name: str
    icon: str
    color: str
    description: str


CREATURES: List[Creature] = [
    {
        "id": "elfe",
        "name": "Elfe",
        "icon": "🧝",
        "color": "#9ae6a4",
        "description": "Gracieux·se, ancien·ne, gardien·ne de la forêt et des étoiles.",
    },
    {
        "id": "demon",
        "name": "Démon",
        "icon": "😈",
        "color": "#ef4444",
        "description": "Né·e du feu intérieur, rapide et flamboyant·e.",
    },
    {
        "id": "humain",
        "name": "Humain",
        "icon": "🧑",
        "color": "#f3c97b",
        "description": "Curieux·se et adaptable, pont entre les mondes.",
    },
    {
        "id": "dragon",
        "name": "Dragon",
        "icon": "🐉",
        "color": "#d14a4a",
        "description": "Écailles ancestrales, souffle de tempête et de braise.",
    },
    {
        "id": "esprit",
        "name": "Esprit",
        "icon": "👻",
        "color": "#c4b5fd",
        "description": "Murmure entre deux plans, insaisissable et libre.",
    },
    {
        "id": "gardien",
        "name": "Gardien",
        "icon": "🛡️",
        "color": "#60a5fa",
        "description": "Protecteur·rice des lieux sacrés, loyal·e jusqu'au bout.",
    },
    {
        "id": "alien",
        "name": "Alien",
        "icon": "👽",
        "color": "#34d399",
        "description": "Venu·e d'une étoile lointaine, regard neuf sur Vaelyndra.",
    },
    {
        "id": "fee",
        "name": "Fée",
        "icon": "🧚",
        "color": "#f0abfc",
        "description": "Poussière d'ailes et farces enchantées, amie de la lumière.",
    },
    {
        "id": "sirene",
        "name": "Sirène",
        "icon": "🧜",
        "color": "#22d3ee",
        "description": "Chant d'écume, enfant des marées et des profondeurs.",
    },
]

CREATURES_BY_ID: Dict[str, Creature] = {c["id"]: c for c in CREATURES}


def get_creature(creature_id: str | None) -> Creature | None:
    """Retourne la créature complète ou None si l'id est inconnu/absent."""
    if not creature_id:
        return None
    return CREATURES_BY_ID.get(creature_id)
