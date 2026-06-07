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
    hair: "top-2 text-sm",
    accessory: "text-sm",
    face: "top-[43%] h-3.5 w-7 gap-1",
    eye: "h-1.5 w-1.5",
    frameIcon: "right-1 top-1 text-[9px]",
    effect: "-right-0.5 -top-0.5 text-[10px]",
  },
  md: {
    hair: "top-3 text-base",
    accessory: "text-base",
    face: "top-[44%] h-[18px] w-9 gap-1.5",
    eye: "h-2 w-2",
    frameIcon: "right-1.5 top-1.5 text-xs",
    effect: "-right-1 -top-1 text-xs",
  },
  lg: {
    hair: "top-4 text-xl",
    accessory: "text-xl",
    face: "top-[45%] h-5 w-11 gap-2",
    eye: "h-2.5 w-2.5",
    frameIcon: "right-2 top-2 text-sm",
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
    return "left-1/2 bottom-[12%] -translate-x-1/2";
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

function eyeStyle(face?: FamiliarCosmeticCatalogItem) {
  if (!face) {
    return {
      className: "rounded-full",
      color: "#fff7d6",
      transform: "",
      shine: true,
    };
  }

  if (face.id.includes("malicieux")) {
    return {
      className: "rounded-full border-t-2 border-current bg-transparent",
      color: face.color || "#fde68a",
      transform: "translateY(1px)",
      shine: false,
    };
  }

  if (face.id.includes("etoile")) {
    return {
      className: "rotate-45 rounded-[2px]",
      color: face.color || "#fef3c7",
      transform: "",
      shine: true,
    };
  }

  if (face.id.includes("royal")) {
    return {
      className: "rotate-45 rounded-[3px]",
      color: face.color || "#f8d477",
      transform: "scaleY(1.08)",
      shine: true,
    };
  }

  return {
    className: "rounded-full",
    color: face.color || "#fff7d6",
    transform: "",
    shine: true,
  };
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
  const eyes = eyeStyle(face);

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
          className={`pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-night-950/50 shadow-[0_2px_10px_rgba(0,0,0,0.48)] backdrop-blur-[1px] ${decor.face}`}
          style={{
            color: eyes.color,
            boxShadow: `0 0 10px -6px ${face.color || color}, inset 0 0 8px rgba(255,255,255,0.08)`,
          }}
          aria-hidden
        >
          {[0, 1].map((index) => (
            <span
              key={index}
              className={`relative block ${decor.eye} ${eyes.className}`}
              style={{
                backgroundColor: eyes.className.includes("bg-transparent")
                  ? "transparent"
                  : eyes.color,
                color: eyes.color,
                transform: eyes.transform,
                boxShadow: eyes.className.includes("bg-transparent")
                  ? "none"
                  : `0 0 8px -2px ${eyes.color}`,
              }}
            >
              {eyes.shine && (
                <span className="absolute left-[18%] top-[18%] h-1/3 w-1/3 rounded-full bg-white/80" />
              )}
            </span>
          ))}
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
