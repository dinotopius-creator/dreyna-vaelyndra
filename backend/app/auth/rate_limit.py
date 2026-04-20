"""Rate limiting pour les endpoints d'auth.

On utilise `slowapi` qui wrap Starlette + une clé personnalisée (IP + email
pour les endpoints de login, uniquement IP ailleurs).

Limites par défaut :
- POST /auth/login    : 5 / minute / (IP, email) + 20 / heure / IP
- POST /auth/register : 3 / heure / IP
- POST /auth/request-password-reset : 3 / heure / (IP, email)

La clé couple (IP, email) empêche un attaquant de brute-forcer un compte
même s'il tourne ses IPs ; et la clé IP seule empêche le spray sur
plusieurs comptes depuis une même source.
"""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_ip(request: Request) -> str:
    """IP client. Priorité au header `Fly-Client-IP` (Fly.io injecte la
    vraie IP derrière leur load balancer) puis `X-Forwarded-For` puis
    l'IP TCP directe."""
    for header in ("fly-client-ip", "x-forwarded-for"):
        value = request.headers.get(header)
        if value:
            # X-Forwarded-For peut contenir une liste "a, b, c" — la première
            # est l'IP d'origine.
            return value.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)


def user_agent_of(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    return ua[:300] if ua else None  # on tronque, pas d'UA de 10 Ko en DB
