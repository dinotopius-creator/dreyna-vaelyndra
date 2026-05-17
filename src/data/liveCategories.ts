/**
 * Categories de live proposees au broadcaster.
 *
 * `id` est la cle technique stockee dans le compte / registre.
 * `label` est affiche dans l'UI live.
 */

export type LiveCategoryId =
  | "just-chatting"
  | "gaming"
  | "live-guests"
  | "community"
  | "music"
  | "creative"
  | "event"
  | "other";

export interface LiveCategoryMeta {
  id: LiveCategoryId;
  label: string;
  description: string;
  icon: string;
  chipClass: string;
}

export const LIVE_CATEGORIES: LiveCategoryMeta[] = [
  {
    id: "just-chatting",
    label: "Just Chatting",
    description:
      "Discussion libre, reactions en direct et moment de scene avec la communaute.",
    icon: "💬",
    chipClass: "border-sky-400/50 bg-sky-500/15 text-sky-100",
  },
  {
    id: "gaming",
    label: "Gaming",
    description:
      "Gameplay, reactions, decouverte de jeux et sessions competitives en direct.",
    icon: "🎮",
    chipClass: "border-violet-400/50 bg-violet-500/15 text-violet-100",
  },
  {
    id: "live-guests",
    label: "Live invite",
    description:
      "Scene ouverte avec invites, viewers sur scene et formats conversationnels a plusieurs.",
    icon: "🎤",
    chipClass: "border-rose-400/50 bg-rose-500/15 text-rose-100",
  },
  {
    id: "community",
    label: "Communaute",
    description:
      "Annonces, FAQ, rencontres et moments reserves a la communaute.",
    icon: "🌿",
    chipClass: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  },
  {
    id: "music",
    label: "Musique",
    description:
      "Sessions musicales, ecoute, composition ou ambiance sonore en direct.",
    icon: "🎵",
    chipClass: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100",
  },
  {
    id: "creative",
    label: "Creatif",
    description:
      "Creation artistique, dessin, design, montage ou fabrication en live.",
    icon: "🎨",
    chipClass: "border-amber-400/50 bg-amber-500/15 text-amber-100",
  },
  {
    id: "event",
    label: "Evenement",
    description:
      "Emission speciale, reveal, concours ou rendez-vous exceptionnel en direct.",
    icon: "✨",
    chipClass: "border-cyan-400/50 bg-cyan-500/15 text-cyan-100",
  },
  {
    id: "other",
    label: "Autre",
    description:
      "Format libre quand le live ne rentre pas dans une categorie classique.",
    icon: "🪄",
    chipClass: "border-slate-300/45 bg-slate-400/10 text-slate-100",
  },
];

export const DEFAULT_LIVE_CATEGORY: LiveCategoryId = "just-chatting";

const CATEGORY_INDEX: Record<LiveCategoryId, LiveCategoryMeta> =
  LIVE_CATEGORIES.reduce(
    (acc, category) => {
      acc[category.id] = category;
      return acc;
    },
    {} as Record<LiveCategoryId, LiveCategoryMeta>,
  );

export function getLiveCategory(id: string | undefined | null): LiveCategoryMeta {
  if (id && id in CATEGORY_INDEX) return CATEGORY_INDEX[id as LiveCategoryId];
  return CATEGORY_INDEX[DEFAULT_LIVE_CATEGORY];
}

export function normalizeLiveCategory(value: unknown): LiveCategoryId {
  if (typeof value !== "string") return DEFAULT_LIVE_CATEGORY;
  if (value in CATEGORY_INDEX) return value as LiveCategoryId;
  return DEFAULT_LIVE_CATEGORY;
}
