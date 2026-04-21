"""Seed initial du catalogue (produits + articles) — PR #76.

Reproduit à l'identique les données `INITIAL_PRODUCTS` et
`INITIAL_ARTICLES` qui étaient côté frontend dans `src/data/mock.ts`.
Au 1er démarrage (ou après une DB nouvellement migrée), on pousse ce
catalogue en DB. Les démarrages suivants ne touchent plus à rien :

- Si `CatalogProduct` contient déjà au moins une ligne → pas de seed
  (respecte tout ce que l'admin a ajouté / supprimé / modifié).
- Idem pour `CatalogArticle`.

Autrement dit : suppression d'un produit via `/admin/catalog/products/{id}`
est permanente, elle ne sera PAS ressuscitée au redémarrage.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import select

from .db import get_session
from .models import CatalogArticle, CatalogProduct


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


SEED_PRODUCTS: list[dict] = [
    {
        "id": "prod-crown",
        "name": "Couronne d'Aube",
        "tagline": "La couronne cérémonielle de Dreyna",
        "description": "Réplique artisanale inspirée de la couronne portée lors du rituel d'Elennor. Métal doré antique, pierres de lune synthétiques.",
        "price": 149,
        "image": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&auto=format&fit=crop&q=80",
        "category": "Merch",
        "rating": 4.9,
        "stock": 12,
        "featured": True,
        "tags": ["collector", "édition limitée"],
    },
    {
        "id": "prod-vip",
        "name": "Pass Cour Royale · VIP",
        "tagline": "Accès illimité aux lives privés de Dreyna",
        "description": "Rejoignez la Cour Royale : lives exclusifs, chat privilégié, drops en avant-première, role dédié sur Discord.",
        "price": 29,
        "image": "https://images.unsplash.com/photo-1604580864964-0462f5d5b1a8?w=900&auto=format&fit=crop&q=80",
        "category": "VIP",
        "rating": 5,
        "stock": 999,
        "featured": True,
        "tags": ["abonnement", "VIP"],
    },
    {
        "id": "prod-pack",
        "name": "Pack Avatar · Elennor",
        "tagline": "Tenue numérique exclusive",
        "description": "Tenue, coiffe et accessoires animés pour votre avatar Vaelyndra — signés par la cour.",
        "price": 19,
        "image": "https://images.unsplash.com/photo-1520975867597-0af37a22e31e?w=900&auto=format&fit=crop&q=80",
        "category": "Digital",
        "rating": 4.7,
        "stock": 500,
        "featured": True,
        "tags": ["digital", "avatar"],
    },
    {
        "id": "prod-grimoire",
        "name": "Grimoire de Vaelyndra",
        "tagline": "Le livre officiel du lore",
        "description": "200 pages reliées à la main, illustrées de runes et d'enluminures. L'histoire complète du royaume.",
        "price": 59,
        "image": "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=900&auto=format&fit=crop&q=80",
        "category": "Exclusif",
        "rating": 4.95,
        "stock": 87,
        "tags": ["livre", "lore"],
    },
    {
        "id": "prod-hoodie",
        "name": "Cape Noire · House of Dreyna",
        "tagline": "Le hoodie cape brodé",
        "description": "Hoodie coton lourd, capuche ornée de runes dorées, doublure intérieure violette.",
        "price": 89,
        "image": "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900&auto=format&fit=crop&q=80",
        "category": "Merch",
        "rating": 4.8,
        "stock": 150,
        "tags": ["hoodie", "streetwear"],
    },
    {
        "id": "prod-wallpaper",
        "name": "Pack Wallpapers Nocturne",
        "tagline": "15 fonds d'écran enchantés",
        "description": "Pack de 15 wallpapers haute résolution pour mobile et desktop, avec animations Live Photo pour iOS.",
        "price": 9,
        "image": "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&auto=format&fit=crop&q=80",
        "category": "Digital",
        "rating": 4.6,
        "stock": 9999,
        "tags": ["wallpapers", "digital"],
    },
    {
        "id": "prod-sylvins-100",
        "name": "Pochée de Sylvins",
        "tagline": "100 Sylvins — le premier pas",
        "description": "100 Sylvins crédités immédiatement sur ton compte. Parfait pour offrir tes premiers cadeaux animés pendant les lives.",
        "price": 1.99,
        "image": "/sylvin-coin-icon.png",
        "category": "Sylvins",
        "rating": 5,
        "stock": 9999,
        "tags": ["sylvins", "monnaie virtuelle"],
        "sylvins": 100,
    },
    {
        "id": "prod-sylvins-500",
        "name": "Bourse de Sylvins",
        "tagline": "500 Sylvins + 50 bonus",
        "description": "550 Sylvins au total (500 + 50 offerts). Le pack le plus populaire de la cour pour soutenir Dreyna en live.",
        "price": 8.99,
        "image": "/sylvin-coin-icon.png",
        "category": "Sylvins",
        "rating": 4.9,
        "stock": 9999,
        "tags": ["sylvins", "monnaie virtuelle", "populaire"],
        "featured": True,
        "sylvins": 550,
    },
    {
        "id": "prod-sylvins-1200",
        "name": "Coffre Verdoyant",
        "tagline": "1 200 Sylvins + 200 bonus",
        "description": "1 400 Sylvins au total (1 200 + 200 offerts). Pour les chevaliers réguliers de la cour.",
        "price": 19.99,
        "image": "/sylvin-coin-icon.png",
        "category": "Sylvins",
        "rating": 4.9,
        "stock": 9999,
        "tags": ["sylvins", "monnaie virtuelle"],
        "sylvins": 1400,
    },
    {
        "id": "prod-sylvins-3000",
        "name": "Arche Sylvestre",
        "tagline": "3 000 Sylvins + 600 bonus",
        "description": "3 600 Sylvins au total (3 000 + 600 offerts). Pour les ducs et duchesses de la cour royale.",
        "price": 44.99,
        "image": "/sylvin-coin-icon.png",
        "category": "Sylvins",
        "rating": 4.95,
        "stock": 9999,
        "tags": ["sylvins", "monnaie virtuelle"],
        "sylvins": 3600,
    },
    {
        "id": "prod-sylvins-8000",
        "name": "Relique d'Elennor",
        "tagline": "8 000 Sylvins + 2 000 bonus",
        "description": "10 000 Sylvins au total (8 000 + 2 000 offerts). Pour les princes et princesses de Vaelyndra — débloque automatiquement le badge Mécène Royal.",
        "price": 99.99,
        "image": "/sylvin-coin-icon.png",
        "category": "Sylvins",
        "rating": 5,
        "stock": 9999,
        "tags": ["sylvins", "monnaie virtuelle", "premium"],
        "featured": True,
        "sylvins": 10000,
    },
]


SEED_ARTICLES: list[dict] = [
    {
        "id": "art-1",
        "slug": "naissance-vaelyndra",
        "title": "La naissance du royaume de Vaelyndra",
        "excerpt": "Il était une fois, sous le voile argenté des étoiles, la fondation d'un royaume oublié...",
        "content": (
            "Les anciens chants racontent qu'avant l'aube des âges, les elfes "
            "de lumière façonnèrent Vaelyndra à partir du souffle des étoiles. "
            "Leur reine, née d'un rayon de lune, fut appelée **Dreyna**. Elle "
            "tissa les frontières du royaume de ses propres mains, traçant les "
            "runes sacrées sur l'écorce des Arbres-Monde.\n\nAujourd'hui, "
            "Vaelyndra est un sanctuaire vivant, à la fois terre, rêve et "
            "souvenir. Chaque membre de la communauté en est un gardien."
        ),
        "category": "Lore",
        "cover": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&auto=format&fit=crop&q=80",
        "author": "Dreyna",
        "created_at": "2025-03-21T19:00:00Z",
        "reading_time": 4,
        "tags": ["lore", "royaume", "origines"],
        "comments": [
            {
                "id": "c-1",
                "authorId": "user-lyria",
                "authorName": "Lyria",
                "authorAvatar": "https://i.pravatar.cc/150?u=lyria",
                "content": "Majestueux... j'en ai les larmes aux yeux 🌙✨",
                "createdAt": "2025-03-22T08:21:00Z",
                "likes": [],
            }
        ],
    },
    {
        "id": "art-2",
        "slug": "nouvelle-collection-aube",
        "title": "La collection « Aube d'Elennor » est arrivée",
        "excerpt": "Une collection entière inspirée des robes de lune et des armures de feuillage argenté.",
        "content": (
            "Cette saison, j'ai imaginé une collection en trois actes : "
            "**Aube**, **Crépuscule**, **Nocturne**. Chaque pièce porte la "
            "marque d'un sort elfique que j'ai rêvé des semaines durant.\n\n"
            "Les items exclusifs sont disponibles dès maintenant dans la "
            "Boutique Royale — certains ne reviendront jamais."
        ),
        "category": "Lifestyle",
        "cover": "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=1600&auto=format&fit=crop&q=80",
        "author": "Dreyna",
        "created_at": "2025-04-02T15:00:00Z",
        "reading_time": 3,
        "tags": ["collection", "mode", "aube"],
    },
    {
        "id": "art-3",
        "slug": "live-nocturne-ce-vendredi",
        "title": "Live Nocturne : ce vendredi, la cour ouvre ses portes",
        "excerpt": "Rituel d'ouverture, lecture d'un chapitre inédit du lore, Q&A et surprises.",
        "content": (
            "Allumez une bougie, préparez une tasse de tisane d'argent — "
            "vendredi, nous célébrons la Nuit Étoilée en live. Arrivez 10 "
            "minutes avant le début pour prononcer ensemble le serment "
            "d'entrée dans Vaelyndra."
        ),
        "category": "Annonces",
        "cover": "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=1600&auto=format&fit=crop&q=80",
        "author": "Dreyna",
        "created_at": "2025-04-10T09:30:00Z",
        "reading_time": 2,
        "tags": ["live", "communauté"],
    },
    {
        "id": "art-4",
        "slug": "top-10-fans-avril",
        "title": "Les 10 étoiles du mois : la cour d'Avril",
        "excerpt": "Découvrez les 10 membres qui ont fait rayonner Vaelyndra ce mois-ci.",
        "content": (
            "Merci à vous tous pour votre dévouement. Voici la Cour d'Avril : "
            "Lyria, Caelum, Sylas, Aëris, Thalia, Elior, Nyx, Orion, Mira, "
            "Soren. Chacun recevra un badge exclusif et une invitation privée "
            "au prochain live."
        ),
        "category": "Communauté",
        "cover": "https://images.unsplash.com/photo-1519810755548-39cd217da494?w=1600&auto=format&fit=crop&q=80",
        "author": "Dreyna",
        "created_at": "2025-04-14T18:10:00Z",
        "reading_time": 3,
        "tags": ["communauté", "fans", "awards"],
    },
]


def seed_catalog() -> None:
    """Crée le catalogue initial si les tables sont vides.

    Idempotent : un 2e appel sur une DB déjà seedée ne fait rien. Une
    suppression admin via `DELETE /admin/catalog/products/{id}` est donc
    permanente (ne reviendra pas au redémarrage), même si le produit
    supprimé était un seed d'origine."""
    with get_session() as session:
        existing_products = session.exec(select(CatalogProduct)).first()
        if existing_products is None:
            now = _now_iso()
            for p in SEED_PRODUCTS:
                session.add(
                    CatalogProduct(
                        id=p["id"],
                        name=p["name"],
                        tagline=p.get("tagline", ""),
                        description=p.get("description", ""),
                        price=float(p.get("price", 0)),
                        currency=p.get("currency", "€"),
                        image=p.get("image", ""),
                        category=p.get("category", "Merch"),
                        sylvins=p.get("sylvins"),
                        rating=float(p.get("rating", 5.0)),
                        stock=int(p.get("stock", 0)),
                        featured=bool(p.get("featured", False)),
                        tags_json=json.dumps(
                            p.get("tags", []), ensure_ascii=False
                        ),
                        created_at=now,
                        updated_at=now,
                    )
                )

        existing_articles = session.exec(select(CatalogArticle)).first()
        if existing_articles is None:
            for a in SEED_ARTICLES:
                now = a.get("created_at", _now_iso())
                session.add(
                    CatalogArticle(
                        id=a["id"],
                        slug=a["slug"],
                        title=a["title"],
                        excerpt=a.get("excerpt", ""),
                        content=a.get("content", ""),
                        category=a.get("category", "Lore"),
                        cover=a.get("cover", ""),
                        author=a.get("author", ""),
                        reading_time=int(a.get("reading_time", 3)),
                        tags_json=json.dumps(
                            a.get("tags", []), ensure_ascii=False
                        ),
                        likes_json="[]",
                        comments_json=json.dumps(
                            a.get("comments", []), ensure_ascii=False
                        ),
                        created_at=now,
                        updated_at=now,
                    )
                )

        session.commit()
