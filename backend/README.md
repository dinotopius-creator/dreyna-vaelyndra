# Vaelyndra Backend

API FastAPI minimale qui héberge les posts, commentaires et réactions de la
cour de Vaelyndra. Base SQLite persistée sur volume Fly.io (`/data`).

## Lancer en local

```bash
cd backend
pip install -e .
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET  /healthz`
- `GET  /posts`
- `POST /posts`
- `DELETE /posts/{id}?user_id=...`
- `POST /posts/{id}/reactions`
- `POST /posts/{id}/comments`
- `DELETE /posts/{id}/comments/{commentId}?user_id=...`

## Variables d'environnement

- `VAELYNDRA_DB_PATH` — chemin du fichier SQLite (par défaut
  `backend/vaelyndra.db` en local, `/data/vaelyndra.db` en prod Fly).
- `VAELYNDRA_CORS_ORIGINS` — liste CSV des origines autorisées.
