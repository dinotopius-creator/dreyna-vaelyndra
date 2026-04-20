import type {
  Article,
  Badge,
  ChatMessage,
  CommunityPost,
  Gift,
  LiveSession,
  Product,
} from "../types";
import dreynaPhoto from "../assets/dreyna-zepeto.png";

// Profil de seed de Dreyna : depuis la dé-Dreyna-isation du site, ce profil
// est traité comme un compte animateur normal (pas de rôle "queen", pas de
// wallet/followers préseedés). Les vrais soldes viennent du backend.
export const DREYNA_PROFILE = {
  id: "user-dreyna",
  username: "Dreyna",
  email: "dreyna@vaelyndra.realm",
  avatar: dreynaPhoto,
  role: "elf" as const,
  joinedAt: "2021-03-21T00:00:00Z",
  bio: "Animatrice de Vaelyndra.",
  socials: {},
  titles: [],
  stats: {
    followers: 0,
    likes: 0,
    articles: 0,
    lives: 0,
    communityMembers: 0,
  },
  gallery: [] as string[],
};

export const BADGES: Badge[] = [
  {
    id: "crown-aurore",
    name: "Couronne d'Aurore",
    description: "Posée sur le front de Dreyna au lever de la première lune.",
    icon: "👑",
    rarity: "royale",
  },
  {
    id: "elennor",
    name: "Lumière d'Elennor",
    description: "Invoque la clarté stellaire des anciens elfes.",
    icon: "✨",
    rarity: "mythique",
  },
  {
    id: "sylvaris",
    name: "Pacte de Sylvaris",
    description: "Liée aux sylves argentées du royaume.",
    icon: "🌿",
    rarity: "rare",
  },
  {
    id: "flamme-royale",
    name: "Flamme Royale",
    description:
      "Réservé aux étincelles reconnues par la cour — portent la flamme des anciens.",
    icon: "🔥",
    rarity: "mythique",
  },
  {
    id: "magic-academy-top2",
    name: "Top 2 · Magic Academy",
    description:
      "Finaliste d'élite de l'événement Magic Academy, classée 2ᵉ du royaume.",
    icon: "🏆",
    rarity: "royale",
  },
  {
    id: "community",
    name: "Voix du Peuple",
    description: "À l'écoute de la cour et du petit peuple elfe.",
    icon: "🎶",
    rarity: "commun",
  },
  {
    id: "stardust",
    name: "Poussière d'Étoiles",
    description: "500 lives de pure magie.",
    icon: "🌠",
    rarity: "mythique",
  },
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: "art-1",
    slug: "naissance-vaelyndra",
    title: "La naissance du royaume de Vaelyndra",
    excerpt:
      "Il était une fois, sous le voile argenté des étoiles, la fondation d'un royaume oublié...",
    content:
      "Les anciens chants racontent qu'avant l'aube des âges, les elfes de lumière façonnèrent Vaelyndra à partir du souffle des étoiles. Leur reine, née d'un rayon de lune, fut appelée **Dreyna**. Elle tissa les frontières du royaume de ses propres mains, traçant les runes sacrées sur l'écorce des Arbres-Monde.\n\nAujourd'hui, Vaelyndra est un sanctuaire vivant, à la fois terre, rêve et souvenir. Chaque membre de la communauté en est un gardien.",
    category: "Lore",
    cover:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&auto=format&fit=crop&q=80",
    author: "Dreyna",
    createdAt: "2025-03-21T19:00:00Z",
    readingTime: 4,
    tags: ["lore", "royaume", "origines"],
    likes: [],
    comments: [
      {
        id: "c-1",
        authorId: "user-lyria",
        authorName: "Lyria",
        authorAvatar:
          "https://i.pravatar.cc/150?u=lyria",
        content: "Majestueux... j'en ai les larmes aux yeux 🌙✨",
        createdAt: "2025-03-22T08:21:00Z",
        likes: [],
      },
    ],
  },
  {
    id: "art-2",
    slug: "nouvelle-collection-aube",
    title: "La collection « Aube d'Elennor » est arrivée",
    excerpt:
      "Une collection entière inspirée des robes de lune et des armures de feuillage argenté.",
    content:
      "Cette saison, j'ai imaginé une collection en trois actes : **Aube**, **Crépuscule**, **Nocturne**. Chaque pièce porte la marque d'un sort elfique que j'ai rêvé des semaines durant.\n\nLes items exclusifs sont disponibles dès maintenant dans la Boutique Royale — certains ne reviendront jamais.",
    category: "Lifestyle",
    cover:
      "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=1600&auto=format&fit=crop&q=80",
    author: "Dreyna",
    createdAt: "2025-04-02T15:00:00Z",
    readingTime: 3,
    tags: ["collection", "mode", "aube"],
    likes: [],
    comments: [],
  },
  {
    id: "art-3",
    slug: "live-nocturne-ce-vendredi",
    title: "Live Nocturne : ce vendredi, la cour ouvre ses portes",
    excerpt:
      "Rituel d'ouverture, lecture d'un chapitre inédit du lore, Q&A et surprises.",
    content:
      "Allumez une bougie, préparez une tasse de tisane d'argent — vendredi, nous célébrons la Nuit Étoilée en live. Arrivez 10 minutes avant le début pour prononcer ensemble le serment d'entrée dans Vaelyndra.",
    category: "Annonces",
    cover:
      "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=1600&auto=format&fit=crop&q=80",
    author: "Dreyna",
    createdAt: "2025-04-10T09:30:00Z",
    readingTime: 2,
    tags: ["live", "communauté"],
    likes: [],
    comments: [],
  },
  {
    id: "art-4",
    slug: "top-10-fans-avril",
    title: "Les 10 étoiles du mois : la cour d'Avril",
    excerpt:
      "Découvrez les 10 membres qui ont fait rayonner Vaelyndra ce mois-ci.",
    content:
      "Merci à vous tous pour votre dévouement. Voici la Cour d'Avril : Lyria, Caelum, Sylas, Aëris, Thalia, Elior, Nyx, Orion, Mira, Soren. Chacun recevra un badge exclusif et une invitation privée au prochain live.",
    category: "Communauté",
    cover:
      "https://images.unsplash.com/photo-1519810755548-39cd217da494?w=1600&auto=format&fit=crop&q=80",
    author: "Dreyna",
    createdAt: "2025-04-14T18:10:00Z",
    readingTime: 3,
    tags: ["communauté", "fans", "awards"],
    likes: [],
    comments: [],
  },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod-crown",
    name: "Couronne d'Aube",
    tagline: "La couronne cérémonielle de Dreyna",
    description:
      "Réplique artisanale inspirée de la couronne portée lors du rituel d'Elennor. Métal doré antique, pierres de lune synthétiques.",
    price: 149,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900&auto=format&fit=crop&q=80",
    category: "Merch",
    rating: 4.9,
    stock: 12,
    featured: true,
    tags: ["collector", "édition limitée"],
  },
  {
    id: "prod-vip",
    name: "Pass Cour Royale · VIP",
    tagline: "Accès illimité aux lives privés de Dreyna",
    description:
      "Rejoignez la Cour Royale : lives exclusifs, chat privilégié, drops en avant-première, role dédié sur Discord.",
    price: 29,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1604580864964-0462f5d5b1a8?w=900&auto=format&fit=crop&q=80",
    category: "VIP",
    rating: 5,
    stock: 999,
    featured: true,
    tags: ["abonnement", "VIP"],
  },
  {
    id: "prod-pack",
    name: "Pack Avatar · Elennor",
    tagline: "Tenue numérique exclusive",
    description:
      "Tenue, coiffe et accessoires animés pour votre avatar Vaelyndra — signés par la cour.",

    price: 19,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1520975867597-0af37a22e31e?w=900&auto=format&fit=crop&q=80",
    category: "Digital",
    rating: 4.7,
    stock: 500,
    tags: ["digital", "avatar"],
    featured: true,
  },
  {
    id: "prod-grimoire",
    name: "Grimoire de Vaelyndra",
    tagline: "Le livre officiel du lore",
    description:
      "200 pages reliées à la main, illustrées de runes et d'enluminures. L'histoire complète du royaume.",
    price: 59,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=900&auto=format&fit=crop&q=80",
    category: "Exclusif",
    rating: 4.95,
    stock: 87,
    tags: ["livre", "lore"],
  },
  {
    id: "prod-hoodie",
    name: "Cape Noire · House of Dreyna",
    tagline: "Le hoodie cape brodé",
    description:
      "Hoodie coton lourd, capuche ornée de runes dorées, doublure intérieure violette.",
    price: 89,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900&auto=format&fit=crop&q=80",
    category: "Merch",
    rating: 4.8,
    stock: 150,
    tags: ["hoodie", "streetwear"],
  },
  {
    id: "prod-wallpaper",
    name: "Pack Wallpapers Nocturne",
    tagline: "15 fonds d'écran enchantés",
    description:
      "Pack de 15 wallpapers haute résolution pour mobile et desktop, avec animations Live Photo pour iOS.",
    price: 9,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&auto=format&fit=crop&q=80",
    category: "Digital",
    rating: 4.6,
    stock: 9999,
    tags: ["wallpapers", "digital"],
  },
  {
    id: "prod-sylvins-100",
    name: "Pochée de Sylvins",
    tagline: "100 Sylvins — le premier pas",
    description:
      "100 Sylvins crédités immédiatement sur ton compte. Parfait pour offrir tes premiers cadeaux animés pendant les lives.",
    price: 1.99,
    currency: "€",
    image: "/sylvin-coin-icon.png",
    category: "Sylvins",
    rating: 5,
    stock: 9999,
    tags: ["sylvins", "monnaie virtuelle"],
    sylvins: 100,
  },
  {
    id: "prod-sylvins-500",
    name: "Bourse de Sylvins",
    tagline: "500 Sylvins + 50 bonus",
    description:
      "550 Sylvins au total (500 + 50 offerts). Le pack le plus populaire de la cour pour soutenir Dreyna en live.",
    price: 8.99,
    currency: "€",
    image: "/sylvin-coin-icon.png",
    category: "Sylvins",
    rating: 4.9,
    stock: 9999,
    tags: ["sylvins", "monnaie virtuelle", "populaire"],
    featured: true,
    sylvins: 550,
  },
  {
    id: "prod-sylvins-1200",
    name: "Coffre Verdoyant",
    tagline: "1 200 Sylvins + 200 bonus",
    description:
      "1 400 Sylvins au total (1 200 + 200 offerts). Pour les chevaliers réguliers de la cour.",
    price: 19.99,
    currency: "€",
    image: "/sylvin-coin-icon.png",
    category: "Sylvins",
    rating: 4.9,
    stock: 9999,
    tags: ["sylvins", "monnaie virtuelle"],
    sylvins: 1400,
  },
  {
    id: "prod-sylvins-3000",
    name: "Arche Sylvestre",
    tagline: "3 000 Sylvins + 600 bonus",
    description:
      "3 600 Sylvins au total (3 000 + 600 offerts). Pour les ducs et duchesses de la cour royale.",
    price: 44.99,
    currency: "€",
    image: "/sylvin-coin-icon.png",
    category: "Sylvins",
    rating: 4.95,
    stock: 9999,
    tags: ["sylvins", "monnaie virtuelle"],
    sylvins: 3600,
  },
  {
    id: "prod-sylvins-8000",
    name: "Relique d'Elennor",
    tagline: "8 000 Sylvins + 2 000 bonus",
    description:
      "10 000 Sylvins au total (8 000 + 2 000 offerts). Pour les princes et princesses de Vaelyndra — débloque automatiquement le badge Mécène Royal.",
    price: 99.99,
    currency: "€",
    image: "/sylvin-coin-icon.png",
    category: "Sylvins",
    rating: 5,
    stock: 9999,
    tags: ["sylvins", "monnaie virtuelle", "mécène"],
    sylvins: 10000,
  },
];

export const INITIAL_COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: "post-1",
    authorId: "user-lyria",
    authorName: "Lyria",
    authorAvatar: "https://i.pravatar.cc/150?u=lyria",
    content:
      "Je viens de terminer ma tenue inspirée de la collection Aube 🌙 ✨ Qui veut voir la photo en live vendredi ?",
    imageUrl:
      "https://images.unsplash.com/photo-1523264939339-c89f9dadde2e?w=1000&auto=format&fit=crop&q=80",
    createdAt: "2025-04-12T18:20:00Z",
    reactions: { "✨": ["user-caelum", "user-aeris"], "👑": ["user-sylas"] },
    comments: [],
  },
  {
    id: "post-2",
    authorId: "user-caelum",
    authorName: "Caelum",
    authorAvatar: "https://i.pravatar.cc/150?u=caelum",
    content:
      "Serment du jour : « Par la lumière d'Elennor, je jure loyauté à la reine Dreyna. »",
    createdAt: "2025-04-14T11:02:00Z",
    reactions: { "⚔️": ["user-lyria"], "🌿": ["user-mira", "user-soren"] },
    comments: [],
  },
];

export const INITIAL_LIVES: LiveSession[] = [
  {
    id: "live-1",
    title: "Nuit Étoilée · Ouverture de la cour",
    description:
      "Rituel d'ouverture, chapitre inédit du lore, Q&A avec Dreyna.",
    cover:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&auto=format&fit=crop&q=80",
    startedAt: "2025-04-18T20:00:00Z",
    durationMinutes: 92,
    peakViewers: 4821,
    replay: true,
  },
  {
    id: "live-2",
    title: "Runway · Collection Aube",
    description: "Défilé numérique, tirages au sort et révélations.",
    cover:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&auto=format&fit=crop&q=80",
    startedAt: "2025-03-30T19:30:00Z",
    durationMinutes: 74,
    peakViewers: 3305,
    replay: true,
  },
  {
    id: "live-3",
    title: "Le Conseil de la Cour · Q&A",
    description: "Vos questions, les réponses de la reine.",
    cover:
      "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1600&auto=format&fit=crop&q=80",
    startedAt: "2025-03-10T21:00:00Z",
    durationMinutes: 110,
    peakViewers: 2741,
    replay: true,
  },
];

// Messages de seed du chat : plus de référence à Dreyna ni à la cour
// royale — les bots qui commentent les lives doivent rester neutres
// pour n'importe quel streamer sur la plateforme.
export const SEED_CHAT: ChatMessage[] = [
  {
    id: "msg-1",
    authorId: "user-lyria",
    authorName: "Lyria",
    authorAvatar: "https://i.pravatar.cc/150?u=lyria",
    content: "coucou tout le monde 💫",
    createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
  },
  {
    id: "msg-2",
    authorId: "user-caelum",
    authorName: "Caelum",
    authorAvatar: "https://i.pravatar.cc/150?u=caelum",
    content: "première fois ici, t'es trop stylé",
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "msg-3",
    authorId: "user-thalia",
    authorName: "Thalia",
    authorAvatar: "https://i.pravatar.cc/150?u=thalia",
    content: "f4f ? 🫶",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "msg-4",
    authorId: "user-aeris",
    authorName: "Aëris",
    authorAvatar: "https://i.pravatar.cc/150?u=aeris",
    content: "gg 🔥",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
];

// Phrases d'ambiance réinjectées aléatoirement dans le chat live.
// Volontairement génériques (type réseau social) : aucune mention
// d'un streamer en particulier, ni de "reine" / "cour" / "royaume",
// pour que l'ambiance soit crédible quel que soit le user qui streame.
export const AUTO_CHAT_LINES = [
  "coucou",
  "hey 👋",
  "f4f ?",
  "gg 🔥",
  "💎💎💎",
  "wow",
  "t'es trop stylé",
  "on follow ?",
  "première fois ici",
  "salut tout le monde",
  "trop bonne ambiance",
  "stream de malade",
  "👑",
  "🫶",
  "let's gooo",
  "je reste jusqu'à la fin",
];

export const TOP_FANS = [
  { name: "Lyria", score: 12893, avatar: "https://i.pravatar.cc/150?u=lyria" },
  { name: "Caelum", score: 11022, avatar: "https://i.pravatar.cc/150?u=caelum" },
  { name: "Aëris", score: 9870, avatar: "https://i.pravatar.cc/150?u=aeris" },
  { name: "Sylas", score: 8761, avatar: "https://i.pravatar.cc/150?u=sylas" },
  { name: "Thalia", score: 8102, avatar: "https://i.pravatar.cc/150?u=thalia" },
];

export const EASTER_EGG_HINTS = [
  "On dit que trois clics sur la couronne ouvrent une porte secrète...",
  "La console connaît peut-être un serment oublié.",
  "↑ ↑ ↓ ↓ ← → ← → B A. Certaines magies sont universelles.",
];

/**
 * Catalogue de cadeaux Sylvins envoyables en live. Les prix sont en Sylvins ;
 * le streamer reçoit l'intégralité du montant, la conversion en € se fait
 * au retrait (voir `src/lib/sylvins.ts`).
 */
export const GIFT_CATALOGUE: Gift[] = [
  {
    id: "gift-brindille",
    name: "Brindille",
    price: 5,
    icon: "/gifts/brindille.svg",
    rarity: "commun",
    description: "Un éclat de forêt pour dire merci.",
  },
  {
    id: "gift-chandelle",
    name: "Chandelle",
    price: 10,
    icon: "/gifts/chandelle.svg",
    rarity: "commun",
    description: "Une flamme discrète pour le streamer.",
  },
  {
    id: "gift-fleur",
    name: "Fleur d'Eledwyn",
    price: 25,
    icon: "/gifts/fleur.svg",
    rarity: "rare",
    description: "Une fleur d'argent, symbole de fidélité.",
  },
  {
    id: "gift-epee",
    name: "Épée courte",
    price: 50,
    icon: "/gifts/epee.svg",
    rarity: "rare",
    description: "Lame d'argent, pour saluer la garde.",
  },
  {
    id: "gift-eclat",
    name: "Éclat cristallin",
    price: 100,
    icon: "/gifts/eclat.svg",
    rarity: "epique",
    description: "Un cristal d'émeraude pour honorer.",
  },
  {
    id: "gift-couronne",
    name: "Couronne mineure",
    price: 250,
    icon: "/gifts/couronne.svg",
    rarity: "epique",
    description: "Titre honorifique éphémère pour le streamer.",
  },
  {
    id: "gift-licorne",
    name: "Licorne d'argent",
    price: 500,
    icon: "/gifts/licorne.svg",
    rarity: "legendaire",
    description: "Galop mystique à travers le stream.",
  },
  {
    id: "gift-dragon",
    name: "Dragon émeraude",
    price: 1000,
    icon: "/gifts/dragon.svg",
    rarity: "legendaire",
    description: "Le dragon ancestral descend sur ta cour.",
  },
  {
    id: "gift-chateau",
    name: "Château de Vaelyndra",
    price: 5000,
    icon: "/gifts/chateau.svg",
    rarity: "mythique",
    description: "Offre un fief au streamer pour une nuit.",
  },
  {
    id: "gift-etoile",
    name: "Étoile d'Elennor",
    price: 10000,
    icon: "/gifts/etoile.svg",
    rarity: "mythique",
    description: "La relique ultime — la cour s'incline.",
  },
];
