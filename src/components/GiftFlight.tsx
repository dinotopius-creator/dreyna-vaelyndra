import { AnimatePresence, motion } from "framer-motion";
import type { Gift, GiftRarity } from "../types";

export interface GiftFlightItem {
  id: string;
  gift: Gift;
  /** Position horizontale en % (0 = gauche, 100 = droite). */
  x: number;
  /**
   * Pseudo de l'expéditeur, affiché au-dessus du cadeau pendant le vol.
   * Permet à toute la cour de voir QUI vient d'offrir le cadeau.
   */
  senderName?: string;
}

interface Props {
  items: GiftFlightItem[];
}

/**
 * Configuration visuelle par rareté.
 *
 *  - `size`     : taille de l'icône qui décolle (px).
 *  - `rise`     : amplitude verticale du vol.
 *  - `duration` : durée totale en s (un cadeau mythique reste plus longtemps).
 *  - `ringClass`: bague de halo autour de l'icône.
 *  - `glow`     : ombre lumineuse derrière l'icône.
 *  - `burst`    : nombre d'éclats (étincelles) qui jaillissent autour.
 *  - `burstColor` : teinte des étincelles.
 *  - `centerStage` : true → l'effet prend tout l'écran (mythique/légendaire),
 *    false → vol classique sur le côté.
 */
const RARITY_FX: Record<
  GiftRarity,
  {
    size: number;
    rise: number;
    duration: number;
    ringClass: string;
    glow: string;
    burst: number;
    burstColor: string;
    centerStage: boolean;
  }
> = {
  commun: {
    size: 56,
    rise: 240,
    duration: 2.4,
    ringClass: "ring-2 ring-amber-500/40",
    glow: "0 0 24px rgba(217,119,6,0.4)",
    burst: 0,
    burstColor: "#fbbf24",
    centerStage: false,
  },
  rare: {
    size: 72,
    rise: 280,
    duration: 2.8,
    ringClass: "ring-2 ring-slate-200/60",
    glow: "0 0 32px rgba(226,232,240,0.55)",
    burst: 6,
    burstColor: "#e2e8f0",
    centerStage: false,
  },
  epique: {
    size: 88,
    rise: 320,
    duration: 3.2,
    ringClass: "ring-[3px] ring-emerald-300/70",
    glow: "0 0 44px rgba(52,211,153,0.7)",
    burst: 10,
    burstColor: "#34d399",
    centerStage: false,
  },
  legendaire: {
    size: 140,
    rise: 0,
    duration: 4.2,
    ringClass: "ring-4 ring-indigo-300/80",
    glow: "0 0 80px rgba(165,180,252,0.9)",
    burst: 18,
    burstColor: "#a5b4fc",
    centerStage: true,
  },
  mythique: {
    size: 200,
    rise: 0,
    duration: 5.0,
    ringClass: "ring-4 ring-gold-300",
    glow: "0 0 120px rgba(250,204,21,0.95)",
    burst: 28,
    burstColor: "#facc15",
    centerStage: true,
  },
};

/**
 * Affiche les cadeaux qui s'envolent au-dessus de la scène live, avec un
 * effet visuel modulé par la rareté du cadeau :
 *  - commun/rare/épique → vol latéral classique avec halo grandissant.
 *  - légendaire/mythique → "centre stage" : le cadeau prend tout l'écran
 *    avec flash + couronne d'étincelles + scaling massif.
 *
 * Le pseudo de l'expéditeur est superposé pour que tous les viewers
 * voient qui vient d'offrir le cadeau (équivalent du "X vient d'envoyer
 * Y" Twitch / TikTok).
 */
export function GiftFlight({ items }: Props) {
  return (
    <AnimatePresence>
      {items.map((item) => {
        const fx = RARITY_FX[item.gift.rarity];
        if (fx.centerStage) {
          return (
            <CenterStageGift key={item.id} item={item} fx={fx} />
          );
        }
        return <FlyingGift key={item.id} item={item} fx={fx} />;
      })}
    </AnimatePresence>
  );
}

function FlyingGift({
  item,
  fx,
}: {
  item: GiftFlightItem;
  fx: (typeof RARITY_FX)[GiftRarity];
}) {
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 0, scale: 0.5 }}
      animate={{ opacity: 1, y: -fx.rise, scale: 1.15 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fx.duration, ease: "easeOut" }}
      style={{ left: `${item.x}%` }}
      className="pointer-events-none absolute bottom-8 z-20 flex flex-col items-center gap-1"
    >
      <div
        className={`relative rounded-full bg-night-900/40 ${fx.ringClass}`}
        style={{
          width: fx.size,
          height: fx.size,
          boxShadow: fx.glow,
        }}
      >
        <img
          src={item.gift.icon}
          alt=""
          className="h-full w-full rounded-full object-contain p-1"
        />
        {fx.burst > 0 && <SparkleBurst count={fx.burst} color={fx.burstColor} />}
      </div>
      {item.senderName && (
        <span className="rounded-full border border-gold-400/40 bg-night-900/70 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gold-100 backdrop-blur">
          {item.senderName}
        </span>
      )}
    </motion.div>
  );
}

function CenterStageGift({
  item,
  fx,
}: {
  item: GiftFlightItem;
  fx: (typeof RARITY_FX)[GiftRarity];
}) {
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
    >
      {/* Flash plein écran qui s'estompe */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            item.gift.rarity === "mythique"
              ? "radial-gradient(circle at center, rgba(250,204,21,0.35) 0%, transparent 70%)"
              : "radial-gradient(circle at center, rgba(165,180,252,0.30) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.6, 0] }}
        transition={{ duration: fx.duration, ease: "easeOut", times: [0, 0.15, 0.5, 1] }}
      />
      <motion.div
        className="relative flex flex-col items-center gap-3"
        initial={{ scale: 0.2, rotate: -20 }}
        animate={{
          scale: [0.2, 1.4, 1.2, 1.25, 0.9],
          rotate: [-20, 8, -4, 2, 0],
        }}
        transition={{ duration: fx.duration, times: [0, 0.25, 0.55, 0.85, 1] }}
      >
        <div
          className={`relative rounded-full bg-night-900/50 ${fx.ringClass}`}
          style={{
            width: fx.size,
            height: fx.size,
            boxShadow: fx.glow,
          }}
        >
          <img
            src={item.gift.icon}
            alt=""
            className="h-full w-full rounded-full object-contain p-2"
          />
          <SparkleBurst count={fx.burst} color={fx.burstColor} large />
        </div>
        {item.senderName && (
          <div className="flex flex-col items-center gap-1 rounded-2xl border border-gold-400/60 bg-night-900/80 px-4 py-2 backdrop-blur">
            <span className="text-[10px] uppercase tracking-[0.3em] text-gold-300/80">
              {item.gift.rarity === "mythique" ? "Mythique" : "Légendaire"}
            </span>
            <span className="text-base font-semibold text-gold-100">
              {item.senderName}
            </span>
            <span className="text-xs text-ivory/70">offre {item.gift.name}</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Couronne d'étincelles qui jaillissent depuis le centre vers
 * l'extérieur. `count` étincelles disposées en cercle.
 */
function SparkleBurst({
  count,
  color,
  large = false,
}: {
  count: number;
  color: string;
  large?: boolean;
}) {
  const distance = large ? 140 : 70;
  const dotSize = large ? 8 : 5;
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: dotSize,
              height: dotSize,
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}`,
              translateX: "-50%",
              translateY: "-50%",
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 0],
              x: [0, dx],
              y: [0, dy],
              scale: [0.4, 1, 0.6],
            }}
            transition={{ duration: large ? 1.6 : 1.1, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
