/**
 * Catalogue boutique avatar — items cosmétiques achetables avec les bourses
 * internes (Lueurs / Sylvins), par opposition à la boutique marchande
 * (packs Sylvins payés en €).
 *
 * Trois familles :
 *
 * 1. **Styles** — débloque un style DiceBear supplémentaire pour
 *    l'atelier. L'id correspond à la collection DiceBear officielle
 *    (https://www.dicebear.com/styles). Les 6 styles gratuits de base
 *    sont déjà disponibles sans achat (cf. `dicebear.ts`).
 *
 * 2. **Fonds** — une couleur de fond hex supplémentaire pour l'atelier.
 *    Stockée comme hex sans `#`, passée directement à DiceBear.
 *
 * 3. **Parures** — un overlay SVG (emoji / cadre décoratif) rendu par
 *    `AvatarViewer` au-dessus de l'avatar quand équipé. Parfait pour
 *    les cadeaux premium (couronne, ailes, halo…).
 *
 * L'inventaire utilisateur (`profile.inventory: string[]`) stocke
 * simplement les ids d'items possédés. L'équipement
 * (`profile.equipped: Record<slot, itemId>`) stocke les items actifs
 * par slot. Un seul item peut être équipé par slot.
 */

export type ShopCategory =
  | "style"
  | "background"
  | "frame"
  | "scene"
  | "outfit3d"
  | "accessory3d";
export type ShopCurrency = "lueurs" | "sylvins";

/**
 * Identifiants de scènes animées reconnus. Chaque scène correspond à un
 * rendu CSS dédié dans `AvatarViewer` (dégradés animés, lucioles…).
 * Ajouter un id ici nécessite aussi d'ajouter le rendu visuel côté
 * `AvatarViewer` (sinon la scène apparaîtra vide à l'équipement).
 */
export type SceneId =
  | "cosmos"
  | "forest-glow"
  | "sunrise"
  | "ocean"
  | "aurora"
  | "flames";

export interface ShopItem {
  id: string;
  category: ShopCategory;
  name: string;
  description: string;
  /** Icône emoji ou glyph pour la card boutique. */
  icon: string;
  currency: ShopCurrency;
  price: number;
  /** Pour les styles : slug DiceBear. */
  styleId?: string;
  /** Pour les fonds : hex sans `#`. */
  backgroundHex?: string;
  /**
   * Pour les parures : emoji overlay affiché en haut à droite de
   * l'avatar. On stocke aussi un id court utilisable comme classe CSS.
   */
  frameGlyph?: string;
  /**
   * Pour les scènes animées : id reconnu par `AvatarViewer` pour
   * sélectionner un rendu de fond dédié (dégradé animé, particules…).
   */
  sceneId?: SceneId;
  /** Pour les wearables 3D : identifiant de thème exploité par AvatarViewer. */
  wearableThemeId?: string;
  /** Sous-famille d’item pour l’UI boutique/inventaire. */
  wearableFamily?: string;
}

/** Slots d'équipement reconnus côté profil. */
export const EQUIP_SLOT = {
  Frame: "frame",
  Scene: "scene",
  Outfit3D: "outfit3d",
  Accessory3D: "accessory3d",
} as const;

/**
 * Catalogue officiel de la boutique avatar. L'ordre d'apparition sur la
 * page est celui de ce tableau.
 */
export const SHOP_CATALOG: ShopItem[] = [
  // --- Styles supplémentaires (débloquables en Lueurs) ---------------
  {
    id: "style-pixel-art",
    category: "style",
    name: "Pixel-Art",
    description: "Rendu 8 bits rétro, parfait pour les lives arcade.",
    icon: "🕹️",
    currency: "lueurs",
    price: 120,
    styleId: "pixel-art",
  },
  {
    id: "style-bottts-neutral",
    category: "style",
    name: "Automates",
    description: "Robots mascottes, un poil steampunk.",
    icon: "🤖",
    currency: "lueurs",
    price: 120,
    styleId: "bottts-neutral",
  },
  {
    id: "style-avataaars",
    category: "style",
    name: "Modernes",
    description: "Style avataaars, portraits très sociaux.",
    icon: "👤",
    currency: "lueurs",
    price: 180,
    styleId: "avataaars",
  },
  {
    id: "style-dylan",
    category: "style",
    name: "Dylan",
    description: "Trait doux et minimal, tout en courbes.",
    icon: "🎐",
    currency: "sylvins",
    price: 30,
    styleId: "dylan",
  },
  {
    id: "style-thumbs",
    category: "style",
    name: "Pouces royaux",
    description: "Figurines drôles style emoji aplati.",
    icon: "👍",
    currency: "sylvins",
    price: 30,
    styleId: "thumbs",
  },
  {
    id: "style-micah",
    category: "style",
    name: "Micah",
    description: "Portraits flat design, très épurés.",
    icon: "🎨",
    currency: "lueurs",
    price: 140,
    styleId: "micah",
  },
  {
    id: "style-miniavs",
    category: "style",
    name: "Miniavs",
    description: "Micro-avatars stylés façon badge.",
    icon: "🔖",
    currency: "lueurs",
    price: 140,
    styleId: "miniavs",
  },
  {
    id: "style-croodles",
    category: "style",
    name: "Croodles",
    description: "Doodles joueurs dessinés à la main.",
    icon: "✏️",
    currency: "lueurs",
    price: 160,
    styleId: "croodles",
  },
  {
    id: "style-fun-emoji",
    category: "style",
    name: "Fun emoji",
    description: "Grandes bouilles expressives pour le live.",
    icon: "😄",
    currency: "lueurs",
    price: 160,
    styleId: "fun-emoji",
  },
  {
    id: "style-big-ears",
    category: "style",
    name: "Grandes oreilles",
    description: "Trait elfique cartoon avec de jolies oreilles.",
    icon: "🧝",
    currency: "sylvins",
    price: 40,
    styleId: "big-ears",
  },
  {
    id: "style-avataaars-neutral",
    category: "style",
    name: "Modernes neutres",
    description: "Avataaars sans genre marqué, plus flexible.",
    icon: "🫥",
    currency: "sylvins",
    price: 40,
    styleId: "avataaars-neutral",
  },
  {
    id: "style-lorelei-neutral",
    category: "style",
    name: "Lorelei neutre",
    description: "Même illustration que Lorelei, cheveux courts.",
    icon: "🎭",
    currency: "sylvins",
    price: 40,
    styleId: "lorelei-neutral",
  },
  {
    id: "style-adventurer-neutral",
    category: "style",
    name: "Aventurier neutre",
    description: "Variante plus sobre du style Aventurier.",
    icon: "🗺️",
    currency: "sylvins",
    price: 40,
    styleId: "adventurer-neutral",
  },
  // --- Fonds premium (Lueurs / Sylvins) ------------------------------
  {
    id: "bg-royal-gold",
    category: "background",
    name: "Or royal",
    description: "Fond doré chaud pour les portraits officiels.",
    icon: "👑",
    currency: "lueurs",
    price: 60,
    backgroundHex: "b45309",
  },
  {
    id: "bg-emerald",
    category: "background",
    name: "Émeraude",
    description: "Vert profond, l'écho des forêts de Vaelyndra.",
    icon: "🌲",
    currency: "lueurs",
    price: 60,
    backgroundHex: "065f46",
  },
  {
    id: "bg-violet-nebula",
    category: "background",
    name: "Nébuleuse",
    description: "Violet cosmique, pour les reines des étoiles.",
    icon: "🌌",
    currency: "sylvins",
    price: 20,
    backgroundHex: "6d28d9",
  },
  {
    id: "bg-crimson",
    category: "background",
    name: "Écarlate",
    description: "Rouge sang-royal, rare et remarqué.",
    icon: "🍷",
    currency: "sylvins",
    price: 20,
    backgroundHex: "b91c1c",
  },
  {
    id: "bg-aurora",
    category: "background",
    name: "Aurore",
    description: "Turquoise glacé, éclats d'aurore boréale.",
    icon: "🧊",
    currency: "lueurs",
    price: 80,
    backgroundHex: "0ea5e9",
  },
  {
    id: "bg-midnight",
    category: "background",
    name: "Minuit",
    description: "Bleu d'encre profond, nuit sans lune.",
    icon: "🌙",
    currency: "lueurs",
    price: 80,
    backgroundHex: "1e1b4b",
  },
  {
    id: "bg-moss",
    category: "background",
    name: "Mousse elfique",
    description: "Vert mousse doux, sous-bois de Vaelyndra.",
    icon: "🍃",
    currency: "lueurs",
    price: 60,
    backgroundHex: "4d7c0f",
  },
  {
    id: "bg-peach",
    category: "background",
    name: "Pêche d'été",
    description: "Rose pêché, parfait pour les portraits vifs.",
    icon: "🍑",
    currency: "lueurs",
    price: 60,
    backgroundHex: "fb7185",
  },
  {
    id: "bg-obsidian",
    category: "background",
    name: "Obsidienne",
    description: "Noir pur, fait ressortir les cadres dorés.",
    icon: "🖤",
    currency: "sylvins",
    price: 25,
    backgroundHex: "0f172a",
  },
  {
    id: "bg-ivory",
    category: "background",
    name: "Ivoire royal",
    description: "Fond blanc chaud, portraits officiels.",
    icon: "🤍",
    currency: "sylvins",
    price: 25,
    backgroundHex: "fef3c7",
  },
  {
    id: "bg-saphir",
    category: "background",
    name: "Saphir",
    description: "Bleu profond du saphir brut.",
    icon: "💙",
    currency: "sylvins",
    price: 30,
    backgroundHex: "1d4ed8",
  },
  {
    id: "bg-amethyst",
    category: "background",
    name: "Améthyste royale",
    description: "Violet cristallin, plus intense que la nébuleuse.",
    icon: "💜",
    currency: "sylvins",
    price: 30,
    backgroundHex: "7e22ce",
  },
  // --- Scènes animées (fond CSS illustré, pas un hex statique) -------
  {
    id: "scene-cosmos",
    category: "scene",
    name: "Nébuleuse cosmique",
    description: "Dégradé radial violet→rose qui pulse doucement.",
    icon: "🌌",
    currency: "sylvins",
    price: 60,
    sceneId: "cosmos",
  },
  {
    id: "scene-forest-glow",
    category: "scene",
    name: "Clairière enchantée",
    description: "Halo vert-émeraude avec lucioles animées.",
    icon: "🌿",
    currency: "sylvins",
    price: 60,
    sceneId: "forest-glow",
  },
  {
    id: "scene-sunrise",
    category: "scene",
    name: "Aube d'or",
    description: "Lever de soleil doré-orangé, très chaleureux.",
    icon: "🌅",
    currency: "sylvins",
    price: 80,
    sceneId: "sunrise",
  },
  {
    id: "scene-ocean",
    category: "scene",
    name: "Courants marins",
    description: "Bleu turquoise animé par des ondes lumineuses.",
    icon: "🌊",
    currency: "sylvins",
    price: 80,
    sceneId: "ocean",
  },
  {
    id: "scene-aurora",
    category: "scene",
    name: "Voile d'aurore",
    description: "Aurores boréales dansantes vert-violet.",
    icon: "✨",
    currency: "sylvins",
    price: 120,
    sceneId: "aurora",
  },
  {
    id: "scene-flames",
    category: "scene",
    name: "Flammes de la cour",
    description: "Flammes bleues stylisées au second plan.",
    icon: "🔥",
    currency: "sylvins",
    price: 120,
    sceneId: "flames",
  },
  // --- Parures (overlays) -------------------------------------------
  {
    id: "frame-crown",
    category: "frame",
    name: "Couronne d'or",
    description: "Un diadème discret posé sur votre avatar.",
    icon: "👑",
    currency: "sylvins",
    price: 50,
    frameGlyph: "👑",
  },
  {
    id: "frame-wings",
    category: "frame",
    name: "Ailes d'elfe",
    description: "De grandes ailes irisées en surimpression.",
    icon: "🦋",
    currency: "sylvins",
    price: 80,
    frameGlyph: "🦋",
  },
  {
    id: "frame-halo",
    category: "frame",
    name: "Halo sacré",
    description: "Un halo doré tournoyant — aura de noblesse.",
    icon: "✨",
    currency: "sylvins",
    price: 120,
    frameGlyph: "✨",
  },
  {
    id: "frame-flame",
    category: "frame",
    name: "Flamme ardente",
    description: "Une flamme bleu-roi qui envoûte votre portrait.",
    icon: "🔥",
    currency: "sylvins",
    price: 150,
    frameGlyph: "🔥",
  },
  {
    id: "frame-dragon",
    category: "frame",
    name: "Dragon totem",
    description: "Un petit dragon fidèle qui veille sur votre avatar.",
    icon: "🐉",
    currency: "sylvins",
    price: 300,
    frameGlyph: "🐉",
  },
  {
    id: "frame-star",
    category: "frame",
    name: "Étoile filante",
    description: "Une étoile éclatante — parfait pour les débuts de live.",
    icon: "⭐",
    currency: "lueurs",
    price: 80,
    frameGlyph: "⭐",
  },
  {
    id: "frame-moon",
    category: "frame",
    name: "Lune d'argent",
    description: "Un croissant qui veille discrètement.",
    icon: "🌙",
    currency: "lueurs",
    price: 90,
    frameGlyph: "🌙",
  },
  {
    id: "frame-leaf",
    category: "frame",
    name: "Feuille sacrée",
    description: "Feuille d'érable elfique, naturelle et douce.",
    icon: "🍁",
    currency: "lueurs",
    price: 70,
    frameGlyph: "🍁",
  },
  {
    id: "frame-sparkles",
    category: "frame",
    name: "Étincelles",
    description: "Une volée d'étincelles magiques.",
    icon: "✨",
    currency: "lueurs",
    price: 100,
    frameGlyph: "💫",
  },
  {
    id: "frame-heart",
    category: "frame",
    name: "Cœur d'améthyste",
    description: "Un cœur violet, pour les cœurs d'appel.",
    icon: "💜",
    currency: "sylvins",
    price: 40,
    frameGlyph: "💜",
  },
  {
    id: "frame-unicorn",
    category: "frame",
    name: "Licorne",
    description: "Compagnon mystique rare.",
    icon: "🦄",
    currency: "sylvins",
    price: 200,
    frameGlyph: "🦄",
  },
  {
    id: "frame-phoenix",
    category: "frame",
    name: "Phénix",
    description: "L'oiseau de feu — couronne de prestige.",
    icon: "🦅",
    currency: "sylvins",
    price: 400,
    frameGlyph: "🦅",
  },
  // --- Tenues 3D ----------------------------------------------------
  {
    id: "outfit3d-royal",
    category: "outfit3d",
    name: "Tenue royale",
    description: "Corsage noble et étoffes de cour pour les apparitions officielles.",
    icon: "👗",
    currency: "lueurs",
    price: 180,
    wearableThemeId: "royal",
  },
  {
    id: "outfit3d-battle",
    category: "outfit3d",
    name: "Veste de bataille",
    description: "Silhouette plus vive, épaules renforcées et accents dorés.",
    icon: "🛡️",
    currency: "sylvins",
    price: 90,
    wearableThemeId: "battle",
  },
  {
    id: "outfit3d-mystic",
    category: "outfit3d",
    name: "Robe mystique",
    description: "Grande robe arcane pour un profil 3D plus cérémoniel.",
    icon: "🔮",
    currency: "sylvins",
    price: 120,
    wearableThemeId: "mystic",
  },
  {
    id: "outfit3d-shadow",
    category: "outfit3d",
    name: "Armure d’ombre",
    description: "Palette sombre, élégante et plus tranchante.",
    icon: "🖤",
    currency: "sylvins",
    price: 140,
    wearableThemeId: "shadow",
  },
  // --- Accessoires 3D ----------------------------------------------
  {
    id: "accessory3d-crown",
    category: "accessory3d",
    name: "Couronne sculptée",
    description: "Couronne 3D portée directement sur la tête.",
    icon: "👑",
    currency: "sylvins",
    price: 110,
    wearableThemeId: "crown",
    wearableFamily: "Couronnes",
  },
  {
    id: "accessory3d-halo",
    category: "accessory3d",
    name: "Halo solaire",
    description: "Halo flottant au-dessus de la tête, visible à 360°.",
    icon: "☀️",
    currency: "sylvins",
    price: 140,
    wearableThemeId: "halo",
    wearableFamily: "Halos",
  },
  {
    id: "accessory3d-horns",
    category: "accessory3d",
    name: "Cornes draconiques",
    description: "Ornement cornu pour un profil plus féroce.",
    icon: "🐉",
    currency: "sylvins",
    price: 170,
    wearableThemeId: "horns",
    wearableFamily: "Cornes",
  },
  {
    id: "accessory3d-elf-ears",
    category: "accessory3d",
    name: "Oreilles d’elfe",
    description: "Longues oreilles fines visibles de face comme de profil.",
    icon: "🧝",
    currency: "sylvins",
    price: 95,
    wearableThemeId: "elf-ears",
    wearableFamily: "Oreilles",
  },
  {
    id: "accessory3d-fae-ears",
    category: "accessory3d",
    name: "Oreilles féeriques",
    description: "Version plus courte et plus douce, très lumineuse.",
    icon: "🪽",
    currency: "lueurs",
    price: 180,
    wearableThemeId: "fae-ears",
    wearableFamily: "Oreilles",
  },
  {
    id: "accessory3d-antlers",
    category: "accessory3d",
    name: "Bois sacrés",
    description: "Ramures mystiques pour une présence sylvestre.",
    icon: "🦌",
    currency: "sylvins",
    price: 180,
    wearableThemeId: "antlers",
    wearableFamily: "Bois",
  },
  {
    id: "accessory3d-circlet",
    category: "accessory3d",
    name: "Diadème lunaire",
    description: "Fin cercle frontal serti d’un éclat céleste.",
    icon: "🌙",
    currency: "sylvins",
    price: 120,
    wearableThemeId: "circlet",
    wearableFamily: "Couronnes",
  },
  {
    id: "accessory3d-gem",
    category: "accessory3d",
    name: "Gemme frontale",
    description: "Cristal suspendu au centre du visage, très mystique.",
    icon: "🔷",
    currency: "sylvins",
    price: 130,
    wearableThemeId: "gem",
    wearableFamily: "Ornements",
  },
];

/** Accès par id (utilisé par AvatarViewer pour résoudre un slot équipé). */
export const CATALOG_BY_ID: Record<string, ShopItem> = Object.fromEntries(
  SHOP_CATALOG.map((item) => [item.id, item]),
);

/** Renvoie l'item équipé dans un slot donné, s'il existe. */
export function getEquipped(
  equipped: Record<string, string> | undefined,
  slot: string,
): ShopItem | null {
  if (!equipped) return null;
  const id = equipped[slot];
  if (!id) return null;
  return CATALOG_BY_ID[id] ?? null;
}

/**
 * Construit la liste de styles DiceBear offerts à un utilisateur pour
 * l'atelier : styles gratuits par défaut + styles débloqués dans son
 * inventaire. Garantit l'unicité.
 */
export function getUnlockedStyleIds(
  inventory: string[] | undefined,
  freeStyleIds: readonly string[],
): string[] {
  const owned = new Set<string>(freeStyleIds);
  if (inventory) {
    for (const id of inventory) {
      const item = CATALOG_BY_ID[id];
      if (item?.category === "style" && item.styleId) owned.add(item.styleId);
    }
  }
  return [...owned];
}

/**
 * Pareil pour les fonds : hex gratuits + hex achetés.
 */
export function getUnlockedBackgrounds(
  inventory: string[] | undefined,
  freeHexes: readonly string[],
): string[] {
  const owned = new Set<string>(freeHexes);
  if (inventory) {
    for (const id of inventory) {
      const item = CATALOG_BY_ID[id];
      if (item?.category === "background" && item.backgroundHex)
        owned.add(item.backgroundHex);
    }
  }
  return [...owned];
}
