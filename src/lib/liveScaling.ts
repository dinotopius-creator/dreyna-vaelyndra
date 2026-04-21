/**
 * Paramètres "pseudo-viewers" et cadence du chat bot en fonction du grade
 * du streamer. Source de vérité pour le rendu du HUD live — ne pas dupliquer
 * ces valeurs ailleurs (elles existent uniquement côté front, le backend ne
 * fait pas autorité sur les fake viewers).
 *
 * Objectif UX (validé par Alexandre) :
 *  - Un Novice des Brumes qui lance son tout premier live voit un petit
 *    nombre réaliste (3-8) plutôt qu'un 1200+ fixe qui sonne faux.
 *  - Plus le streamer monte en grade, plus l'ambiance ressemble à un vrai
 *    live avec un public — y compris une cadence de chat plus rapide.
 *  - Les bots ne doivent **jamais** spammer : l'intervalle minimum reste
 *    confortable (4 s pour Légende) et croît fort pour les petits grades
 *    (~60-90 s pour BRM).
 */
import type { GradeSlug } from "../data/grades";

export interface ViewerScale {
  /** Plancher de la fourchette (nombre de viewers fake minimum). */
  min: number;
  /** Plafond de la fourchette (nombre de viewers fake maximum). */
  max: number;
  /** Intervalle (ms) entre deux mises à jour de la jauge. */
  intervalMs: number;
  /** Delta maximal par tick (±). Scalé pour que la jauge bouge
   *  proportionnellement à l'audience : un live Légende bouge de ±30
   *  d'un coup, un live Novice bouge de ±1. */
  jitter: number;
}

export interface BotCadence {
  /** Intervalle min (ms) entre deux messages bot — protège contre le spam. */
  minMs: number;
  /** Intervalle max (ms) — définit la cadence "calme". */
  maxMs: number;
}

const DEFAULT_VIEWER_SCALE: ViewerScale = {
  min: 3,
  max: 8,
  intervalMs: 7000,
  jitter: 1,
};

const DEFAULT_BOT_CADENCE: BotCadence = {
  minMs: 60_000,
  maxMs: 90_000,
};

/** Fourchettes de viewers fake par grade, validées avec Alexandre. */
const VIEWER_SCALES: Record<GradeSlug, ViewerScale> = {
  "novice-brumes": { min: 3, max: 8, intervalMs: 7000, jitter: 1 },
  "apprenti-sentiers": { min: 10, max: 25, intervalMs: 6000, jitter: 2 },
  "gardien-flux": { min: 30, max: 70, intervalMs: 5000, jitter: 4 },
  "arcaniste-eveille": { min: 80, max: 200, intervalMs: 4000, jitter: 8 },
  "elite-regent": { min: 300, max: 800, intervalMs: 3000, jitter: 20 },
  "legende-vaelyndra": { min: 1500, max: 3500, intervalMs: 2500, jitter: 30 },
};

/** Cadence du chat bot par grade (plus haut grade = chat plus vivant). */
const BOT_CADENCES: Record<GradeSlug, BotCadence> = {
  "novice-brumes": { minMs: 60_000, maxMs: 90_000 },
  "apprenti-sentiers": { minMs: 40_000, maxMs: 60_000 },
  "gardien-flux": { minMs: 25_000, maxMs: 40_000 },
  "arcaniste-eveille": { minMs: 15_000, maxMs: 25_000 },
  "elite-regent": { minMs: 8_000, maxMs: 15_000 },
  "legende-vaelyndra": { minMs: 4_000, maxMs: 8_000 },
};

function isKnownSlug(slug: string | null | undefined): slug is GradeSlug {
  return !!slug && slug in VIEWER_SCALES;
}

export function getViewerScale(slug: string | null | undefined): ViewerScale {
  return isKnownSlug(slug) ? VIEWER_SCALES[slug] : DEFAULT_VIEWER_SCALE;
}

export function getBotCadence(slug: string | null | undefined): BotCadence {
  return isKnownSlug(slug) ? BOT_CADENCES[slug] : DEFAULT_BOT_CADENCE;
}

/** Seed initial pour le compteur : valeur aléatoire dans la fourchette basse
 *  (tiers bas de [min, max]) — permet que la jauge "monte" naturellement au
 *  début du live plutôt que de démarrer au max.
 */
export function pickInitialViewers(scale: ViewerScale): number {
  const lowCeiling = scale.min + Math.round((scale.max - scale.min) * 0.33);
  const lo = scale.min;
  const hi = Math.max(scale.min, lowCeiling);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Applique un tick aléatoire borné à la valeur courante, en gardant
 *  le résultat dans [min, max]. Léger biais +0.1 en moyenne pour que le
 *  compteur tende à monter (les gens arrivent plus vite qu'ils partent).
 */
export function nextViewerValue(
  current: number,
  scale: ViewerScale,
): number {
  const drift = (Math.random() - 0.4) * 2 * scale.jitter;
  const next = Math.round(current + drift);
  if (next < scale.min) return scale.min;
  if (next > scale.max) return scale.max;
  return next;
}

/** Tirage aléatoire dans [min, max] pour le prochain message bot. */
export function pickNextBotDelay(cadence: BotCadence): number {
  return (
    cadence.minMs + Math.floor(Math.random() * (cadence.maxMs - cadence.minMs))
  );
}
