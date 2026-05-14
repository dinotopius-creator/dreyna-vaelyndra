/**
 * Overlay du familier du broadcaster pendant un live (PR familiers#5).
 *
 * Affiche un sticker animé du familier actif du streamer en bas-gauche
 * du player. Le sticker flotte idle (subtil), puis a une réaction
 * "burst" à chaque event :
 *   - cadeau reçu  → saut + jet de particules de la couleur du familier
 *   - nouveau cœur → micro-rebond
 *
 * Toujours visible chez tous les viewers + chez le host (lit le même
 * flux que GiftFlight via le DataChannel WebRTC, cf. LiveContext).
 *
 * Volontairement très léger côté perf : on ne rend que quand il y a
 * une réaction active, on limite les particules, et on ne tape jamais
 * le DOM hors des AnimatePresence concernés.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EVOLUTION_TIERS,
  fetchUserFamiliars,
  type OwnedFamiliar,
} from "../lib/familiarsApi";

interface LiveFamiliarOverlayProps {
  broadcasterId: string;
  /**
   * Compteur monotone incrémenté à chaque cadeau reçu sur le live
   * courant. Sert de "tick" : changer la valeur déclenche un burst,
   * sans tirer la dépendance complète aux événements de cadeau.
   */
  giftTick: number;
  /** Couleur dominante du dernier cadeau, pour teinter le burst. */
  lastGiftColor?: string | null;
  /** Petit rebond sur cœur reçu (compteur monotone). */
  heartTick?: number;
}

interface Particle {
  id: string;
  dx: number;
  dy: number;
  emoji: string;
}

const REACTION_EMOJIS = ["✨", "💫", "🌟", "⭐", "💖", "🪶", "🔮"];

export function LiveFamiliarOverlay({
  broadcasterId,
  giftTick,
  lastGiftColor,
  heartTick,
}: LiveFamiliarOverlayProps) {
  const [familiar, setFamiliar] = useState<OwnedFamiliar | null>(null);
  const [reactionKey, setReactionKey] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const lastGiftSeen = useRef(giftTick);
  const lastHeartSeen = useRef(heartTick ?? 0);

  useEffect(() => {
    let cancelled = false;
    fetchUserFamiliars(broadcasterId)
      .then((col) => {
        if (cancelled) return;
        const active =
          col.owned.find((f) => f.familiarId === col.activeFamiliarId) ?? null;
        setFamiliar(active);
      })
      .catch(() => {
        if (!cancelled) setFamiliar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [broadcasterId]);

  // Burst sur cadeau reçu : rebond + jet de 6 particules.
  useEffect(() => {
    if (!familiar) return;
    if (giftTick === lastGiftSeen.current) return;
    lastGiftSeen.current = giftTick;
    setReactionKey((k) => k + 1);
    const tint = lastGiftColor ?? familiar.color;
    const now = Date.now();
    const next: Particle[] = Array.from({ length: 6 }).map((_, i) => ({
      id: `${now}-${i}`,
      dx: (i - 2.5) * 18 + (Math.random() - 0.5) * 12,
      dy: -60 - Math.random() * 30,
      emoji:
        REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)],
    }));
    setParticles((p) => [...p, ...next]);
    const toClean = next.map((n) => n.id);
    const t = window.setTimeout(() => {
      setParticles((p) => p.filter((x) => !toClean.includes(x.id)));
    }, 1400);
    // tint is read inline through CSS; keep ref alive for next burst
    void tint;
    return () => window.clearTimeout(t);
  }, [giftTick, familiar, lastGiftColor]);

  // Petit rebond sur cœur (sans particules pour rester discret).
  useEffect(() => {
    if (!familiar) return;
    if (heartTick === undefined) return;
    if (heartTick === lastHeartSeen.current) return;
    lastHeartSeen.current = heartTick;
    setReactionKey((k) => k + 1);
  }, [heartTick, familiar]);

  const evolution = useMemo(
    () => (familiar ? EVOLUTION_TIERS[familiar.evolution.id] ?? null : null),
    [familiar],
  );

  if (!familiar) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-end gap-2"
      aria-hidden
    >
      <div className="relative h-16 w-16 sm:h-20 sm:w-20">
        <motion.div
          key={reactionKey}
          className="absolute inset-0 flex items-center justify-center rounded-full text-3xl sm:text-4xl"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${familiar.color}44, ${familiar.color}11 60%, transparent)`,
            boxShadow: `0 0 24px -4px ${familiar.color}`,
            border: `1px solid ${familiar.color}55`,
          }}
          initial={{ scale: 0.85 }}
          animate={{
            scale: [1, 1.25, 0.95, 1],
            rotate: [0, -8, 6, 0],
            y: [0, -6, 2, 0],
          }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <motion.span
            style={{ filter: `drop-shadow(0 0 8px ${familiar.color})` }}
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {familiar.icon}
          </motion.span>
        </motion.div>

        <AnimatePresence>
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base sm:text-lg"
              style={{ filter: `drop-shadow(0 0 4px ${lastGiftColor ?? familiar.color})` }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
              animate={{
                opacity: [0, 1, 0],
                x: p.dx,
                y: p.dy,
                scale: [0.6, 1.1, 0.9],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.3, ease: "easeOut" }}
            >
              {p.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="hidden flex-col text-[10px] uppercase tracking-widest text-ivory/80 sm:flex">
        <span className="font-semibold text-ivory">
          {familiar.nickname ?? familiar.name}
        </span>
        <span className="text-ivory/60">
          {evolution?.emoji ?? "✨"} Niv {familiar.level}
        </span>
      </div>
    </div>
  );
}
