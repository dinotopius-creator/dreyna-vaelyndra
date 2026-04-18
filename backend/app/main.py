"""Point d'entrée FastAPI pour la cour de Vaelyndra."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import posts

app = FastAPI(title="Vaelyndra API", version="0.1.0")


# En prod on restreindra aux domaines deployés ; en dev on ouvre tout.
_cors_origins = os.environ.get(
    "VAELYNDRA_CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173,https://dist-tsbfgcct.devinapps.com",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(posts.router)
