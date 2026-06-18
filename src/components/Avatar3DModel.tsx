import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Avatar3DConfig } from "../lib/avatar3d";

export type OutfitTheme =
  | "base"
  | "royal"
  | "battle"
  | "mystic"
  | "shadow"
  | "celestial"
  | "verdant"
  | "ember"
  | "frost"
  | "rose"
  | "oracle"
  | "street"
  | "ceremony"
  | "neon";
export type AccessoryTheme =
  | "crown"
  | "halo"
  | "horns"
  | "elf-ears"
  | "fae-ears"
  | "antlers"
  | "circlet"
  | "gem"
  | "laurel"
  | "moon-crown"
  | "butterfly"
  | "visor"
  | "rose-circlet"
  | "crystal-mask"
  | "sun-halo"
  | "ribbon"
  | "star-tiara"
  | "onyx-horns"
  | null;

interface Props {
  config: Avatar3DConfig;
  size?: "square" | "portrait" | "wide";
  framing?: "face" | "body";
  outfit?: OutfitTheme;
  accessory?: AccessoryTheme;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
}

function shade(hex: string, factor: number) {
  const safe = hex.replace("#", "");
  const value = safe.length === 3
    ? safe
        .split("")
        .map((c) => c + c)
        .join("")
    : safe.padEnd(6, "0");
  const next = [0, 2, 4]
    .map((i) => {
      const channel = parseInt(value.slice(i, i + 2), 16);
      const mixed = Math.max(0, Math.min(255, Math.round(channel * factor)));
      return mixed.toString(16).padStart(2, "0");
    })
    .join("");
  return `#${next}`;
}

function Cuboid({
  width,
  height,
  depth,
  color,
  transform,
  className = "",
  children,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
  transform: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = Math.max(5, Math.min(width, height, depth) * 0.42);
  const premiumFaceShadow =
    "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -10px 20px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.16)";
  const front = { width, height, transform: `translateZ(${depth / 2}px)` };
  const back = {
    width,
    height,
    transform: `rotateY(180deg) translateZ(${depth / 2}px)`,
  };
  const left = {
    width: depth,
    height,
    transform: `rotateY(-90deg) translateZ(${width / 2}px)`,
  };
  const right = {
    width: depth,
    height,
    transform: `rotateY(90deg) translateZ(${width / 2}px)`,
  };
  const top = {
    width,
    height: depth,
    transform: `rotateX(90deg) translateZ(${height / 2}px)`,
  };
  const bottom = {
    width,
    height: depth,
    transform: `rotateX(-90deg) translateZ(${height / 2}px)`,
  };
  const faceBase: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transformStyle: "preserve-3d",
    transformOrigin: "center center",
    marginLeft: 0,
    marginTop: 0,
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: radius,
    boxShadow: premiumFaceShadow,
    boxSizing: "border-box",
  };
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        transformStyle: "preserve-3d",
        transform,
      }}
    >
      <div
        style={{
          ...faceBase,
          ...front,
          marginLeft: -width / 2,
          marginTop: -height / 2,
          background: `linear-gradient(135deg, ${shade(color, 1.16)}, ${color} 52%, ${shade(color, 0.78)})`,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...back,
          marginLeft: -width / 2,
          marginTop: -height / 2,
          background: `linear-gradient(135deg, ${shade(color, 0.82)}, ${shade(color, 0.7)})`,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...left,
          marginLeft: -depth / 2,
          marginTop: -height / 2,
          background: `linear-gradient(135deg, ${shade(color, 0.9)}, ${shade(color, 0.72)})`,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...right,
          marginLeft: -depth / 2,
          marginTop: -height / 2,
          background: `linear-gradient(135deg, ${shade(color, 1.02)}, ${shade(color, 0.8)})`,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...top,
          marginLeft: -width / 2,
          marginTop: -depth / 2,
          background: `linear-gradient(135deg, ${shade(color, 1.2)}, ${shade(color, 0.96)})`,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...bottom,
          marginLeft: -width / 2,
          marginTop: -depth / 2,
          background: shade(color, 0.62),
        }}
      />
      {children}
    </div>
  );
}

function HumanoidPart({
  width,
  height,
  color,
  transform,
  borderRadius = "999px",
  clipPath,
  opacity = 1,
  children,
}: {
  width: number;
  height: number;
  color: string;
  transform: string;
  borderRadius?: string;
  clipPath?: string;
  opacity?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        transform,
        transformStyle: "preserve-3d",
        borderRadius,
        clipPath,
        opacity,
        background: `radial-gradient(circle at 34% 18%, ${shade(color, 1.24)} 0 12%, ${color} 42%, ${shade(color, 0.74)} 100%)`,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow:
          "inset 7px 8px 16px rgba(255,255,255,0.14), inset -10px -14px 24px rgba(0,0,0,0.26), 0 14px 24px rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </div>
  );
}

function CircleGem({
  size,
  color,
  transform,
  glow,
}: {
  size: number;
  color: string;
  transform: string;
  glow?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        transform,
        borderRadius: "999px",
        background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95) 0 12%, ${color} 24%, ${shade(color, 0.7)} 100%)`,
        boxShadow: glow ?? "0 10px 22px rgba(0,0,0,0.22), inset 0 -6px 10px rgba(0,0,0,0.18)",
        border: "1px solid rgba(255,255,255,0.18)",
      }}
    />
  );
}

function PremiumAccessory({
  kind,
  skinTone,
}: {
  kind: AccessoryTheme;
  skinTone: string;
}) {
  if (!kind) return null;
  switch (kind) {
    case "crown":
      return (
        <>
          <CircleGem size={42} color="#d4af37" transform="translate3d(-22px,-124px,8px) rotateZ(-8deg)" />
          <CircleGem size={36} color="#f4cf74" transform="translate3d(0px,-138px,12px)" />
          <CircleGem size={42} color="#d4af37" transform="translate3d(22px,-124px,8px) rotateZ(8deg)" />
        </>
      );
    case "halo":
      return (
        <div
          style={{
            position: "absolute",
            width: 100,
            height: 22,
            left: -50,
            top: -142,
            borderRadius: "999px",
            border: "4px solid rgba(251,238,203,0.95)",
            boxShadow: "0 0 24px rgba(251,238,203,0.56)",
            transform: "rotateX(72deg) translateZ(8px)",
          }}
        />
      );
    case "horns":
    case "onyx-horns":
      return (
        <>
          <HumanoidPart width={14} height={42} color={kind === "onyx-horns" ? "#111827" : "#d4a94a"} transform="translate3d(-28px,-132px,-4px) rotateZ(-20deg)" />
          <HumanoidPart width={14} height={42} color={kind === "onyx-horns" ? "#111827" : "#d4a94a"} transform="translate3d(28px,-132px,-4px) rotateZ(20deg)" />
        </>
      );
    case "elf-ears":
    case "fae-ears":
      return (
        <>
          <HumanoidPart width={10} height={28} color={skinTone} transform="translate3d(-38px,-62px,2px) rotateZ(-26deg)" />
          <HumanoidPart width={10} height={28} color={skinTone} transform="translate3d(38px,-62px,2px) rotateZ(26deg)" />
        </>
      );
    case "antlers":
      return (
        <>
          <HumanoidPart width={12} height={46} color="#8b5e34" transform="translate3d(-28px,-142px,-2px) rotateZ(-14deg)" />
          <HumanoidPart width={12} height={46} color="#8b5e34" transform="translate3d(28px,-142px,-2px) rotateZ(14deg)" />
          <HumanoidPart width={18} height={10} color="#9a6a3d" transform="translate3d(-40px,-154px,0) rotateZ(-28deg)" />
          <HumanoidPart width={18} height={10} color="#9a6a3d" transform="translate3d(40px,-154px,0) rotateZ(28deg)" />
        </>
      );
    case "circlet":
    case "rose-circlet":
    case "moon-crown":
    case "star-tiara":
      return (
        <>
          <HumanoidPart width={66} height={12} color="#f4cf74" transform="translate3d(0,-106px,10px)" />
          <CircleGem size={10} color={kind === "moon-crown" ? "#ddd6fe" : "#fef3c7"} transform="translate3d(0px,-120px,18px)" />
          <CircleGem size={8} color="#f9a8d4" transform="translate3d(-18px,-114px,16px)" />
          <CircleGem size={8} color="#f9a8d4" transform="translate3d(18px,-114px,16px)" />
        </>
      );
    case "gem":
      return (
        <>
          <HumanoidPart width={10} height={18} color="#f4cf74" transform="translate3d(0,-94px,18px)" />
          <CircleGem size={18} color="#60a5fa" transform="translate3d(0px,-80px,24px) rotateZ(45deg)" />
        </>
      );
    case "laurel":
      return (
        <>
          <HumanoidPart width={18} height={10} color="#86efac" transform="translate3d(-24px,-118px,14px) rotateZ(-18deg)" />
          <HumanoidPart width={18} height={10} color="#86efac" transform="translate3d(24px,-118px,14px) rotateZ(18deg)" />
          <HumanoidPart width={14} height={8} color="#4ade80" transform="translate3d(-6px,-122px,12px) rotateZ(-8deg)" />
          <HumanoidPart width={14} height={8} color="#4ade80" transform="translate3d(6px,-122px,12px) rotateZ(8deg)" />
        </>
      );
    case "butterfly":
      return (
        <>
          <CircleGem size={20} color="#f9a8d4" transform="translate3d(-22px,-92px,-22px) rotateZ(-16deg)" />
          <CircleGem size={20} color="#f9a8d4" transform="translate3d(22px,-92px,-22px) rotateZ(16deg)" />
          <CircleGem size={12} color="#fbcfe8" transform="translate3d(0px,-104px,-24px)" />
        </>
      );
    case "visor":
      return (
        <HumanoidPart
          width={62}
          height={16}
          color="#67e8f9"
          transform="translate3d(0,-54px,24px)"
          borderRadius="999px"
          opacity={0.92}
        />
      );
    case "crystal-mask":
      return (
        <>
          <HumanoidPart width={60} height={16} color="#67e8f9" transform="translate3d(0,-54px,24px)" borderRadius="999px" opacity={0.92} />
          <CircleGem size={14} color="#bae6fd" transform="translate3d(-18px,-52px,28px) rotateZ(-8deg)" />
          <CircleGem size={14} color="#bae6fd" transform="translate3d(18px,-52px,28px) rotateZ(8deg)" />
        </>
      );
    case "ribbon":
      return (
        <>
          <HumanoidPart width={28} height={16} color="#f9a8d4" transform="translate3d(-18px,-102px,16px) rotateZ(-18deg)" />
          <HumanoidPart width={28} height={16} color="#f9a8d4" transform="translate3d(18px,-102px,16px) rotateZ(18deg)" />
          <HumanoidPart width={12} height={14} color="#f472b6" transform="translate3d(0,-102px,18px)" />
        </>
      );
    default:
      return null;
  }
}

function PremiumOutfit({
  theme,
  palette,
}: {
  theme: OutfitTheme;
  palette: { top: string; bottom: string; accent: string };
}) {
  switch (theme) {
    case "mystic":
      return (
        <>
          <HumanoidPart width={100} height={116} color="#8b5cf6" transform="translate3d(0,30px,-18px)" borderRadius="40% 40% 30% 30% / 16% 16% 74% 74%" />
          <HumanoidPart width={26} height={82} color="#7c3aed" transform="translate3d(0,44px,12px)" borderRadius="999px" />
        </>
      );
    case "battle":
      return (
        <>
          <HumanoidPart width={92} height={100} color="#334155" transform="translate3d(0,24px,-16px)" borderRadius="38% 38% 28% 28% / 16% 16% 72% 72%" />
          <HumanoidPart width={20} height={20} color="#e6c274" transform="translate3d(-24px,8px,16px)" />
          <HumanoidPart width={20} height={20} color="#e6c274" transform="translate3d(24px,8px,16px)" />
        </>
      );
    case "celestial":
      return (
        <>
          <HumanoidPart width={94} height={104} color="#93c5fd" transform="translate3d(0,22px,-14px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <CircleGem size={26} color="#e0f2fe" transform="translate3d(0px,56px,20px)" />
        </>
      );
    case "verdant":
      return <HumanoidPart width={94} height={106} color="#4ade80" transform="translate3d(0,28px,-16px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />;
    case "ember":
      return (
        <>
          <HumanoidPart width={90} height={102} color="#fb923c" transform="translate3d(0,26px,-14px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={48} height={14} color="#ffedd5" transform="translate3d(0,0px,18px)" borderRadius="999px" />
        </>
      );
    case "frost":
      return (
        <>
          <HumanoidPart width={94} height={100} color="#e0f2fe" transform="translate3d(0,24px,-14px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={72} height={12} color="#7dd3fc" transform="translate3d(0,0px,18px)" borderRadius="999px" />
        </>
      );
    case "rose":
      return (
        <>
          <HumanoidPart width={96} height={106} color="#fda4af" transform="translate3d(0,28px,-16px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <CircleGem size={18} color="#ffe4e6" transform="translate3d(-24px,2px,18px)" />
          <CircleGem size={18} color="#ffe4e6" transform="translate3d(24px,2px,18px)" />
        </>
      );
    case "oracle":
      return (
        <>
          <HumanoidPart width={100} height={116} color="#7e22ce" transform="translate3d(0,30px,-18px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={20} height={48} color="#fde68a" transform="translate3d(0,32px,18px)" borderRadius="999px" />
        </>
      );
    case "street":
      return (
        <>
          <HumanoidPart width={98} height={62} color="#374151" transform="translate3d(0,12px,-14px)" borderRadius="38% 38% 28% 28% / 18% 18% 72% 72%" />
          <HumanoidPart width={70} height={14} color="#facc15" transform="translate3d(0,44px,18px)" borderRadius="999px" />
        </>
      );
    case "ceremony":
      return (
        <>
          <HumanoidPart width={102} height={114} color="#fef3c7" transform="translate3d(0,34px,-18px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={78} height={14} color="#d4a94a" transform="translate3d(0,0px,18px)" borderRadius="999px" />
        </>
      );
    case "neon":
      return (
        <>
          <HumanoidPart width={84} height={94} color="#164e63" transform="translate3d(0,22px,-14px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={12} height={78} color="#22d3ee" transform="translate3d(-18px,20px,18px)" borderRadius="999px" />
          <HumanoidPart width={12} height={78} color="#f472b6" transform="translate3d(18px,20px,18px)" borderRadius="999px" />
        </>
      );
    default:
      return (
        <>
          <HumanoidPart width={96} height={104} color={palette.top} transform="translate3d(0,24px,-16px)" borderRadius="40% 40% 30% 30% / 18% 18% 72% 72%" />
          <HumanoidPart width={70} height={14} color={palette.accent} transform="translate3d(0,48px,18px)" borderRadius="999px" />
        </>
      );
  }
}

function outfitPalette(theme: OutfitTheme) {
  switch (theme) {
    case "base":
      return { top: "#475569", bottom: "#1e293b", accent: "#94a3b8" };
    case "battle":
      return { top: "#334155", bottom: "#0f172a", accent: "#d4a94a" };
    case "mystic":
      return { top: "#6d28d9", bottom: "#312e81", accent: "#c4b5fd" };
    case "shadow":
      return { top: "#111827", bottom: "#1f2937", accent: "#e879f9" };
    case "celestial":
      return { top: "#1d4ed8", bottom: "#1e3a8a", accent: "#dbeafe" };
    case "verdant":
      return { top: "#166534", bottom: "#14532d", accent: "#bbf7d0" };
    case "ember":
      return { top: "#c2410c", bottom: "#7c2d12", accent: "#fdba74" };
    case "frost":
      return { top: "#bae6fd", bottom: "#0369a1", accent: "#f8fafc" };
    case "rose":
      return { top: "#fb7185", bottom: "#9f1239", accent: "#fce7f3" };
    case "oracle":
      return { top: "#581c87", bottom: "#312e81", accent: "#f0abfc" };
    case "street":
      return { top: "#1f2937", bottom: "#111827", accent: "#facc15" };
    case "ceremony":
      return { top: "#fef3c7", bottom: "#92400e", accent: "#f4cf74" };
    case "neon":
      return { top: "#0891b2", bottom: "#0f172a", accent: "#f472b6" };
    default:
      return { top: "#9d174d", bottom: "#5b1648", accent: "#fbeecb" };
  }
}

function PremiumAvatarStage({
  config,
  palette,
  body,
  faceScale,
  outfit,
  accessory,
  layoutTop,
}: {
  config: Avatar3DConfig;
  palette: { top: string; bottom: string; accent: string };
  body: { shoulders: number; waist: number; torsoH: number; armW: number; legW: number; footW: number };
  faceScale: number;
  outfit: OutfitTheme;
  accessory: AccessoryTheme;
  layoutTop: string;
}) {
  const headTone = shade(config.skinTone, 0.99);
  const cheekTone = shade(config.skinTone, 0.9);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: layoutTop,
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
        transform: "translate3d(0,0,0) scale(0.98) rotateX(-7deg)",
      }}
    >
      <HumanoidPart width={body.shoulders + 22} height={16} color={shade(palette.top, 0.8)} transform="translate3d(0,12px,2px)" borderRadius="999px" opacity={0.8} />
      <HumanoidPart width={body.shoulders + 18} height={20} color={shade(config.skinTone, 1.02)} transform="translate3d(0,-6px,8px)" borderRadius="44% 44% 52% 52% / 34% 34% 66% 66%" opacity={0.98} />
      <HumanoidPart width={62 * faceScale} height={78} color={headTone} transform="translate3d(0,-62px,20px)" borderRadius="46% 46% 54% 54% / 42% 42% 58% 58%" />
      <HumanoidPart width={72 * faceScale} height={54} color={config.hairColor} transform="translate3d(0,-94px,24px)" borderRadius="54% 54% 28% 28% / 74% 74% 26% 26%" />
      <HumanoidPart width={64 * faceScale} height={50} color={shade(config.hairColor, 0.9)} transform="translate3d(0,-70px,-8px)" borderRadius="50% 50% 62% 62%" />
      <HumanoidPart width={18} height={10} color={cheekTone} transform="translate3d(-18px,-10px,30px)" borderRadius="999px" opacity={0.46} />
      <HumanoidPart width={18} height={10} color={cheekTone} transform="translate3d(18px,-10px,30px)" borderRadius="999px" opacity={0.46} />
      <HumanoidPart width={12} height={8} color="#fffaf5" transform="translate3d(-13px,-20px,30px)" borderRadius="50%" opacity={0.96} />
      <HumanoidPart width={12} height={8} color="#fffaf5" transform="translate3d(13px,-20px,30px)" borderRadius="50%" opacity={0.96} />
      <HumanoidPart width={5} height={5} color={config.eyeColor} transform="translate3d(-13px,-20px,31px)" borderRadius="50%" opacity={0.98} />
      <HumanoidPart width={5} height={5} color={config.eyeColor} transform="translate3d(13px,-20px,31px)" borderRadius="50%" opacity={0.98} />
      <HumanoidPart width={46} height={8} color="#9f4f38" transform="translate3d(0,18px,31px)" borderRadius="999px" opacity={0.9} />
      <HumanoidPart width={8} height={4} color="#8b5e4a" transform="translate3d(0,-12px,31px)" borderRadius="999px" opacity={0.7} />
      <HumanoidPart width={body.shoulders + 6} height={body.torsoH + 4} color={palette.top} transform="translate3d(0,26px,4px)" borderRadius="42% 42% 28% 28% / 16% 16% 74% 74%" />
      <HumanoidPart width={body.shoulders - 8} height={body.torsoH - 12} color={shade(palette.top, 0.88)} transform="translate3d(0,30px,10px)" borderRadius="38% 38% 26% 26% / 16% 16% 74% 74%" />
      <HumanoidPart width={body.waist + 18} height={28} color={palette.accent} transform="translate3d(0,82px,8px)" borderRadius="48% 48% 58% 58%" />
      <HumanoidPart width={body.armW + 8} height={90} color={palette.top} transform={`translate3d(-${body.shoulders / 2 + 14}px,34px,4px) rotateZ(4deg)`} borderRadius="999px" />
      <HumanoidPart width={body.armW + 8} height={90} color={palette.top} transform={`translate3d(${body.shoulders / 2 + 14}px,34px,4px) rotateZ(-4deg)`} borderRadius="999px" />
      <HumanoidPart width={body.armW + 2} height={58} color={config.skinTone} transform={`translate3d(-${body.shoulders / 2 + 18}px,92px,8px) rotateZ(8deg)`} borderRadius="999px" />
      <HumanoidPart width={body.armW + 2} height={58} color={config.skinTone} transform={`translate3d(${body.shoulders / 2 + 18}px,92px,8px) rotateZ(-8deg)`} borderRadius="999px" />
      <HumanoidPart width={18} height={24} color={shade(config.skinTone, 0.98)} transform={`translate3d(-${body.shoulders / 2 + 20}px,146px,12px) rotateZ(6deg)`} borderRadius="50% 50% 44% 44%" />
      <HumanoidPart width={18} height={24} color={shade(config.skinTone, 0.98)} transform={`translate3d(${body.shoulders / 2 + 20}px,146px,12px) rotateZ(-6deg)`} borderRadius="50% 50% 44% 44%" />
      <HumanoidPart width={body.legW + 12} height={96} color={palette.bottom} transform={`translate3d(-${body.legW / 1.1}px,136px,6px) rotateZ(1deg)`} borderRadius="42% 42% 40% 40% / 18% 18% 82% 82%" />
      <HumanoidPart width={body.legW + 12} height={96} color={palette.bottom} transform={`translate3d(${body.legW / 1.1}px,136px,6px) rotateZ(-1deg)`} borderRadius="42% 42% 40% 40% / 18% 18% 82% 82%" />
      <HumanoidPart width={body.footW + 8} height={18} color={shade(palette.bottom, 0.76)} transform={`translate3d(-${body.legW / 1.05}px,186px,12px) rotateZ(2deg)`} borderRadius="52% 52% 46% 46%" />
      <HumanoidPart width={body.footW + 8} height={18} color={shade(palette.bottom, 0.76)} transform={`translate3d(${body.legW / 1.05}px,186px,12px) rotateZ(-2deg)`} borderRadius="52% 52% 46% 46%" />
      <PremiumOutfit theme={outfit} palette={palette} />
      <PremiumAccessory kind={accessory} skinTone={config.skinTone} />
    </div>
  );
}

export function Avatar3DModel({
  config,
  size = "portrait",
  framing = "body",
  outfit = "base",
  accessory = null,
  autoRotate = true,
  interactive = true,
  className = "",
}: Props) {
  const [yaw, setYaw] = useState(-18);
  const [pitch, setPitch] = useState(-8);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(
    null,
  );
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoRotate || dragRef.current) return;
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      setYaw((prev) => (prev + 0.22 > 180 ? -180 : prev + 0.22));
      frameRef.current = window.setTimeout(tick, 32) as unknown as number;
    };
    frameRef.current = window.setTimeout(tick, 32) as unknown as number;
    return () => {
      mounted = false;
      if (frameRef.current !== null) window.clearTimeout(frameRef.current);
    };
  }, [autoRotate]);

  const palette = useMemo(() => outfitPalette(outfit), [outfit]);
  const body = config.bodyType === "homme"
    ? { shoulders: 82, waist: 34, torsoH: 92, armW: 13, legW: 14, hip: 48, footW: 24 }
    : { shoulders: 72, waist: 30, torsoH: 88, armW: 12, legW: 13, hip: 44, footW: 22 };
  const faceScale = config.faceShape === "sharp" ? 0.94 : 1.02;
  const aspectClass =
    size === "square"
      ? "aspect-square"
      : size === "wide"
        ? "aspect-[16/10]"
        : "aspect-[3/4]";
  const layout =
    framing === "face"
      ? size === "portrait"
        ? { top: "78%", scale: 0.92 }
        : { top: "64%", scale: 1.02 }
      : size === "portrait"
        ? { top: "66%", scale: 0.86 }
        : { top: "58%", scale: 0.94 };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setYaw(dragRef.current.yaw + dx * 0.45);
    setPitch(Math.max(-26, Math.min(18, dragRef.current.pitch - dy * 0.25)));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const premiumModel = config.baseModel !== "procedural-premium";

  return (
    <div
      className={`relative ${aspectClass} overflow-hidden rounded-2xl border border-gold-400/30 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(180deg,#12081f_0%,#0a0614_100%)] ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        touchAction: interactive ? "none" : "auto",
        cursor: interactive ? "grab" : "default",
        perspective: "1200px",
      }}
    >
      <div className="absolute inset-x-0 bottom-5 h-8 rounded-full bg-black/30 blur-xl" />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: layout.top,
          width: 0,
          height: 0,
        transformStyle: "preserve-3d",
        transform: `translate3d(0,0,0) scale(${layout.scale}) rotateX(${pitch}deg) rotateY(${yaw}deg)`,
      }}
      >
        {premiumModel ? (
          <PremiumAvatarStage
            config={config}
            palette={palette}
            body={body}
            faceScale={faceScale}
            outfit={outfit}
            accessory={accessory}
            layoutTop={layout.top}
          />
        ) : (
          <>
        <HumanoidPart
          width={body.shoulders + 14}
          height={18}
          color={shade(palette.top, 0.84)}
          transform="translate3d(0,2px,0)"
          borderRadius="999px"
          opacity={0.9}
        />
        <HumanoidPart
          width={body.shoulders + 20}
          height={22}
          color={shade(config.skinTone, 0.98)}
          transform="translate3d(0,-2px,4px)"
          borderRadius="45% 45% 52% 52% / 38% 38% 62% 62%"
          opacity={0.98}
        />
        <HumanoidPart
          width={body.shoulders + 12}
          height={16}
          color={shade(palette.top, 1.1)}
          transform="translate3d(0,8px,8px)"
          borderRadius="999px"
          opacity={0.9}
        />
        <HumanoidPart
          width={34}
          height={28}
          color={shade(config.skinTone, 0.96)}
          transform="translate3d(0,-16px,8px)"
          borderRadius="44% 44% 48% 48%"
        />
        <HumanoidPart
          width={62 * faceScale}
          height={76}
          color={config.skinTone}
          transform="translate3d(0,-58px,22px)"
          borderRadius="46% 46% 54% 54% / 40% 40% 60% 60%"
        />
        <HumanoidPart
          width={70 * faceScale}
          height={48}
          color={config.hairColor}
          transform="translate3d(0,-90px,24px)"
          borderRadius="52% 52% 24% 24% / 72% 72% 28% 28%"
        />
        <HumanoidPart
          width={60 * faceScale}
          height={54}
          color={shade(config.hairColor, 0.86)}
          transform="translate3d(0,-68px,-8px)"
          borderRadius="44% 44% 60% 60%"
        />
        <HumanoidPart
          width={18}
          height={10}
          color={shade(config.skinTone, 0.88)}
          transform="translate3d(0,-20px,28px)"
          borderRadius="999px"
        />
        <HumanoidPart
          width={8}
          height={4}
          color="#7c2d12"
          transform="translate3d(-8px,6px,30px)"
          borderRadius="999px"
          opacity={0.88}
        />
        <HumanoidPart
          width={8}
          height={4}
          color="#7c2d12"
          transform="translate3d(8px,6px,30px)"
          borderRadius="999px"
          opacity={0.88}
        />
        <HumanoidPart
          width={44}
          height={8}
          color="#9f4f38"
          transform="translate3d(0,18px,31px)"
          borderRadius="999px"
          opacity={0.92}
        />
        <HumanoidPart
          width={10}
          height={10}
          color="#ffffff"
          transform="translate3d(-13px,-22px,30px)"
          borderRadius="50%"
          opacity={0.95}
        />
        <HumanoidPart
          width={10}
          height={10}
          color="#ffffff"
          transform="translate3d(13px,-22px,30px)"
          borderRadius="50%"
          opacity={0.95}
        />
        <HumanoidPart
          width={5}
          height={5}
          color={config.eyeColor}
          transform="translate3d(-13px,-22px,31px)"
          borderRadius="50%"
          opacity={0.95}
        />
        <HumanoidPart
          width={5}
          height={5}
          color={config.eyeColor}
          transform="translate3d(13px,-22px,31px)"
          borderRadius="50%"
          opacity={0.95}
        />
        <HumanoidPart
          width={2}
          height={10}
          color="#8b5e4a"
          transform="translate3d(0,-12px,31px)"
          borderRadius="999px"
          opacity={0.55}
        />
        {config.hairStyle === "wave" && (
          <>
            <HumanoidPart
              width={20}
              height={54}
              color={config.hairColor}
              transform="translate3d(-32px,-40px,10px) rotateZ(8deg)"
            />
            <HumanoidPart
              width={20}
              height={54}
              color={config.hairColor}
              transform="translate3d(32px,-40px,10px) rotateZ(-8deg)"
            />
            <HumanoidPart
              width={58}
              height={64}
              color={config.hairColor}
              transform="translate3d(0,-34px,-12px)"
              borderRadius="45% 45% 64% 64%"
            />
          </>
        )}
        {config.hairStyle === "bob" && (
          <>
            <HumanoidPart
              width={24}
              height={42}
              color={config.hairColor}
              transform="translate3d(-32px,-48px,12px)"
            />
            <HumanoidPart
              width={24}
              height={42}
              color={config.hairColor}
              transform="translate3d(32px,-48px,12px)"
            />
            <HumanoidPart
              width={60}
              height={36}
              color={config.hairColor}
              transform="translate3d(0,-42px,-12px)"
              borderRadius="45% 45% 58% 58%"
            />
          </>
        )}
        {config.hairStyle === "fade" && (
          <>
            <HumanoidPart
              width={56}
              height={24}
              color={config.hairColor}
              transform="translate3d(0,-90px,10px)"
              borderRadius="62% 62% 38% 38%"
            />
            <HumanoidPart
              width={52}
              height={24}
              color={shade(config.hairColor, 0.92)}
              transform="translate3d(0,-62px,-10px)"
              borderRadius="44% 44% 56% 56%"
            />
          </>
        )}
        {config.hairStyle === "braids" && (
          <>
            <HumanoidPart
              width={14}
              height={70}
              color={config.hairColor}
              transform="translate3d(-34px,-20px,18px)"
            />
            <HumanoidPart
              width={14}
              height={70}
              color={config.hairColor}
              transform="translate3d(34px,-20px,18px)"
            />
            <HumanoidPart
              width={60}
              height={52}
              color={config.hairColor}
              transform="translate3d(0,-52px,-12px)"
              borderRadius="50% 50% 58% 58%"
            />
          </>
        )}
        {config.hairStyle === "ponytail" && (
          <>
            <HumanoidPart
              width={58}
              height={36}
              color={config.hairColor}
              transform="translate3d(0,-72px,2px)"
              borderRadius="52% 52% 38% 38%"
            />
            <HumanoidPart
              width={20}
              height={70}
              color={config.hairColor}
              transform="translate3d(0,-24px,-22px)"
            />
          </>
        )}
        {config.hairStyle === "afro" && (
          <>
            <HumanoidPart
              width={82}
              height={80}
              color={config.hairColor}
              transform="translate3d(0,-80px,4px)"
              borderRadius="50%"
            />
            <HumanoidPart
              width={60}
              height={36}
              color={shade(config.hairColor, 0.92)}
              transform="translate3d(0,-52px,-12px)"
              borderRadius="48% 48% 58% 58%"
            />
          </>
        )}
        {config.hairStyle === "pixie" && (
          <>
            <HumanoidPart
              width={64}
              height={28}
              color={config.hairColor}
              transform="translate3d(0,-86px,12px)"
              borderRadius="60% 60% 34% 34%"
            />
            <HumanoidPart
              width={48}
              height={22}
              color={shade(config.hairColor, 0.9)}
              transform="translate3d(6px,-62px,10px) rotateZ(-8deg)"
              borderRadius="62% 36% 56% 44%"
            />
          </>
        )}
        <HumanoidPart
          width={body.shoulders}
          height={body.torsoH}
          color={palette.top}
          transform="translate3d(0,22px,4px)"
          borderRadius="44% 44% 32% 32% / 18% 18% 72% 72%"
          clipPath="polygon(14% 0, 86% 0, 76% 100%, 24% 100%)"
        />
        <HumanoidPart
          width={body.waist + 28}
          height={36}
          color={palette.accent}
          transform="translate3d(0,74px,6px)"
          borderRadius="48% 48% 58% 58%"
        />
        <HumanoidPart
          width={body.legW + 8}
          height={84}
          color={palette.bottom}
          transform={`translate3d(-${body.legW / 1.05}px,124px,4px) rotateZ(1deg)`}
          borderRadius="48% 48% 42% 42% / 20% 20% 80% 80%"
        />
        <HumanoidPart
          width={body.legW + 8}
          height={84}
          color={palette.bottom}
          transform={`translate3d(${body.legW / 1.05}px,124px,4px) rotateZ(-1deg)`}
          borderRadius="48% 48% 42% 42% / 20% 20% 80% 80%"
        />
        <HumanoidPart
          width={body.armW + 8}
          height={78}
          color={palette.top}
          transform={`translate3d(-${body.shoulders / 2 + 10}px,26px,4px) rotateZ(8deg)`}
          borderRadius="999px"
        />
        <HumanoidPart
          width={body.armW + 8}
          height={78}
          color={palette.top}
          transform={`translate3d(${body.shoulders / 2 + 10}px,26px,4px) rotateZ(-8deg)`}
          borderRadius="999px"
        />
        <HumanoidPart
          width={body.armW + 4}
          height={50}
          color={config.skinTone}
          transform={`translate3d(-${body.shoulders / 2 + 16}px,84px,8px) rotateZ(5deg)`}
          borderRadius="999px"
        />
        <HumanoidPart
          width={body.armW + 4}
          height={50}
          color={config.skinTone}
          transform={`translate3d(${body.shoulders / 2 + 16}px,84px,8px) rotateZ(-5deg)`}
          borderRadius="999px"
        />
        <HumanoidPart
          width={16}
          height={20}
          color={shade(config.skinTone, 0.98)}
          transform={`translate3d(-${body.shoulders / 2 + 20}px,120px,10px) rotateZ(8deg)`}
          borderRadius="52% 48% 46% 54%"
        />
        <HumanoidPart
          width={16}
          height={20}
          color={shade(config.skinTone, 0.98)}
          transform={`translate3d(${body.shoulders / 2 + 20}px,120px,10px) rotateZ(-8deg)`}
          borderRadius="48% 52% 54% 46%"
        />
        <HumanoidPart
          width={body.footW}
          height={16}
          color={shade(palette.bottom, 0.78)}
          transform={`translate3d(-${body.legW / 1.02}px,168px,12px) rotateZ(2deg)`}
          borderRadius="54% 54% 46% 46%"
        />
        <HumanoidPart
          width={body.footW}
          height={16}
          color={shade(palette.bottom, 0.78)}
          transform={`translate3d(${body.legW / 1.02}px,168px,12px) rotateZ(-2deg)`}
          borderRadius="54% 54% 46% 46%"
        />
        <HumanoidPart
          width={body.legW + 18}
          height={12}
          color={shade(palette.bottom, 0.72)}
          transform={`translate3d(-${body.legW / 1.05}px,170px,14px)`}
          borderRadius="52% 52% 48% 48%"
        />
        <HumanoidPart
          width={body.legW + 18}
          height={12}
          color={shade(palette.bottom, 0.72)}
          transform={`translate3d(${body.legW / 1.05}px,170px,14px)`}
          borderRadius="52% 52% 48% 48%"
        />
        {outfit === "mystic" && (
          <Cuboid
            width={94}
            height={108}
            depth={14}
            color="#a855f7"
            transform="translate3d(0,34px,-18px)"
          />
        )}
        {outfit === "battle" && (
          <>
            <Cuboid
              width={26}
              height={18}
              depth={8}
              color="#e6c274"
              transform="translate3d(-18px,10px,18px)"
            />
            <Cuboid
              width={26}
              height={18}
              depth={8}
              color="#e6c274"
              transform="translate3d(18px,10px,18px)"
            />
          </>
        )}
        {outfit === "celestial" && (
          <>
            <Cuboid
              width={88}
              height={86}
              depth={14}
              color="#93c5fd"
              transform="translate3d(0,20px,-14px)"
            />
            <Cuboid
              width={18}
              height={28}
              depth={8}
              color="#e0f2fe"
              transform="translate3d(0,58px,18px)"
            />
          </>
        )}
        {outfit === "verdant" && (
          <Cuboid
            width={92}
            height={96}
            depth={14}
            color="#4ade80"
            transform="translate3d(0,30px,-16px)"
          />
        )}
        {outfit === "ember" && (
          <>
            <Cuboid
              width={84}
              height={94}
              depth={12}
              color="#fb923c"
              transform="translate3d(0,28px,-14px)"
            />
            <Cuboid
              width={42}
              height={16}
              depth={8}
              color="#ffedd5"
              transform="translate3d(0,-2px,18px)"
            />
          </>
        )}
        {outfit === "frost" && (
          <>
            <Cuboid width={92} height={92} depth={12} color="#e0f2fe" transform="translate3d(0,26px,-14px)" />
            <Cuboid width={62} height={10} depth={8} color="#7dd3fc" transform="translate3d(0,0px,18px)" />
          </>
        )}
        {outfit === "rose" && (
          <>
            <Cuboid width={90} height={98} depth={14} color="#fda4af" transform="translate3d(0,30px,-16px)" />
            <Cuboid width={18} height={18} depth={8} color="#ffe4e6" transform="translate3d(-22px,4px,18px)" />
            <Cuboid width={18} height={18} depth={8} color="#ffe4e6" transform="translate3d(22px,4px,18px)" />
          </>
        )}
        {outfit === "oracle" && (
          <>
            <Cuboid width={96} height={114} depth={14} color="#7e22ce" transform="translate3d(0,34px,-18px)" />
            <Cuboid width={14} height={42} depth={8} color="#fde68a" transform="translate3d(0,30px,18px)" />
          </>
        )}
        {outfit === "street" && (
          <>
            <Cuboid width={92} height={58} depth={12} color="#374151" transform="translate3d(0,14px,-14px)" />
            <Cuboid width={58} height={12} depth={8} color="#facc15" transform="translate3d(0,46px,18px)" />
          </>
        )}
        {outfit === "ceremony" && (
          <>
            <Cuboid width={98} height={112} depth={14} color="#fef3c7" transform="translate3d(0,36px,-18px)" />
            <Cuboid width={72} height={12} depth={8} color="#d4a94a" transform="translate3d(0,0px,18px)" />
          </>
        )}
        {outfit === "neon" && (
          <>
            <Cuboid width={76} height={86} depth={10} color="#164e63" transform="translate3d(0,24px,-14px)" />
            <Cuboid width={10} height={76} depth={8} color="#22d3ee" transform="translate3d(-18px,24px,18px)" />
            <Cuboid width={10} height={76} depth={8} color="#f472b6" transform="translate3d(18px,24px,18px)" />
          </>
        )}
        {accessory === "crown" && (
          <>
            <Cuboid width={54} height={8} depth={44} color="#f4cf74" transform="translate3d(0,-112px,0)" />
            <Cuboid width={8} height={16} depth={8} color="#f8e39f" transform="translate3d(-18px,-124px,0)" />
            <Cuboid width={8} height={20} depth={8} color="#f8e39f" transform="translate3d(0,-128px,0)" />
            <Cuboid width={8} height={16} depth={8} color="#f8e39f" transform="translate3d(18px,-124px,0)" />
          </>
        )}
        {accessory === "halo" && (
          <div
            style={{
              position: "absolute",
              width: 86,
              height: 18,
              left: -43,
              top: -138,
              borderRadius: "999px",
              border: "4px solid rgba(251,238,203,0.95)",
              boxShadow: "0 0 18px rgba(251,238,203,0.65)",
              transform: "rotateX(72deg) translateZ(8px)",
            }}
          />
        )}
        {accessory === "horns" && (
          <>
            <Cuboid width={12} height={30} depth={10} color="#d4a94a" transform="translate3d(-24px,-128px,-4px) rotateZ(-28deg)" />
            <Cuboid width={12} height={30} depth={10} color="#d4a94a" transform="translate3d(24px,-128px,-4px) rotateZ(28deg)" />
          </>
        )}
        {accessory === "elf-ears" && (
          <>
            <Cuboid
              width={10}
              height={28}
              depth={8}
              color={config.skinTone}
              transform="translate3d(-36px,-60px,0) rotateZ(-28deg)"
            />
            <Cuboid
              width={10}
              height={28}
              depth={8}
              color={config.skinTone}
              transform="translate3d(36px,-60px,0) rotateZ(28deg)"
            />
          </>
        )}
        {accessory === "fae-ears" && (
          <>
            <Cuboid
              width={12}
              height={22}
              depth={8}
              color="#f5d7c8"
              transform="translate3d(-35px,-60px,4px) rotateZ(-22deg)"
            />
            <Cuboid
              width={12}
              height={22}
              depth={8}
              color="#f5d7c8"
              transform="translate3d(35px,-60px,4px) rotateZ(22deg)"
            />
          </>
        )}
        {accessory === "antlers" && (
          <>
            <Cuboid
              width={10}
              height={42}
              depth={10}
              color="#8b5e34"
              transform="translate3d(-24px,-136px,-2px) rotateZ(-18deg)"
            />
            <Cuboid
              width={10}
              height={42}
              depth={10}
              color="#8b5e34"
              transform="translate3d(24px,-136px,-2px) rotateZ(18deg)"
            />
            <Cuboid
              width={20}
              height={8}
              depth={8}
              color="#9a6a3d"
              transform="translate3d(-36px,-148px,0) rotateZ(-30deg)"
            />
            <Cuboid
              width={20}
              height={8}
              depth={8}
              color="#9a6a3d"
              transform="translate3d(36px,-148px,0) rotateZ(30deg)"
            />
          </>
        )}
        {accessory === "circlet" && (
          <>
            <Cuboid
              width={64}
              height={8}
              depth={40}
              color="#f4cf74"
              transform="translate3d(0,-92px,6px)"
            />
            <Cuboid
              width={10}
              height={10}
              depth={10}
              color="#c4b5fd"
              transform="translate3d(0,-90px,26px)"
            />
          </>
        )}
        {accessory === "gem" && (
          <>
            <Cuboid
              width={8}
              height={18}
              depth={6}
              color="#f4cf74"
              transform="translate3d(0,-94px,18px)"
            />
            <Cuboid
              width={12}
              height={12}
              depth={12}
              color="#60a5fa"
              transform="translate3d(0,-78px,24px) rotateZ(45deg)"
            />
          </>
        )}
        {accessory === "laurel" && (
          <>
            <Cuboid width={18} height={10} depth={8} color="#86efac" transform="translate3d(-20px,-116px,14px) rotateZ(-18deg)" />
            <Cuboid width={18} height={10} depth={8} color="#86efac" transform="translate3d(20px,-116px,14px) rotateZ(18deg)" />
            <Cuboid width={18} height={10} depth={8} color="#4ade80" transform="translate3d(-8px,-122px,12px) rotateZ(-8deg)" />
            <Cuboid width={18} height={10} depth={8} color="#4ade80" transform="translate3d(8px,-122px,12px) rotateZ(8deg)" />
          </>
        )}
        {accessory === "moon-crown" && (
          <>
            <Cuboid width={44} height={8} depth={34} color="#e9d5ff" transform="translate3d(0,-114px,0)" />
            <Cuboid width={14} height={18} depth={8} color="#f5f3ff" transform="translate3d(0,-128px,0)" />
            <Cuboid width={10} height={12} depth={8} color="#ddd6fe" transform="translate3d(-16px,-122px,0)" />
            <Cuboid width={10} height={12} depth={8} color="#ddd6fe" transform="translate3d(16px,-122px,0)" />
          </>
        )}
        {accessory === "butterfly" && (
          <>
            <Cuboid width={18} height={22} depth={8} color="#f9a8d4" transform="translate3d(-22px,-90px,-22px) rotateZ(-20deg)" />
            <Cuboid width={18} height={22} depth={8} color="#f9a8d4" transform="translate3d(22px,-90px,-22px) rotateZ(20deg)" />
            <Cuboid width={10} height={14} depth={8} color="#fbcfe8" transform="translate3d(-12px,-102px,-24px) rotateZ(-10deg)" />
            <Cuboid width={10} height={14} depth={8} color="#fbcfe8" transform="translate3d(12px,-102px,-24px) rotateZ(10deg)" />
          </>
        )}
        {accessory === "visor" && (
          <Cuboid
            width={58}
            height={14}
            depth={10}
            color="#67e8f9"
            transform="translate3d(0,-56px,24px)"
          />
        )}
        {accessory === "rose-circlet" && (
          <>
            <Cuboid width={58} height={8} depth={38} color="#fda4af" transform="translate3d(0,-112px,2px)" />
            <Cuboid width={12} height={12} depth={8} color="#fecdd3" transform="translate3d(-18px,-118px,18px)" />
            <Cuboid width={12} height={12} depth={8} color="#fecdd3" transform="translate3d(18px,-118px,18px)" />
          </>
        )}
        {accessory === "crystal-mask" && (
          <>
            <Cuboid width={64} height={18} depth={8} color="#67e8f9" transform="translate3d(0,-56px,24px)" />
            <Cuboid width={14} height={22} depth={8} color="#bae6fd" transform="translate3d(-20px,-54px,28px) rotateZ(-8deg)" />
            <Cuboid width={14} height={22} depth={8} color="#bae6fd" transform="translate3d(20px,-54px,28px) rotateZ(8deg)" />
          </>
        )}
        {accessory === "sun-halo" && (
          <div
            style={{
              position: "absolute",
              width: 92,
              height: 22,
              left: -46,
              top: -142,
              borderRadius: "999px",
              border: "5px solid rgba(250,204,21,0.95)",
              boxShadow: "0 0 24px rgba(250,204,21,0.75)",
              transform: "rotateX(72deg) translateZ(10px)",
            }}
          />
        )}
        {accessory === "ribbon" && (
          <>
            <Cuboid width={30} height={18} depth={8} color="#f9a8d4" transform="translate3d(-20px,-104px,16px) rotateZ(-18deg)" />
            <Cuboid width={30} height={18} depth={8} color="#f9a8d4" transform="translate3d(20px,-104px,16px) rotateZ(18deg)" />
            <Cuboid width={12} height={16} depth={8} color="#f472b6" transform="translate3d(0,-104px,18px)" />
          </>
        )}
        {accessory === "star-tiara" && (
          <>
            <Cuboid width={54} height={8} depth={34} color="#f4cf74" transform="translate3d(0,-114px,0)" />
            <Cuboid width={10} height={20} depth={8} color="#fde68a" transform="translate3d(-18px,-126px,0)" />
            <Cuboid width={12} height={26} depth={8} color="#fef3c7" transform="translate3d(0,-130px,0)" />
            <Cuboid width={10} height={20} depth={8} color="#fde68a" transform="translate3d(18px,-126px,0)" />
          </>
        )}
        {accessory === "onyx-horns" && (
          <>
            <Cuboid width={12} height={32} depth={10} color="#111827" transform="translate3d(-24px,-130px,-4px) rotateZ(-28deg)" />
            <Cuboid width={12} height={32} depth={10} color="#111827" transform="translate3d(24px,-130px,-4px) rotateZ(28deg)" />
            <Cuboid width={8} height={10} depth={8} color="#c084fc" transform="translate3d(-26px,-148px,0)" />
            <Cuboid width={8} height={10} depth={8} color="#c084fc" transform="translate3d(26px,-148px,0)" />
          </>
        )}
        <div
          style={{
            position: "absolute",
            left: -6,
            top: -62,
            width: 12,
            height: 12,
            borderRadius: "999px",
            background: `radial-gradient(circle at 35% 30%, #ffffff 0 12%, ${config.eyeColor} 24%, ${shade(config.eyeColor, 0.54)} 100%)`,
            boxShadow: "0 0 12px rgba(127,216,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.28)",
            transform: "translate3d(-12px,0,24px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -6,
            top: -62,
            width: 12,
            height: 12,
            borderRadius: "999px",
            background: `radial-gradient(circle at 35% 30%, #ffffff 0 12%, ${config.eyeColor} 24%, ${shade(config.eyeColor, 0.54)} 100%)`,
            boxShadow: "0 0 12px rgba(127,216,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.28)",
            transform: "translate3d(12px,0,24px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -22,
            top: -72,
            width: 18,
            height: 4,
            borderRadius: "999px",
            background: shade(config.hairColor, 0.72),
            transform: "translate3d(0,0,27px) rotateZ(-8deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: -72,
            width: 18,
            height: 4,
            borderRadius: "999px",
            background: shade(config.hairColor, 0.72),
            transform: "translate3d(0,0,27px) rotateZ(8deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -4,
            top: -50,
            width: 8,
            height: 12,
            borderRadius: "999px",
            background: shade(config.skinTone, 0.86),
            transform: "translate3d(0,0,28px)",
            boxShadow: "inset 0 -2px 3px rgba(0,0,0,0.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -15,
            top: -42,
            width: 30,
            height: 14,
            borderBottom: `3px solid ${shade(config.skinTone, 0.55)}`,
            borderRadius: "0 0 999px 999px",
            transform: "translate3d(0,0,29px)",
            boxShadow: "0 5px 8px rgba(0,0,0,0.08)",
          }}
        />
          </>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-ivory/10 bg-night-900/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-ivory/60">
        360°
      </div>
    </div>
  );
}
