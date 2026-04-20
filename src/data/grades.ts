/**
 * Miroir front des 6 grades spirituels (source de vérité : `backend/app/grades.py`).
 *
 * Utilisé uniquement pour le rendu — la dérivation "quel grade pour quel XP"
 * se fait côté backend et arrive dans `UserProfile.grade` / entrées de
 * classement. Ce fichier sert à :
 *  - Proposer un sélecteur de grade dans l'admin (PR M override)
 *  - Garder les tooltips "x XP pour le prochain grade" cohérents
 *  - Faire match le slug → visuel quand le backend renvoie juste le slug
 *
 * ⚠️ Si tu modifies l'ordre, les seuils ou les slugs, fais-le en miroir
 * avec `backend/app/grades.py`.
 */
export type GradeSlug =
  | "novice-brumes"
  | "apprenti-sentiers"
  | "gardien-flux"
  | "arcaniste-eveille"
  | "elite-regent"
  | "legende-vaelyndra";

export interface Grade {
  slug: GradeSlug;
  name: string;
  emoji: string;
  motto: string;
  theme: string;
  minXp: number;
  color: string;
}

export const GRADES: Grade[] = [
  {
    slug: "novice-brumes",
    name: "Novice des Brumes",
    emoji: "🌱",
    motto: "Les âmes viennent de s'éveiller",
    theme: "Brume magique, énergie instable",
    minXp: 0,
    color: "#7fb77e",
  },
  {
    slug: "apprenti-sentiers",
    name: "Apprenti des Sentiers",
    emoji: "🌿",
    motto: "L'énergie commence à circuler",
    theme: "Forêt vivante, runes simples",
    minXp: 100,
    color: "#4aa37a",
  },
  {
    slug: "gardien-flux",
    name: "Gardien des Flux",
    emoji: "🌙",
    motto: "L'équilibre commence à se stabiliser",
    theme: "Magie lunaire, symboles protecteurs",
    minXp: 500,
    color: "#7aa7d9",
  },
  {
    slug: "arcaniste-eveille",
    name: "Arcaniste Éveillé",
    emoji: "🔥",
    motto: "La magie devient puissance",
    theme: "Flammes mystiques, runes dorées",
    minXp: 2000,
    color: "#e6a84a",
  },
  {
    slug: "elite-regent",
    name: "Élite du Régent",
    emoji: "⚔️",
    motto: "Les piliers du royaume",
    theme: "Armure magique royale",
    minXp: 10000,
    color: "#c87a3a",
  },
  {
    slug: "legende-vaelyndra",
    name: "Légende de Vaelyndra",
    emoji: "👑",
    motto: "Les êtres rares qui façonnent le monde",
    theme: "Aura divine, couronne d'énergie",
    minXp: 50000,
    color: "#e6c274",
  },
];

export function gradeBySlug(slug: string): Grade | undefined {
  return GRADES.find((g) => g.slug === slug);
}

/** Formate un nombre d'XP (ex. 12345 → "12 345"). */
export function formatXp(xp: number): string {
  return xp.toLocaleString("fr-FR");
}

/**
 * Représente le DTO renvoyé par le backend (`StreamerGradeOut`). On expose
 * un type local pour éviter d'éparpiller la shape dans tout le frontend.
 */
export interface StreamerGrade {
  /**
   * Slug du grade. Côté backend c'est toujours une valeur de `GradeSlug`,
   * mais on le laisse `string` ici pour rester compatible avec le DTO
   * `StreamerGradeDto` produit par l'API (qui est pareil structurellement
   * mais typé `string`). Le badge ne fait pas de switch dessus — il consomme
   * directement `emoji`, `name`, `color`, etc.
   */
  slug: string;
  name: string;
  emoji: string;
  motto: string;
  theme: string;
  color: string;
  minXp: number;
  xp: number;
  progressXp: number;
  /** null quand le user est au grade max (Légende). */
  nextXp: number | null;
  /** True quand un admin a forcé le grade (la progression est gelée). */
  override: boolean;
}
