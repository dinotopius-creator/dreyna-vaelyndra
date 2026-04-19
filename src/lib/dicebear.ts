/**
 * Client léger pour l'API publique DiceBear (9.x).
 *
 * On construit des URLs SVG déterministes à partir d'un style, d'un seed
 * et d'options. Aucune dépendance npm — on stocke juste l'URL complète
 * dans `avatarUrl` côté backend, et l'avatar est rendu via un simple
 * `<img>` partout où on l'affiche (navbar, profil, posts, lives).
 *
 * Catalogue : https://www.dicebear.com/styles/
 * API       : https://api.dicebear.com/9.x/{style}/svg?...
 *
 * Chaque style DiceBear a son propre set d'options. Pour garder l'UI
 * simple et robuste, on n'expose que quelques palettes communes
 * (couleurs de fond + seed + accessoires). Les utilisateurs obtiennent
 * plusieurs milliers de combinaisons par style grâce à la variation de
 * seed.
 */

export const DICEBEAR_API = "https://api.dicebear.com/9.x";

/** Identifie de façon fiable une URL DiceBear (tout `api.dicebear.com/9.x/...`). */
export function isDicebearUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith(DICEBEAR_API);
}

/**
 * Détecte les URLs images plates (SVG, PNG, JPG, DiceBear…) par opposition
 * aux GLB 3D. Sert à décider quel rendu utiliser dans AvatarViewer.
 */
export function isFlatImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isDicebearUrl(url)) return true;
  const lower = url.toLowerCase().split("?")[0];
  return (
    lower.endsWith(".svg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

/** Un style proposé dans l'atelier avec son thème et un exemple de seed. */
export interface DicebearStyle {
  /** Identifiant exact de la collection DiceBear (slug d'URL). */
  id: string;
  /** Nom affiché dans l'UI. */
  label: string;
  /** Phrase courte pour guider l'utilisateur. */
  tagline: string;
  /** Seed suggéré pour le thumbnail du sélecteur. */
  previewSeed: string;
}

/** Sélection curée de styles DiceBear qui collent à l'esthétique Vaelyndra. */
export const STYLES: DicebearStyle[] = [
  {
    id: "adventurer",
    label: "Aventurier·e",
    tagline: "Elfe cartoon taillé·e pour l'aventure.",
    previewSeed: "Dreyna",
  },
  {
    id: "lorelei",
    label: "Lorelei",
    tagline: "Portrait illustré, doux et élégant.",
    previewSeed: "Lyria",
  },
  {
    id: "notionists",
    label: "Archiviste",
    tagline: "Trait à la plume, noble et studieux.",
    previewSeed: "Sylvaire",
  },
  {
    id: "personas",
    label: "Persona",
    tagline: "Silhouettes modernes, vives et colorées.",
    previewSeed: "Caelum",
  },
  {
    id: "big-smile",
    label: "Sourire doré",
    tagline: "Visages radieux, parfaits pour les lives.",
    previewSeed: "Elara",
  },
  {
    id: "open-peeps",
    label: "Peeps",
    tagline: "Illustration main levée, très vivante.",
    previewSeed: "Orin",
  },
];

/**
 * Palette de fonds communs à tous les styles (DiceBear accepte une liste
 * de couleurs hex — il en pioche une à partir du seed). On fixe une seule
 * couleur pour forcer l'uniformité avec le reste de l'interface.
 */
export const BACKGROUND_SWATCHES: { id: string; label: string; hex: string }[] =
  [
    { id: "night", label: "Nuit", hex: "0a0a16" },
    { id: "plum", label: "Améthyste", hex: "4c1d95" },
    { id: "forest", label: "Forêt", hex: "064e3b" },
    { id: "rose", label: "Rose elfique", hex: "9d174d" },
    { id: "dawn", label: "Aube", hex: "fbbf24" },
    { id: "mist", label: "Brume", hex: "bae6fd" },
  ];

/** Configuration d'un avatar — état stocké localement pendant l'édition. */
export interface DicebearConfig {
  style: string;
  seed: string;
  backgroundColor: string; // hex sans '#'
}

export const DEFAULT_CONFIG: Omit<DicebearConfig, "seed"> = {
  style: "adventurer",
  backgroundColor: BACKGROUND_SWATCHES[0].hex,
};

/**
 * Construit l'URL DiceBear SVG correspondant à une configuration. On
 * force le fond (sinon certains styles sont transparents et mal lisibles
 * sur les cards Vaelyndra).
 */
export function buildDicebearUrl(config: DicebearConfig): string {
  const params = new URLSearchParams({
    seed: config.seed,
    backgroundColor: config.backgroundColor,
  });
  return `${DICEBEAR_API}/${config.style}/svg?${params.toString()}`;
}

/**
 * Lit une URL DiceBear existante pour reconstruire sa config (utile pour
 * pré-remplir l'éditeur avec l'avatar actuel de l'utilisateur).
 */
export function parseDicebearUrl(url: string | null | undefined): DicebearConfig | null {
  if (!isDicebearUrl(url ?? "")) return null;
  try {
    const parsed = new URL(url as string);
    // Path shape: /9.x/{style}/svg
    const parts = parsed.pathname.split("/").filter(Boolean);
    const style = parts[1];
    const seed = parsed.searchParams.get("seed") ?? "Dreyna";
    const backgroundColor =
      parsed.searchParams.get("backgroundColor") ?? BACKGROUND_SWATCHES[0].hex;
    if (!style) return null;
    return { style, seed, backgroundColor };
  } catch {
    return null;
  }
}

/**
 * Génère un seed pseudo-aléatoire lisible (facile à retrouver dans les
 * logs, les URLs, etc.). Base 36 = alphanum court.
 */
export function randomSeed(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}
