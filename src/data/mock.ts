import type {
  Article,
  Badge,
  ChatMessage,
  CommunityPost,
  LiveSession,
  Product,
} from "../types";

export const DREYNA_PROFILE = {
  id: "user-dreyna",
  username: "Dreyna",
  email: "dreyna@vaelyndra.realm",
  avatar:
    "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&auto=format&fit=crop&q=80",
  role: "queen" as const,
  joinedAt: "2021-03-21T00:00:00Z",
  bio:
    "Reine des elfes du royaume de Vaelyndra. Gardienne de la Lumière d'Elennor, tisseuse de récits, créatrice ZEPETO.",
  titles: [
    "Reine des Elfes de Vaelyndra",
    "Gardienne de la Lumière d'Elennor",
    "Porteuse de la Couronne d'Aube",
  ],
  stats: {
    followers: 482_193,
    likes: 3_214_807,
    articles: 42,
    lives: 128,
    communityMembers: 57_932,
  },
  gallery: [
    "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1519810755548-39cd217da494?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1447433693459-3074a3216296?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?w=1200&auto=format&fit=crop&q=80",
  ],
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
    id: "zepeto",
    name: "Créatrice ZEPETO Verified",
    description: "Créatrice officielle, reconnue du royaume numérique.",
    icon: "💠",
    rarity: "rare",
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
    slug: "nouvelle-collection-zepeto-aube",
    title: "La collection ZEPETO « Aube d'Elennor » est arrivée",
    excerpt:
      "Une collection entière inspirée des robes de lune et des armures de feuillage argenté.",
    content:
      "Cette saison, j'ai imaginé une collection en trois actes : **Aube**, **Crépuscule**, **Nocturne**. Chaque pièce porte la marque d'un sort elfique que j'ai rêvé des semaines durant.\n\nLes items exclusifs sont disponibles dès maintenant dans la Boutique Royale — certains ne reviendront jamais.",
    category: "IRL / ZEPETO",
    cover:
      "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=1600&auto=format&fit=crop&q=80",
    author: "Dreyna",
    createdAt: "2025-04-02T15:00:00Z",
    readingTime: 3,
    tags: ["zepeto", "collection", "mode"],
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
    name: "Pack ZEPETO · Elennor",
    tagline: "Tenue numérique exclusive",
    description:
      "Tenue, coiffe et accessoires animés pour votre avatar ZEPETO, signés Dreyna.",
    price: 19,
    currency: "€",
    image:
      "https://images.unsplash.com/photo-1520975867597-0af37a22e31e?w=900&auto=format&fit=crop&q=80",
    category: "Digital",
    rating: 4.7,
    stock: 500,
    tags: ["digital", "zepeto"],
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
    title: "ZEPETO Runway · Collection Aube",
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

export const SEED_CHAT: ChatMessage[] = [
  {
    id: "msg-1",
    authorId: "user-lyria",
    authorName: "Lyria",
    authorAvatar: "https://i.pravatar.cc/150?u=lyria",
    content: "✨ La reine est entrée, longue vie à Vaelyndra !",
    createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
  },
  {
    id: "msg-2",
    authorId: "user-caelum",
    authorName: "Caelum",
    authorAvatar: "https://i.pravatar.cc/150?u=caelum",
    content: "Je sens déjà la brume magique d'ici 🌫️",
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "msg-3",
    authorId: "user-dreyna",
    authorName: "Dreyna",
    authorAvatar: DREYNA_PROFILE.avatar,
    content: "Bienvenue, peuple elfe 👑 La cour est ouverte.",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    highlight: true,
  },
  {
    id: "msg-4",
    authorId: "user-aeris",
    authorName: "Aëris",
    authorAvatar: "https://i.pravatar.cc/150?u=aeris",
    content: "🌙 Incroyable de te voir ce soir Dreyna 💜",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
];

export const AUTO_CHAT_LINES = [
  "✨ Longue vie à la reine",
  "👑 On t'aime Dreyna",
  "🌙 La nuit elfique tombe sur Vaelyndra",
  "💜 Le royaume brille ce soir",
  "🧝‍♀️ Coucou de Bretagne",
  "🌿 Serment du sylvaris prêté",
  "🎶 Quelle ambiance",
  "💫 J'attends la prochaine collection",
  "⚔️ Pour Vaelyndra !",
  "🌠 Dreyna, tu es magique",
  "🔮 Les runes scintillent",
  "🕯️ Bougie allumée pour le rituel",
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
