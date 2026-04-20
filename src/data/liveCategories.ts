/**
 * Catégories de live proposées au broadcaster au lancement d'un stream.
 *
 * Le choix est stocké dans `LiveConfig.category` + répliqué dans l'entrée
 * `LiveRegistryEntry.category` du registre public. Il permet aux viewers
 * de comprendre en un coup d'œil de quoi traite un live (fil communauté,
 * page `/live/:id`) et de filtrer l'affichage dans le hub.
 *
 * `id` est la clé technique (stable, stockée), `label` est ce qu'on montre
 * à l'écran, `description` guide le choix dans le picker, `icon` est un
 * emoji court pour le badge (volontairement typé string plutôt que
 * composant pour rester sérialisable dans le registre localStorage), et
 * `color` est le teinte Tailwind utilisée pour le badge.
 */

export type LiveCategoryId =
  | "just-chatting"
  | "gaming"
  | "guests"
  | "community";

export interface LiveCategoryMeta {
  id: LiveCategoryId;
  label: string;
  description: string;
  icon: string;
  /** Classes Tailwind pour le badge (bordure + fond + texte). */
  chipClass: string;
}

export const LIVE_CATEGORIES: LiveCategoryMeta[] = [
  {
    id: "just-chatting",
    label: "Just Chatting",
    description: "Discussion libre avec les viewers, pas de support particulier.",
    icon: "💬",
    chipClass: "border-sky-400/50 bg-sky-500/15 text-sky-100",
  },
  {
    id: "gaming",
    label: "Gaming",
    description: "Je joue à un jeu en direct, les viewers me regardent jouer.",
    icon: "🎮",
    chipClass: "border-violet-400/50 bg-violet-500/15 text-violet-100",
  },
  {
    id: "guests",
    label: "Live Invités",
    description:
      "Ouverture de la scène : je fais monter des viewers pour discuter avec moi.",
    icon: "🎤",
    chipClass: "border-rose-400/50 bg-rose-500/15 text-rose-100",
  },
  {
    id: "community",
    label: "Communauté",
    description: "Échanges centrés sur la communauté : FAQ, annonces, bilans.",
    icon: "🌿",
    chipClass: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  },
];

export const DEFAULT_LIVE_CATEGORY: LiveCategoryId = "just-chatting";

const CATEGORY_INDEX: Record<LiveCategoryId, LiveCategoryMeta> =
  LIVE_CATEGORIES.reduce(
    (acc, c) => {
      acc[c.id] = c;
      return acc;
    },
    {} as Record<LiveCategoryId, LiveCategoryMeta>,
  );

export function getLiveCategory(id: string | undefined | null): LiveCategoryMeta {
  if (id && id in CATEGORY_INDEX) return CATEGORY_INDEX[id as LiveCategoryId];
  return CATEGORY_INDEX[DEFAULT_LIVE_CATEGORY];
}

/**
 * Normalise une valeur arbitraire (localStorage, réseau) vers un id valide,
 * en tombant sur la catégorie par défaut si la valeur n'est pas reconnue.
 * On évite ainsi qu'un champ pollué casse le rendu ou propage un id inconnu.
 */
export function normalizeLiveCategory(value: unknown): LiveCategoryId {
  if (typeof value !== "string") return DEFAULT_LIVE_CATEGORY;
  if (value in CATEGORY_INDEX) return value as LiveCategoryId;
  return DEFAULT_LIVE_CATEGORY;
}
