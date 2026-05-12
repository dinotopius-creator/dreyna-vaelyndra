import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { Avatar3DConfig } from "../lib/avatar3d";

export type OutfitTheme = "royal" | "battle" | "mystic" | "shadow";
export type AccessoryTheme =
  | "crown"
  | "halo"
  | "horns"
  | "elf-ears"
  | "fae-ears"
  | "antlers"
  | "circlet"
  | "gem"
  | null;

interface Props {
  config: Avatar3DConfig;
  size?: "square" | "portrait" | "wide";
  framing?: "face" | "body";
  outfit?: OutfitTheme;
  accessory?: AccessoryTheme;
  autoRotate?: boolean;
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
          background: color,
        }}
      />
      <div
        style={{
          ...faceBase,
          ...back,
          marginLeft: -width / 2,
          marginTop: -height / 2,
          background: shade(color, 0.72),
        }}
      />
      <div
        style={{
          ...faceBase,
          ...left,
          marginLeft: -depth / 2,
          marginTop: -height / 2,
          background: shade(color, 0.78),
        }}
      />
      <div
        style={{
          ...faceBase,
          ...right,
          marginLeft: -depth / 2,
          marginTop: -height / 2,
          background: shade(color, 0.88),
        }}
      />
      <div
        style={{
          ...faceBase,
          ...top,
          marginLeft: -width / 2,
          marginTop: -depth / 2,
          background: shade(color, 1.08),
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

function outfitPalette(theme: OutfitTheme) {
  switch (theme) {
    case "battle":
      return { top: "#334155", bottom: "#0f172a", accent: "#d4a94a" };
    case "mystic":
      return { top: "#6d28d9", bottom: "#312e81", accent: "#c4b5fd" };
    case "shadow":
      return { top: "#111827", bottom: "#1f2937", accent: "#e879f9" };
    default:
      return { top: "#9d174d", bottom: "#5b1648", accent: "#fbeecb" };
  }
}

export function Avatar3DModel({
  config,
  size = "portrait",
  framing = "body",
  outfit = "royal",
  accessory = null,
  autoRotate = true,
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
    ? { shoulders: 84, waist: 52, torsoH: 82, armW: 18, legW: 20, hip: 56 }
    : { shoulders: 72, waist: 46, torsoH: 78, armW: 16, legW: 18, hip: 52 };
  const faceScale = config.faceShape === "sharp" ? 0.94 : 1.02;
  const hairDepth = config.hairStyle === "fade" ? 44 : 58;
  const aspectClass =
    size === "square"
      ? "aspect-square"
      : size === "wide"
        ? "aspect-[16/10]"
        : "aspect-[3/4]";
  const layout =
    framing === "face"
      ? size === "portrait"
        ? { top: "72%", scale: 0.98 }
        : { top: "62%", scale: 1.06 }
      : size === "portrait"
        ? { top: "63%", scale: 0.9 }
        : { top: "56%", scale: 0.96 };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setYaw(dragRef.current.yaw + dx * 0.45);
    setPitch(Math.max(-26, Math.min(18, dragRef.current.pitch - dy * 0.25)));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      className={`relative ${aspectClass} overflow-hidden rounded-2xl border border-gold-400/30 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(180deg,#12081f_0%,#0a0614_100%)] ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none", cursor: "grab", perspective: "1200px" }}
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
        <Cuboid
          width={44 * faceScale}
          height={14}
          depth={18}
          color={config.skinTone}
          transform="translate3d(0,-18px,0)"
        />
        <Cuboid
          width={60 * faceScale}
          height={60}
          depth={44}
          color={config.skinTone}
          transform="translate3d(0,-58px,0)"
        />
        <Cuboid
          width={60 * faceScale}
          height={34}
          depth={hairDepth}
          color={config.hairColor}
          transform="translate3d(0,-84px,0)"
        />
        <Cuboid
          width={54 * faceScale}
          height={42}
          depth={20}
          color={config.hairColor}
          transform="translate3d(0,-66px,-24px)"
        />
        {config.hairStyle === "wave" && (
          <>
            <Cuboid
              width={18}
              height={44}
              depth={20}
              color={config.hairColor}
              transform="translate3d(-28px,-40px,-8px) rotateZ(8deg)"
            />
            <Cuboid
              width={18}
              height={44}
              depth={20}
              color={config.hairColor}
              transform="translate3d(28px,-40px,-8px) rotateZ(-8deg)"
            />
            <Cuboid
              width={52}
              height={58}
              depth={18}
              color={config.hairColor}
              transform="translate3d(0,-38px,-28px)"
            />
          </>
        )}
        {config.hairStyle === "bob" && (
          <>
            <Cuboid
              width={20}
              height={30}
              depth={24}
              color={config.hairColor}
              transform="translate3d(-28px,-48px,0)"
            />
            <Cuboid
              width={20}
              height={30}
              depth={24}
              color={config.hairColor}
              transform="translate3d(28px,-48px,0)"
            />
            <Cuboid
              width={56}
              height={34}
              depth={18}
              color={config.hairColor}
              transform="translate3d(0,-42px,-24px)"
            />
          </>
        )}
        {config.hairStyle === "fade" && (
          <>
            <Cuboid
              width={52}
              height={18}
              depth={12}
              color={config.hairColor}
              transform="translate3d(0,-88px,-18px)"
            />
            <Cuboid
              width={48}
              height={22}
              depth={12}
              color={shade(config.hairColor, 0.92)}
              transform="translate3d(0,-62px,-20px)"
            />
          </>
        )}
        {config.hairStyle === "braids" && (
          <>
            <Cuboid
              width={10}
              height={60}
              depth={12}
              color={config.hairColor}
              transform="translate3d(-30px,-22px,8px)"
            />
            <Cuboid
              width={10}
              height={60}
              depth={12}
              color={config.hairColor}
              transform="translate3d(30px,-22px,8px)"
            />
            <Cuboid
              width={54}
              height={48}
              depth={18}
              color={config.hairColor}
              transform="translate3d(0,-52px,-26px)"
            />
          </>
        )}
        <Cuboid
          width={10}
          height={12}
          depth={16}
          color={shade(config.skinTone, 0.96)}
          transform="translate3d(0,-52px,26px)"
        />
        <Cuboid
          width={body.shoulders}
          height={body.torsoH}
          depth={34}
          color={palette.top}
          transform="translate3d(0,22px,0)"
        />
        <Cuboid
          width={body.hip}
          height={26}
          depth={30}
          color={palette.accent}
          transform="translate3d(0,70px,0)"
        />
        <Cuboid
          width={body.waist}
          height={64}
          depth={24}
          color={palette.bottom}
          transform={`translate3d(-${body.legW / 1.2}px,118px,0)`}
        />
        <Cuboid
          width={body.waist}
          height={64}
          depth={24}
          color={palette.bottom}
          transform={`translate3d(${body.legW / 1.2}px,118px,0)`}
        />
        <Cuboid
          width={body.armW}
          height={70}
          depth={18}
          color={palette.top}
          transform={`translate3d(-${body.shoulders / 2 + 12}px,26px,0) rotateZ(5deg)`}
        />
        <Cuboid
          width={body.armW}
          height={70}
          depth={18}
          color={palette.top}
          transform={`translate3d(${body.shoulders / 2 + 12}px,26px,0) rotateZ(-5deg)`}
        />
        <Cuboid
          width={body.armW - 2}
          height={46}
          depth={16}
          color={config.skinTone}
          transform={`translate3d(-${body.shoulders / 2 + 16}px,78px,4px) rotateZ(4deg)`}
        />
        <Cuboid
          width={body.armW - 2}
          height={46}
          depth={16}
          color={config.skinTone}
          transform={`translate3d(${body.shoulders / 2 + 16}px,78px,4px) rotateZ(-4deg)`}
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
        <div
          style={{
            position: "absolute",
            left: -6,
            top: -62,
            width: 12,
            height: 12,
            borderRadius: "999px",
            background: config.eyeColor,
            boxShadow: "0 0 12px rgba(127,216,255,0.55)",
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
            background: config.eyeColor,
            boxShadow: "0 0 12px rgba(127,216,255,0.55)",
            transform: "translate3d(12px,0,24px)",
          }}
        />
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-ivory/10 bg-night-900/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-ivory/60">
        360°
      </div>
    </div>
  );
}
