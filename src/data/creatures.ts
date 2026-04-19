/**
 * Catalogue figé des 9 créatures de Vaelyndra (miroir du backend).
 *
 * On garde une copie côté front pour pouvoir afficher la grille de
 * sélection à l'inscription sans attendre un round-trip réseau — et pour
 * rendre les badges (`🐉 Dragon`) même si l'API est temporairement HS.
 *
 * Vérité : `backend/app/creatures.py`. Si tu modifies la liste, modifie
 * les deux fichiers.
 */
import type { Creature } from "../types";

export const CREATURES: Creature[] = [
  {
    id: "elfe",
    name: "Elfe",
    icon: "🧝",
    color: "#9ae6a4",
    description:
      "Gracieux·se, ancien·ne, gardien·ne de la forêt et des étoiles.",
  },
  {
    id: "demon",
    name: "Démon",
    icon: "😈",
    color: "#ef4444",
    description: "Né·e du feu intérieur, rapide et flamboyant·e.",
  },
  {
    id: "humain",
    name: "Humain",
    icon: "🧑",
    color: "#f3c97b",
    description: "Curieux·se et adaptable, pont entre les mondes.",
  },
  {
    id: "dragon",
    name: "Dragon",
    icon: "🐉",
    color: "#d14a4a",
    description: "Écailles ancestrales, souffle de tempête et de braise.",
  },
  {
    id: "esprit",
    name: "Esprit",
    icon: "👻",
    color: "#c4b5fd",
    description: "Murmure entre deux plans, insaisissable et libre.",
  },
  {
    id: "gardien",
    name: "Gardien",
    icon: "🛡️",
    color: "#60a5fa",
    description: "Protecteur·rice des lieux sacrés, loyal·e jusqu'au bout.",
  },
  {
    id: "alien",
    name: "Alien",
    icon: "👽",
    color: "#34d399",
    description: "Venu·e d'une étoile lointaine, regard neuf sur Vaelyndra.",
  },
  {
    id: "fee",
    name: "Fée",
    icon: "🧚",
    color: "#f0abfc",
    description:
      "Poussière d'ailes et farces enchantées, amie de la lumière.",
  },
  {
    id: "sirene",
    name: "Sirène",
    icon: "🧜",
    color: "#22d3ee",
    description: "Chant d'écume, enfant des marées et des profondeurs.",
  },
];

export const CREATURES_BY_ID: Record<string, Creature> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);

export function getCreature(id: string | undefined | null): Creature | null {
  if (!id) return null;
  return CREATURES_BY_ID[id] ?? null;
}
