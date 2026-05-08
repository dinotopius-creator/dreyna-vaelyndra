/**
 * Sons procéduraux joués lorsqu'un cadeau arrive sur le live, générés
 * via Web Audio API (pas d'asset audio à charger). Chaque rareté a sa
 * propre sonorité pour qu'un cadeau commun (Brindille) soit discret et
 * qu'un cadeau mythique (Étoile d'Elennor) résonne comme une trompette
 * de cour.
 *
 * Toutes les fonctions sont des no-ops si :
 *  - On est côté serveur (`window` undefined).
 *  - L'AudioContext est suspendu (politique d'autoplay du navigateur,
 *    avant interaction utilisateur). Aucune erreur, juste silence.
 *  - L'utilisateur a explicitement coupé le son (cf. `setGiftSoundsEnabled`).
 */
import type { GiftRarity } from "../types";

let cachedCtx: AudioContext | null = null;
let enabled = true;

const STORAGE_KEY = "vaelyndra:giftSounds:enabled";

if (typeof window !== "undefined") {
  // Restore preference; default true.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") enabled = false;
  } catch {
    // localStorage indisponible (Safari privé) → on garde `enabled = true`.
  }
}

export function setGiftSoundsEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export function getGiftSoundsEnabled(): boolean {
  return enabled;
}

function getCtx(): AudioContext | null {
  if (!enabled) return null;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (cachedCtx) return cachedCtx;
  try {
    cachedCtx = new Ctor();
  } catch {
    return null;
  }
  return cachedCtx;
}

/**
 * Joue une note simple à `freq` Hz pendant `durationMs` ms, avec un
 * petit fondu d'attaque/release pour éviter les "clics".
 */
function blip(
  ctx: AudioContext,
  freq: number,
  startOffsetMs: number,
  durationMs: number,
  type: OscillatorType,
  peakGain: number,
) {
  const start = ctx.currentTime + startOffsetMs / 1000;
  const stop = start + durationMs / 1000;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  // Attack ~20ms, release ~80ms (dans la durée totale).
  const attackEnd = Math.min(start + 0.02, stop);
  const releaseStart = Math.max(stop - 0.08, attackEnd);
  gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
  gain.gain.setValueAtTime(peakGain, releaseStart);
  gain.gain.linearRampToValueAtTime(0, stop);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(stop + 0.05);
}

/**
 * Joue le son associé à la rareté du cadeau. Appelé par la page Live
 * sur réception d'un `LiveGiftEvent` (sender ou viewer).
 */
export function playGiftSound(rarity: GiftRarity) {
  const ctx = getCtx();
  if (!ctx) return;
  // Politique autoplay : il faut un resume() sur premier geste user.
  // On tente, si ça échoue silencieusement on n'aura pas de son tant
  // que l'user n'a pas interagi avec la page. C'est OK : le visuel
  // continue à fonctionner.
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  switch (rarity) {
    case "commun": {
      // Petit "ding" cristallin discret.
      blip(ctx, 880, 0, 180, "sine", 0.08);
      break;
    }
    case "rare": {
      // Glissando de 2 notes (clochette → carillon).
      blip(ctx, 988, 0, 180, "triangle", 0.1);
      blip(ctx, 1318, 120, 220, "triangle", 0.09);
      break;
    }
    case "epique": {
      // Arpège ascendant 3 notes (do-mi-sol majeur).
      blip(ctx, 523, 0, 180, "triangle", 0.11);
      blip(ctx, 659, 130, 180, "triangle", 0.11);
      blip(ctx, 784, 260, 280, "triangle", 0.13);
      break;
    }
    case "legendaire": {
      // Fanfare 4 notes + basse soutenue (gong).
      blip(ctx, 130, 0, 700, "sine", 0.16);
      blip(ctx, 523, 0, 200, "sawtooth", 0.06);
      blip(ctx, 659, 180, 220, "sawtooth", 0.07);
      blip(ctx, 784, 380, 240, "sawtooth", 0.08);
      blip(ctx, 1046, 600, 380, "sawtooth", 0.09);
      break;
    }
    case "mythique": {
      // Trompettes royales : fanfare double + gong + harmoniques.
      blip(ctx, 87, 0, 1200, "sine", 0.18); // F2 grave (fond)
      blip(ctx, 392, 0, 250, "square", 0.07); // G4
      blip(ctx, 523, 220, 250, "square", 0.08); // C5
      blip(ctx, 659, 440, 250, "square", 0.09); // E5
      blip(ctx, 784, 660, 320, "square", 0.1); // G5
      blip(ctx, 1046, 880, 600, "square", 0.12); // C6 (apothéose)
      blip(ctx, 1568, 880, 600, "triangle", 0.06); // G6 harmonique
      break;
    }
  }
}
