"""Détection de fautes de frappe dans les domaines email courants.

Objectif : rattraper les inscriptions où le domaine est manifestement
mal orthographié (`gmil.com`, `hotmial.com`, `outloo.com`, …) avant de
laisser passer un compte que son propriétaire ne pourra jamais valider
parce qu'il ne recevra pas le mail de confirmation.

Stratégie :
  1. Liste blanche de domaines populaires.
  2. Pour chaque inscription, on calcule la distance de Levenshtein
     entre le domaine fourni et chaque domaine connu. Si on trouve un
     match à distance ≤ 2 (et que le domaine fourni n'est pas lui-même
     dans la whitelist), on suggère la correction et on rejette.

On reste volontairement conservateur : on ne suggère QUE quand il y a
exactement un candidat plausible. Si deux domaines connus sont à
distance ≤ 2, on laisse passer (ambiguïté → on ne se permet pas de
corriger un domaine d'entreprise légitime qui ressemblerait par hasard
à un fournisseur grand public).
"""
from __future__ import annotations

from typing import Optional


# Whitelist des domaines email très courants en France et à l'international.
# On y inclut les variantes locales (free.fr, orange.fr…) parce que c'est
# typiquement là que les fautes de frappe arrivent (les utilisateurs
# tapent vite sur mobile).
_KNOWN_DOMAINS: frozenset[str] = frozenset(
    {
        # Internationaux
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "outlook.fr",
        "hotmail.com",
        "hotmail.fr",
        "hotmail.co.uk",
        "live.com",
        "live.fr",
        "msn.com",
        "yahoo.com",
        "yahoo.fr",
        "yahoo.co.uk",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "protonmail.com",
        "proton.me",
        "pm.me",
        "tutanota.com",
        "tuta.io",
        "zoho.com",
        "fastmail.com",
        "mail.com",
        "gmx.com",
        "gmx.fr",
        # FAI français
        "free.fr",
        "orange.fr",
        "wanadoo.fr",
        "sfr.fr",
        "neuf.fr",
        "laposte.net",
        "bbox.fr",
        "numericable.fr",
        "club-internet.fr",
        "aliceadsl.fr",
        # Belgique / Suisse / Canada
        "skynet.be",
        "telenet.be",
        "bluewin.ch",
        "videotron.ca",
        "sympatico.ca",
    }
)


def _levenshtein(a: str, b: str) -> int:
    """Distance de Levenshtein. Implémentation O(len(a)*len(b)) avec une
    ligne de DP, suffisante pour des domaines de longueur ≤ 30.
    """
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    # Toujours itérer sur le plus court en interne pour limiter l'allocation.
    if len(a) > len(b):
        a, b = b, a
    prev = list(range(len(a) + 1))
    for j, cb in enumerate(b, start=1):
        curr = [j] + [0] * len(a)
        for i, ca in enumerate(a, start=1):
            cost = 0 if ca == cb else 1
            curr[i] = min(
                curr[i - 1] + 1,  # insertion
                prev[i] + 1,  # suppression
                prev[i - 1] + cost,  # substitution
            )
        prev = curr
    return prev[len(a)]


def suggest_domain_correction(domain: str) -> Optional[str]:
    """Si `domain` ressemble à une faute de frappe d'un domaine connu,
    renvoie le domaine corrigé. Sinon `None`.

    On n'opère **pas** de correction si :
      - `domain` est lui-même dans la whitelist (déjà valide).
      - Aucun candidat n'est à distance ≤ 2.
      - Plusieurs candidats sont à la même distance minimale (ambiguïté).
    """
    domain = domain.strip().lower()
    if not domain or "." not in domain:
        return None
    if domain in _KNOWN_DOMAINS:
        return None

    best: Optional[str] = None
    best_distance = 3  # seuil exclusif : on n'accepte que ≤ 2.
    tied = False
    for candidate in _KNOWN_DOMAINS:
        # Tolérance de longueur : pas la peine de comparer "a.fr" à
        # "googlemail.com", la distance sera énorme.
        if abs(len(candidate) - len(domain)) > 2:
            continue
        d = _levenshtein(domain, candidate)
        if d < best_distance:
            best_distance = d
            best = candidate
            tied = False
        elif d == best_distance:
            tied = True

    if tied or best is None or best_distance > 2:
        return None
    return best
