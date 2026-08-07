let cachedCtx: AudioContext | null = null;
let enabled = true;
let lastPlayedAt = 0;

const STORAGE_KEY = "vaelyndra:notificationSounds:enabled";
const COOLDOWN_MS = 1800;

if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") enabled = false;
  } catch {
    /* ignore storage failures */
  }
}

export function setNotificationSoundsEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getNotificationSoundsEnabled() {
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
  const attackEnd = Math.min(start + 0.015, stop);
  const releaseStart = Math.max(stop - 0.06, attackEnd);
  gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
  gain.gain.setValueAtTime(peakGain, releaseStart);
  gain.gain.linearRampToValueAtTime(0, stop);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(stop + 0.03);
}

export function playNotificationSound() {
  const now = Date.now();
  if (now - lastPlayedAt < COOLDOWN_MS) return;
  const ctx = getCtx();
  if (!ctx) return;
  lastPlayedAt = now;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  blip(ctx, 1175, 0, 130, "triangle", 0.05);
  blip(ctx, 1568, 90, 170, "triangle", 0.045);
}
