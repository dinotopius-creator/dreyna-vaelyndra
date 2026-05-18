/**
 * État persisté de la "scène" du live : positions, rotations, miroir et
 * verrouillage de l'avatar 3D et du familier du broadcaster pendant un
 * direct.
 *
 * - Stockage : `localStorage` sous `vaelyndra_live_stage_v1`, dictionnaire
 *   keyé par `broadcasterId`. On préfère localStorage à un endpoint
 *   backend pour démarrer simple — les positions sont une préférence UX,
 *   pas une donnée critique. Une persistance serveur pourra venir plus
 *   tard sans casser ce format.
 * - Format coordonnées : `x` et `y` sont normalisés sur `[0..1]` par
 *   rapport au container du stage (le `<div>` qui héberge le `<video>`
 *   du live). Ça garantit qu'un déplacement enregistré sur desktop reste
 *   raisonnable en portrait mobile (même si on borne à nouveau au moment
 *   du rendu pour éviter qu'un sprite sorte de l'écran).
 *
 * Demande client (Alexandre, 20/04) : intégrer l'avatar 3D **existant**
 * dans le live (ne pas recréer un nouveau système d'avatar), positionner
 * librement avatar + familier, sauvegarder automatiquement.
 */

export type StageRotation = 0 | 90 | 180 | 270;

export interface LiveStageSpriteState {
  /** Position normalisée du **centre** du sprite : 0..1. */
  x: number;
  y: number;
  rotation: StageRotation;
  mirror: boolean;
  locked: boolean;
}

export interface LiveStageState {
  /** Désactivable côté host pour cacher uniquement l'avatar. */
  avatarVisible: boolean;
  avatar: LiveStageSpriteState;
  familiar: LiveStageSpriteState;
}

const STORAGE_KEY = "vaelyndra_live_stage_v1";

/** Positions par défaut : familier en bas-gauche, avatar juste à sa droite. */
export const DEFAULT_LIVE_STAGE: LiveStageState = {
  avatarVisible: true,
  avatar: {
    x: 0.22,
    y: 0.86,
    rotation: 0,
    mirror: false,
    locked: false,
  },
  familiar: {
    x: 0.08,
    y: 0.88,
    rotation: 0,
    mirror: false,
    locked: false,
  },
};

function isSprite(value: unknown): value is LiveStageSpriteState {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const okRot =
    obj.rotation === 0 ||
    obj.rotation === 90 ||
    obj.rotation === 180 ||
    obj.rotation === 270;
  return (
    typeof obj.x === "number" &&
    typeof obj.y === "number" &&
    okRot &&
    typeof obj.mirror === "boolean" &&
    typeof obj.locked === "boolean"
  );
}

function isStage(value: unknown): value is LiveStageState {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.avatarVisible === "boolean" &&
    isSprite(obj.avatar) &&
    isSprite(obj.familiar)
  );
}

/** Lit l'état stage d'un broadcaster ou renvoie le défaut. */
export function loadLiveStage(broadcasterId: string): LiveStageState {
  if (typeof window === "undefined") return { ...DEFAULT_LIVE_STAGE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIVE_STAGE };
    const all = JSON.parse(raw) as Record<string, unknown>;
    const entry = all?.[broadcasterId];
    if (isStage(entry)) return entry;
    return { ...DEFAULT_LIVE_STAGE };
  } catch {
    return { ...DEFAULT_LIVE_STAGE };
  }
}

/** Persiste l'état stage d'un broadcaster ; silencieux si quota plein. */
export function saveLiveStage(broadcasterId: string, state: LiveStageState) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    all[broadcasterId] = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota / mode privé — pas critique, l'overlay reste fonctionnel.
  }
}

/**
 * Lit la préférence "activer l'avatar 3D dans le live" du host courant.
 * Persiste séparément des positions pour qu'on puisse choisir d'utiliser
 * l'avatar **avant** de lancer son premier live.
 */
const PREF_KEY = "vaelyndra_live_avatar3d_enabled_v1";

export function loadAvatar3DEnabled(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return false;
    const all = JSON.parse(raw) as Record<string, unknown>;
    return all?.[userId] === true;
  } catch {
    return false;
  }
}

export function saveAvatar3DEnabled(userId: string, enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    all[userId] = enabled;
    window.localStorage.setItem(PREF_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Borne une coordonnée normalisée pour qu'un sprite ne sorte pas du stage. */
export function clampNormalized(value: number, margin = 0.04): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < margin) return margin;
  if (value > 1 - margin) return 1 - margin;
  return value;
}

/** Tourne d'un quart à droite (90° horaire). */
export function rotateRight(r: StageRotation): StageRotation {
  return (((r + 90) % 360) as StageRotation);
}

/** Tourne d'un quart à gauche (90° anti-horaire). */
export function rotateLeft(r: StageRotation): StageRotation {
  return (((r + 270) % 360) as StageRotation);
}
