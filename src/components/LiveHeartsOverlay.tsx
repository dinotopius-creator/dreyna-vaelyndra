/**
 * Pluie de cœurs flottants avec regroupement "combo".
 *
 * Chaque `burst` envoyé par le parent fait monter une rafale de cœurs
 * depuis la position `x` (en %). Pour éviter le spam texte dans le
 * chat et l'usine à DOM, on regroupe les clics rapprochés du même
 * émetteur en une seule rafale dont le compteur s'incrémente. Le
 * compteur est affiché au-dessus du cœur tant que la rafale est
 * active.
 *
 * Ce composant est 100% visuel : il ne touche pas au chat et ne push
 * aucune annonce.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { generateId } from "../lib/helpers";

/**
 * Fenêtre de regroupement : deux clics du même émetteur séparés
 * de moins de 1,2 s alimentent la même rafale.
 */
const COMBO_WINDOW_MS = 1200;

/** Durée totale d'une rafale (après quoi elle disparaît). */
const BURST_TTL_MS = 2600;

/** Nombre de particules générées à chaque incrément. */
const PARTICLES_PER_TAP = 3;

interface BurstEvent {
  /** ID logique — une rafale partage le même `emitterId`. */
  emitterId: string;
  /** Position horizontale (0–100). */
  x: number;
}

interface Particle {
  id: string;
  x: number;
  driftX: number;
  hue: string;
  size: number;
}

interface Burst {
  id: string;
  emitterId: string;
  x: number;
  count: number;
  lastTapAt: number;
  particles: Particle[];
}

export interface LiveHeartsHandle {
  push: (event: BurstEvent) => void;
}

interface Props {
  /** Événements de cœur publiés par le parent (séquence append-only). */
  events: BurstEvent[];
}

const HEART_HUES = [
  "text-rose-300 fill-rose-300",
  "text-gold-300 fill-gold-300",
  "text-fuchsia-300 fill-fuchsia-300",
  "text-royal-300 fill-royal-300",
];

export function LiveHeartsOverlay({ events }: Props) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const processedRef = useRef(new Set<BurstEvent>());

  // Ingère chaque nouvel event : si la dernière rafale du même émetteur
  // est encore fraîche, on l'enrichit ; sinon on crée une nouvelle.
  useEffect(() => {
    const fresh = events.filter((e) => !processedRef.current.has(e));
    if (fresh.length === 0) return;
    fresh.forEach((e) => processedRef.current.add(e));
    setBursts((prev) => {
      let next = prev.slice();
      const now = Date.now();
      for (const ev of fresh) {
        const newParticles: Particle[] = Array.from(
          { length: PARTICLES_PER_TAP },
          () => makeParticle(ev.x),
        );
        const idx = next.findIndex(
          (b) =>
            b.emitterId === ev.emitterId &&
            now - b.lastTapAt <= COMBO_WINDOW_MS,
        );
        if (idx >= 0) {
          const b = next[idx];
          next[idx] = {
            ...b,
            count: b.count + 1,
            lastTapAt: now,
            particles: [...b.particles, ...newParticles].slice(-24),
          };
        } else {
          next.push({
            id: generateId("burst"),
            emitterId: ev.emitterId,
            x: ev.x,
            count: 1,
            lastTapAt: now,
            particles: newParticles,
          });
        }
      }
      return next;
    });
  }, [events]);

  // Nettoyage : on retire les rafales périmées (plus d'incrément
  // depuis BURST_TTL_MS).
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - BURST_TTL_MS;
      setBursts((prev) => prev.filter((b) => b.lastTapAt >= cutoff));
    }, 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {bursts.flatMap((b) =>
          b.particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: -260 - Math.random() * 80,
                x: p.driftX,
                scale: [0.5, 1.1, 1, 0.9],
                rotate: p.driftX > 0 ? 12 : -12,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: "easeOut" }}
              style={{ left: `${p.x}%`, fontSize: p.size }}
              className={`absolute bottom-8 ${p.hue}`}
            >
              <Heart className="h-6 w-6" />
            </motion.span>
          )),
        )}
      </AnimatePresence>
      <AnimatePresence>
        {bursts
          .filter((b) => b.count > 1)
          .map((b) => (
            <motion.div
              key={`combo-${b.id}`}
              initial={{ opacity: 0, y: 0, scale: 0.8 }}
              animate={{ opacity: 1, y: -30, scale: 1 }}
              exit={{ opacity: 0, y: -60 }}
              transition={{ duration: 0.35 }}
              style={{ left: `${b.x}%` }}
              className="pointer-events-none absolute bottom-24 -translate-x-1/2 rounded-full bg-night-900/70 px-3 py-1 text-xs font-semibold text-gold-200 backdrop-blur"
            >
              combo × {b.count}
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

function makeParticle(xBase: number): Particle {
  const drift = (Math.random() - 0.5) * 120;
  return {
    id: generateId("heart"),
    x: Math.max(2, Math.min(98, xBase + (Math.random() - 0.5) * 8)),
    driftX: drift,
    hue: HEART_HUES[Math.floor(Math.random() * HEART_HUES.length)],
    size: 14 + Math.random() * 10,
  };
}
