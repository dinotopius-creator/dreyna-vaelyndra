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

export type ShopCategory = "style" | "background" | "frame";
export type ShopCurrency = "lueurs" | "sylvins";

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
}

/** Slots d'équipement reconnus côté profil. */
export const EQUIP_SLOT = {
  Frame: "frame",
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
