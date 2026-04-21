"""Système de grades spirituels pour les streamers (PR M).

Chaque user/streamer accumule de l'XP via ses activités :
  - 1 Sylvin reçu (cadeau d'un autre membre) = 1 XP
  - 1 abonné ("lien d'âme") = 50 XP (branché depuis le system follow existant)
  - 1 post créé = 10 XP (bonus régularité, optionnel)
  - Admins peuvent override la grade manuellement via `streamer_grade_override`

Les 6 grades (formes spirituelles) :

  🌱 Novice des Brumes        [BRM]   0 – 99 XP
  🌿 Apprenti des Sentiers    [SEN]   100 – 499 XP
  🌙 Gardien des Flux         [FLX]   500 – 1 999 XP
  🔥 Arcaniste Éveillé        [ARC]   2 000 – 9 999 XP
  ⚔️ Élite du Régent           [ELT]   ≥ 10 000 XP (plafond auto)
  👑 Légende de Vaelyndra     [LEG]   *programme admin — ne se gagne pas à l'XP*

Le grade 👑 Légende est un **sacre manuel** : il ne peut pas être obtenu en
accumulant de l'XP, seulement par décision d'un admin (toi / Le roi des
zems) via `streamer_grade_override`. Ça récompense le contenu, pas le
volume de cadeaux.

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
    short: str  # diminutif 3-lettres affiché entre crochets (ex. "BRM")
    emoji: str
    motto: str
    theme: str
    min_xp: int
    color: str  # accent hex pour le front (badge gradient)
    # Si True, le grade ne se gagne QUE sur décision d'un admin (override),
    # jamais via accumulation d'XP. `grade_for_xp` l'ignore et `next_grade`
    # s'arrête au dernier grade automatique (Élite du Régent).
    admin_only: bool = False


GRADES: List[Grade] = [
    Grade(
        slug="novice-brumes",
        name="Novice des Brumes",
        short="BRM",
        emoji="🌱",
        motto="Les âmes viennent de s'éveiller",
        theme="Brume magique, énergie instable",
        min_xp=0,
        color="#7fb77e",
    ),
    Grade(
        slug="apprenti-sentiers",
        name="Apprenti des Sentiers",
        short="SEN",
        emoji="🌿",
        motto="L'énergie commence à circuler",
        theme="Forêt vivante, runes simples",
        min_xp=100,
        color="#4aa37a",
    ),
    Grade(
        slug="gardien-flux",
        name="Gardien des Flux",
        short="FLX",
        emoji="🌙",
        motto="L'équilibre commence à se stabiliser",
        theme="Magie lunaire, symboles protecteurs",
        min_xp=500,
        color="#7aa7d9",
    ),
    Grade(
        slug="arcaniste-eveille",
        name="Arcaniste Éveillé",
        short="ARC",
        emoji="🔥",
        motto="La magie devient puissance",
        theme="Flammes mystiques, runes dorées",
        min_xp=2_000,
        color="#e6a84a",
    ),
    Grade(
        slug="elite-regent",
        name="Élite du Régent",
        short="ELT",
        emoji="⚔️",
        motto="Les piliers du royaume",
        theme="Armure magique royale",
        min_xp=10_000,
        color="#c87a3a",
    ),
    Grade(
        slug="legende-vaelyndra",
        name="Légende de Vaelyndra",
        short="LEG",
        emoji="👑",
        motto="Les êtres rares qui façonnent le monde",
        theme="Aura divine, couronne d'énergie",
        # min_xp très haut par symétrie, mais `admin_only=True` fait que
        # ce palier n'est jamais atteint via accumulation d'XP.
        min_xp=50_000,
        color="#e6c274",
        admin_only=True,
    ),
]


# Le slug spécial du programme Légende — utilisé pour déclencher le DM
# automatique de félicitations quand un admin l'accorde.
LEGEND_SLUG = "legende-vaelyndra"


def grade_for_xp(xp: int) -> Grade:
    """Retourne le grade correspondant à un montant d'XP.

    Parcours décroissant : premier palier dont `min_xp` est ≤ xp gagne. Les
    grades `admin_only` (ex. Légende) sont ignorés ici — ils ne peuvent
    être obtenus que par override admin.
    """
    xp = max(0, xp)
    for g in reversed(GRADES):
        if g.admin_only:
            continue
        if xp >= g.min_xp:
            return g
    return GRADES[0]


def grade_by_slug(slug: str) -> Optional[Grade]:
    for g in GRADES:
        if g.slug == slug:
            return g
    return None


def next_grade(current: Grade) -> Optional[Grade]:
    """Retourne le grade auto suivant (ou None si on est au plafond auto).

    Les grades admin_only ne font pas partie de la progression affichée
    aux users — depuis Élite du Régent, la barre "prochain grade" est vide.
    """
    try:
        idx = GRADES.index(current)
    except ValueError:
        return None
    for nxt in GRADES[idx + 1 :]:
        if nxt.admin_only:
            continue
        return nxt
    return None


def progress_in_current_grade(xp: int) -> tuple[int, Optional[int]]:
    """Retourne (xp_depuis_palier_courant, xp_necessaires_prochain_palier).

    Si le user est déjà au plafond auto (Élite), le 2e élément vaut None.
    """
    xp = max(0, xp)
    current = grade_for_xp(xp)
    nxt = next_grade(current)
    if nxt is None:
        return xp - current.min_xp, None
    return xp - current.min_xp, nxt.min_xp - current.min_xp
