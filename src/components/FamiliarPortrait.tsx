import { motion } from "framer-motion";
import type {
  FamiliarCosmeticCatalogItem,
  FamiliarCosmeticSlot,
  OwnedFamiliar,
} from "../lib/familiarsApi";

type FamiliarLike = Pick<
  OwnedFamiliar,
  "icon" | "color" | "stats" | "cosmetics" | "name" | "nickname"
>;

interface FamiliarPortraitProps {
  familiar: FamiliarLike;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  showFrame?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-16 w-16 text-3xl",
  md: "h-24 w-24 text-5xl",
  lg: "h-32 w-32 text-7xl",
};

function getCosmetic(
  familiar: FamiliarLike,
  slot: FamiliarCosmeticSlot,
): FamiliarCosmeticCatalogItem | undefined {
  return familiar.cosmetics?.[slot];
}

export function FamiliarPortrait({
  familiar,
  size = "sm",
  animated = true,
  showFrame = true,
  className = "",
}: FamiliarPortraitProps) {
  const aura = familiar.stats?.aura ?? 18;
  const charisma = familiar.stats?.charisma ?? 16;
  const affinity = familiar.stats?.affinity ?? 0;
  const color = familiar.color || "#f8d477";
  const frame = getCosmetic(familiar, "frame");
  const face = getCosmetic(familiar, "face");
  const hair = getCosmetic(familiar, "hair");
  const accessory = getCosmetic(familiar, "accessory");
  const effect = getCosmetic(familiar, "effect");

  const haloPx = 18 + Math.round((aura / 99) * 30);
  const haloAlpha = Math.min(0.85, 0.25 + aura / 200);
  const ringOpacity = Math.min(0.8, charisma / 140);
  const frameColor = showFrame ? frame?.color || color : color;

  return (
    <motion.div
      className={`relative flex shrink-0 items-center justify-center overflow-visible rounded-3xl border ${SIZE_CLASSES[size]} ${className}`}
      style={{
        background: `radial-gradient(circle at 50% 40%, ${color}${Math.round(haloAlpha * 80).toString(16).padStart(2, "0")}, ${color}11 60%, transparent)`,
        borderColor: `${frameColor}66`,
        boxShadow: `0 0 ${haloPx}px -8px ${color}`,
      }}
      animate={animated ? { y: [0, -4, 0] } : undefined}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      aria-label={familiar.nickname || familiar.name}
    >
      {showFrame && frame && (
        <span
          className="pointer-events-none absolute inset-[-7px] rounded-[2rem] border"
          style={{
            borderColor: `${frameColor}cc`,
            boxShadow: `0 0 22px -8px ${frameColor}`,
          }}
          aria-hidden
        >
          <span className="absolute -right-1 -top-1 text-xs">{frame.icon}</span>
        </span>
      )}

      {ringOpacity > 0.05 && (
        <motion.span
          className="pointer-events-none absolute inset-[-6px] rounded-3xl"
          style={{
            border: `1px solid ${effect?.color || color}`,
            opacity: effect ? 0.9 : ringOpacity,
          }}
          animate={{ scale: [1, 1.06, 1], opacity: [ringOpacity, ringOpacity * 0.45, ringOpacity] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      )}

      {hair && (
        <span
          className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-lg"
          style={{
            color: hair.color || color,
            filter: `drop-shadow(0 0 7px ${hair.color || color})`,
          }}
          aria-hidden
        >
          {hair.icon}
        </span>
      )}

      {accessory && (
        <span
          className="pointer-events-none absolute -right-2 top-2 text-lg"
          style={{
            color: accessory.color || color,
            filter: `drop-shadow(0 0 7px ${accessory.color || color})`,
          }}
          aria-hidden
        >
          {accessory.icon}
        </span>
      )}

      <span style={{ filter: `drop-shadow(0 0 10px ${color})` }} aria-hidden>
        {familiar.icon}
      </span>

      {face && face.id !== "face-doux" && (
        <span
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-night-950/70 px-1.5 text-[10px] text-gold-100"
          aria-hidden
        >
          {face.icon}
        </span>
      )}

      {(effect || affinity >= 22) && (
        <motion.span
          className="pointer-events-none absolute -right-1 -top-1 text-xs"
          style={{
            color: effect?.color || color,
            filter: `drop-shadow(0 0 4px ${effect?.color || color})`,
          }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          {effect?.icon || "✦"}
        </motion.span>
      )}
    </motion.div>
  );
}
