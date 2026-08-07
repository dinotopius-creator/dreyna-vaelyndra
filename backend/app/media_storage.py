"""Stockage des médias uploadés (images de la communauté, etc.).

Problème historique : les images étaient écrites dans `backend/uploads/`,
c'est-à-dire sur le **disque éphémère** du conteneur Fly.io. À chaque
redéploiement le conteneur est recréé → ce dossier est effacé → les images
des publications renvoyaient un 404 et le fil affichait le fallback
« Cette publication contient un lien externe, pas une image affichable ».

La base SQLite, elle, vit sur le **volume persistant** monté sur `/data`
(cf. `db.py`) et survit donc aux déploiements. On range désormais les médias
au même endroit (`/data/uploads`) pour qu'ils persistent eux aussi.

En local (pas de `/data`), on retombe sur `backend/uploads`.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import Request

# Même logique que db.py : si le volume persistant Fly est monté, on y range
# les médias afin qu'ils survivent aux redéploiements.
_FLY_VOLUME = Path("/data")
_DEFAULT_MEDIA_ROOT = (
    _FLY_VOLUME / "uploads"
    if _FLY_VOLUME.is_dir()
    else Path(__file__).resolve().parent.parent / "uploads"
)
MEDIA_ROOT = Path(os.environ.get("VAELYNDRA_MEDIA_ROOT", str(_DEFAULT_MEDIA_ROOT)))
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Sous-dossier dédié aux images des publications de la communauté.
COMMUNITY_DIR = MEDIA_ROOT / "community"
COMMUNITY_DIR.mkdir(parents=True, exist_ok=True)


def _public_scheme(request: Request) -> str:
    """Schéma à utiliser dans les URLs publiques des médias.

    Derrière le proxy Fly.io, l'app reçoit la requête en HTTP même si le
    client a parlé en HTTPS : `request.url.scheme` vaut alors `http`. Or le
    site est servi en HTTPS, donc un `<img src="http://…">` est bloqué par le
    navigateur (mixed content). On respecte donc `X-Forwarded-Proto`, et à
    défaut on force `https` dès que l'hôte n'est pas local.
    """
    forwarded = request.headers.get("x-forwarded-proto")
    if forwarded:
        # Peut contenir une liste "https,http" — on prend le premier.
        return forwarded.split(",")[0].strip()
    host = (request.headers.get("host") or request.url.hostname or "").lower()
    if host.startswith("localhost") or host.startswith("127.0.0.1"):
        return request.url.scheme
    return "https"


def build_media_url(request: Request, relpath: str) -> str:
    """Construit l'URL publique d'un média servi sous `/media`.

    `relpath` est relatif à `MEDIA_ROOT` (ex. `community/abc.jpg`). On force le
    bon schéma (HTTPS en prod) pour éviter le mixed-content.
    """
    base = os.environ.get("VAELYNDRA_MEDIA_BASE_URL")
    if base:
        return f"{base.rstrip('/')}/media/{relpath.lstrip('/')}"
    scheme = _public_scheme(request)
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/media/{relpath.lstrip('/')}"
