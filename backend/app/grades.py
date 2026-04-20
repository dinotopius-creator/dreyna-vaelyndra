"""Système de grades spirituels pour les streamers (PR M).

Chaque user/streamer accumule de l'XP via ses activités :
  - 1 Sylvin reçu (cadeau d'un autre membre) = 1 XP
  - 1 abonné ("lien d'âme") = 50 XP (branché depuis le system follow existant)
  - 1 post créé = 10 XP (bonus régularité, optionnel)
  - Admins peuvent override la grade manuellement via `streamer_grade_override`

Les 6 grades (formes spirituelles) :

  🌱 Novice des Brumes        0 – 99 XP
  🌿 Apprenti des Sentiers    100 – 499 XP
  🌙 Gardien des Flux         500 – 1 999 XP
  🔥 Arcaniste Éveillé        2 000 – 9 999 XP
  ⚔️ Élite du Régent          10 000 – 49 999 XP
  👑 Légende de Vaelyndra     ≥ 50 000 XP

La source de vérité unique est ce fichier. Le front miroite la liste dans
`src/data/grades.ts` mais ne s'en sert que pour le rendu visuel.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class Grade:
    slug: str
    name: str
    emoji: str
    motto: str
    theme: str
    min_xp: int
    color: str  # accent hex pour le front (badge gradient)


GRADES: List[Grade] = [
    Grade(
        slug="novice-brumes",
        name="Novice des Brumes",
        emoji="🌱",
        motto="Les âmes viennent de s'éveiller",
        theme="Brume magique, énergie instable",
        min_xp=0,
        color="#7fb77e",
    ),
    Grade(
        slug="apprenti-sentiers",
        name="Apprenti des Sentiers",
        emoji="🌿",
        motto="L'énergie commence à circuler",
        theme="Forêt vivante, runes simples",
        min_xp=100,
        color="#4aa37a",
    ),
    Grade(
        slug="gardien-flux",
        name="Gardien des Flux",
        emoji="🌙",
        motto="L'équilibre commence à se stabiliser",
        theme="Magie lunaire, symboles protecteurs",
        min_xp=500,
        color="#7aa7d9",
    ),
    Grade(
        slug="arcaniste-eveille",
        name="Arcaniste Éveillé",
        emoji="🔥",
        motto="La magie devient puissance",
        theme="Flammes mystiques, runes dorées",
        min_xp=2_000,
        color="#e6a84a",
    ),
    Grade(
        slug="elite-regent",
        name="Élite du Régent",
        emoji="⚔️",
        motto="Les piliers du royaume",
        theme="Armure magique royale",
        min_xp=10_000,
        color="#c87a3a",
    ),
    Grade(
        slug="legende-vaelyndra",
        name="Légende de Vaelyndra",
        emoji="👑",
        motto="Les êtres rares qui façonnent le monde",
        theme="Aura divine, couronne d'énergie",
        min_xp=50_000,
        color="#e6c274",
    ),
]


def grade_for_xp(xp: int) -> Grade:
    """Retourne le grade correspondant à un montant d'XP.

    Parcours décroissant : premier palier dont `min_xp` est ≤ xp gagne.
    """
    xp = max(0, xp)
    for g in reversed(GRADES):
        if xp >= g.min_xp:
            return g
    return GRADES[0]


def grade_by_slug(slug: str) -> Optional[Grade]:
    for g in GRADES:
        if g.slug == slug:
            return g
    return None


def next_grade(current: Grade) -> Optional[Grade]:
    """Retourne le grade suivant (ou None si déjà au sommet)."""
    idx = GRADES.index(current)
    if idx + 1 >= len(GRADES):
        return None
    return GRADES[idx + 1]


def progress_in_current_grade(xp: int) -> tuple[int, Optional[int]]:
    """Retourne (xp_depuis_palier_courant, xp_necessaires_prochain_palier).

    Si le user est déjà au max (Légende), le 2e élément vaut None.
    """
    xp = max(0, xp)
    current = grade_for_xp(xp)
    nxt = next_grade(current)
    if nxt is None:
        return xp - current.min_xp, None
    return xp - current.min_xp, nxt.min_xp - current.min_xp
