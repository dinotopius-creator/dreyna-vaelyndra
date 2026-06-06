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

const DECOR_CLASSES = {
  sm: {
    hair: "-top-1 text-sm",
    accessory: "text-sm",
    face: "top-[41%] text-[8px] tracking-[0.24em]",
    frameIcon: "-right-0.5 -top-0.5 text-[9px]",
    effect: "-right-0.5 -top-0.5 text-[10px]",
  },
  md: {
    hair: "top-0 text-base",
    accessory: "text-base",
    face: "top-[42%] text-[10px] tracking-[0.28em]",
    frameIcon: "-right-1 -top-1 text-xs",
    effect: "-right-1 -top-1 text-xs",
  },
  lg: {
    hair: "top-1 text-xl",
    accessory: "text-xl",
    face: "top-[43%] text-xs tracking-[0.32em]",
    frameIcon: "-right-1.5 -top-1.5 text-sm",
    effect: "-right-1.5 -top-1.5 text-sm",
  },
};

function getCosmetic(
  familiar: FamiliarLike,
  slot: FamiliarCosmeticSlot,
): FamiliarCosmeticCatalogItem | undefined {
  return familiar.cosmetics?.[slot];
}

function accessoryPosition(accessory?: FamiliarCosmeticCatalogItem) {
  if (!accessory) return "right-[12%] top-[19%]";
  if (accessory.id.includes("couronne")) {
    return "left-1/2 top-[7%] -translate-x-1/2";
  }
  if (accessory.id.includes("collier")) {
    return "left-1/2 bottom-[18%] -translate-x-1/2";
  }
  return "right-[13%] top-[28%]";
}

function accessoryShape(accessory?: FamiliarCosmeticCatalogItem) {
  if (!accessory) return "";
  if (accessory.id.includes("collier")) {
    return "rounded-full border border-current px-2 py-0.5";
  }
  if (accessory.id.includes("couronne")) return "rounded-full px-1";
  return "rounded-full px-1";
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
  const decor = DECOR_CLASSES[size];

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
          <span className={`absolute ${decor.frameIcon}`}>{frame.icon}</span>
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
          className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 ${decor.hair}`}
          style={{
            color: hair.color || color,
            filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 7px ${hair.color || color})`,
          }}
          aria-hidden
        >
          {hair.icon}
        </span>
      )}

      {accessory && (
        <span
          className={`pointer-events-none absolute z-30 ${accessoryPosition(accessory)} ${accessoryShape(accessory)} ${decor.accessory}`}
          style={{
            color: accessory.color || color,
            background:
              accessory.id.includes("collier") || accessory.id.includes("couronne")
                ? "rgba(2,6,23,0.45)"
                : "transparent",
            filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 7px ${accessory.color || color})`,
          }}
          aria-hidden
        >
          {accessory.icon}
        </span>
      )}

      <span
        className="relative z-10 select-none"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        aria-hidden
      >
        {familiar.icon}
      </span>

      {face && (
        <span
          className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-night-950/55 px-1.5 font-black leading-none text-gold-50 shadow-[0_1px_8px_rgba(0,0,0,0.45)] ${decor.face}`}
          style={{
            color: face.color || "#fff7d6",
            textShadow: "0 1px 4px rgba(0,0,0,0.75)",
          }}
          aria-hidden
        >
          {face.icon}
        </span>
      )}

      {(effect || affinity >= 22) && (
        <motion.span
          className={`pointer-events-none absolute z-40 ${decor.effect}`}
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
