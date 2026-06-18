export const AVATAR_3D_PREFIX = "vaelyndra3d:";

export type Avatar3DBodyType = "femme" | "homme";
export type Avatar3DFaceShape = "soft" | "sharp";
export type Avatar3DHairStyle =
  | "bob"
  | "wave"
  | "fade"
  | "braids"
  | "ponytail"
  | "afro"
  | "pixie";
export type Avatar3DBaseModel = "procedural-premium" | "premium-humanoid" | "humanoid-v3";
export type Avatar3DExpression = "soft-smile" | "neutral" | "confident";

export interface Avatar3DConfig {
  version: 1 | 2 | 3;
  bodyType: Avatar3DBodyType;
  faceShape: Avatar3DFaceShape;
  hairStyle: Avatar3DHairStyle;
  skinTone: string;
  hairColor: string;
  eyeColor: string;
  baseModel?: Avatar3DBaseModel;
  expression?: Avatar3DExpression;
  bodyTone?: string;
}

export const DEFAULT_AVATAR_3D_CONFIG: Avatar3DConfig = {
  version: 3,
  bodyType: "femme",
  faceShape: "soft",
  hairStyle: "wave",
  skinTone: "#f2d1bf",
  hairColor: "#2d160f",
  eyeColor: "#7fd8ff",
  baseModel: "humanoid-v3",
  expression: "soft-smile",
  bodyTone: "#8b5cf6",
};

export const AVATAR_3D_SKIN_TONES = [
  "#f7dfcf",
  "#f2d1bf",
  "#d9a07a",
  "#8d593f",
] as const;

export const AVATAR_3D_HAIR_COLORS = [
  "#1c0f0d",
  "#2b1b10",
  "#5b331f",
  "#a56a3a",
  "#d1a46b",
  "#f5d8a8",
  "#9d2235",
  "#e7679f",
  "#d946ef",
  "#cfd8ff",
  "#8b5cf6",
  "#2563eb",
  "#14b8a6",
  "#0f766e",
  "#84cc16",
  "#d4d4d8",
] as const;

export const AVATAR_3D_EYE_COLORS = [
  "#7fd8ff",
  "#86efac",
  "#fca5a5",
  "#c4b5fd",
  "#fde68a",
] as const;

export function isAvatar3DUrl(input: string | null | undefined): boolean {
  return typeof input === "string" && input.startsWith(AVATAR_3D_PREFIX);
}

export function buildAvatar3DUrl(config: Avatar3DConfig): string {
  const payload = btoa(
    unescape(
      encodeURIComponent(
        JSON.stringify({
          ...config,
          version: 3,
          baseModel: config.baseModel ?? "humanoid-v3",
          expression: config.expression ?? "soft-smile",
          bodyTone: config.bodyTone ?? DEFAULT_AVATAR_3D_CONFIG.bodyTone,
        }),
      ),
    ),
  );
  return `${AVATAR_3D_PREFIX}${payload}`;
}

export function decodeAvatar3DUrl(
  input: string | null | undefined,
): Avatar3DConfig | null {
  if (!isAvatar3DUrl(input)) return null;
  try {
    const safeInput = input as string;
    const raw = safeInput.slice(AVATAR_3D_PREFIX.length);
    const parsed = JSON.parse(
      decodeURIComponent(escape(atob(raw))),
    ) as Partial<Avatar3DConfig>;
    if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3)
      return null;
    return {
      version: parsed.version,
      bodyType: parsed.bodyType === "homme" ? "homme" : "femme",
      faceShape: parsed.faceShape === "sharp" ? "sharp" : "soft",
      hairStyle:
        parsed.hairStyle === "bob" ||
        parsed.hairStyle === "fade" ||
        parsed.hairStyle === "braids" ||
        parsed.hairStyle === "ponytail" ||
        parsed.hairStyle === "afro" ||
        parsed.hairStyle === "pixie"
          ? parsed.hairStyle
          : "wave",
      skinTone: typeof parsed.skinTone === "string" ? parsed.skinTone : DEFAULT_AVATAR_3D_CONFIG.skinTone,
      hairColor: typeof parsed.hairColor === "string" ? parsed.hairColor : DEFAULT_AVATAR_3D_CONFIG.hairColor,
      eyeColor: typeof parsed.eyeColor === "string" ? parsed.eyeColor : DEFAULT_AVATAR_3D_CONFIG.eyeColor,
      baseModel:
        parsed.baseModel === "procedural-premium"
          ? "procedural-premium"
          : parsed.baseModel === "premium-humanoid"
            ? "premium-humanoid"
            : "humanoid-v3",
      expression:
        parsed.expression === "neutral" || parsed.expression === "confident"
          ? parsed.expression
          : "soft-smile",
      bodyTone: typeof parsed.bodyTone === "string" ? parsed.bodyTone : DEFAULT_AVATAR_3D_CONFIG.bodyTone,
    };
  } catch {
    return null;
  }
}

export function buildAvatar3DPosterDataUrl(config: Avatar3DConfig): string {
  const shoulders = config.bodyType === "homme" ? 84 : 76;
  const torso = config.bodyTone ?? (config.bodyType === "homme" ? "#4f46e5" : "#db2777");
  const cape = config.bodyType === "homme" ? "#1d4ed8" : "#7c3aed";
  const jaw = config.faceShape === "sharp" ? "14" : "20";
  const mouth = config.expression === "confident"
    ? "M116 131c8 9 16 12 24 12 8 0 16-3 24-12"
    : config.expression === "neutral"
      ? "M118 131c6 2 14 3 20 3 6 0 14-1 20-3"
      : "M117 129c7 10 14 14 23 14 9 0 16-4 23-14";
  const hairTop =
    config.hairStyle === "fade"
      ? 42
      : config.hairStyle === "pixie"
        ? 34
        : config.hairStyle === "afro"
          ? 20
          : 28;
  const hairSides =
    config.hairStyle === "bob"
      ? 10
      : config.hairStyle === "braids"
        ? 4
        : config.hairStyle === "pixie"
          ? 8
          : config.hairStyle === "afro"
            ? 0
            : 14;
  const extraHair =
    config.hairStyle === "wave"
      ? `<path d="M72 118c6 14 18 24 33 30 2-23 7-43 16-60-22 3-39 13-49 30Z" fill="${config.hairColor}" opacity="0.95" />`
      : config.hairStyle === "braids"
        ? `<rect x="76" y="118" width="10" height="48" rx="5" fill="${config.hairColor}" />
           <rect x="170" y="118" width="10" height="48" rx="5" fill="${config.hairColor}" />`
        : config.hairStyle === "ponytail"
          ? `<rect x="108" y="66" width="40" height="26" rx="12" fill="${config.hairColor}" />
             <rect x="118" y="84" width="20" height="62" rx="10" fill="${config.hairColor}" />`
          : config.hairStyle === "afro"
            ? `<circle cx="128" cy="82" r="56" fill="${config.hairColor}" opacity="0.98" />`
            : config.hairStyle === "pixie"
              ? `<path d="M78 82c12-24 32-38 57-38 20 0 39 7 52 24-19 0-32 2-42 8-17 10-36 14-67 6Z" fill="${config.hairColor}" opacity="0.95" />`
        : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#130a24"/>
          <stop offset="100%" stop-color="#27124a"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="40" fill="url(#bg)"/>
      <ellipse cx="128" cy="226" rx="72" ry="14" fill="#05030a" opacity="0.45"/>
      <path d="M74 214c16-54 44-84 54-84s38 30 54 84Z" fill="${cape}" opacity="0.9"/>
      <rect x="${128 - shoulders / 2}" y="134" width="${shoulders}" height="74" rx="24" fill="${torso}"/>
      <rect x="108" y="116" width="40" height="32" rx="16" fill="${config.skinTone}"/>
      <path d="M82 98c0-28 21-50 46-50s46 22 46 50v12c0 26-21 47-46 47s-46-21-46-47Z" fill="${config.skinTone}"/>
      <path d="M${92 - hairSides} ${hairTop}c15-14 36-22 59-22 24 0 45 8 60 22v58c-12-8-21-12-32-14-13-3-31-4-54 0-13 2-23 7-33 14Z" fill="${config.hairColor}"/>
      ${extraHair}
      <circle cx="109" cy="106" r="5" fill="${config.eyeColor}"/>
      <circle cx="147" cy="106" r="5" fill="${config.eyeColor}"/>
      <path d="${mouth}" stroke="#5c2d24" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M128 99c3 8 4 15 3 22" stroke="#a86a50" stroke-width="3" stroke-linecap="round"/>
      <path d="M95 82c7-9 18-14 33-14 17 0 31 6 40 17" stroke="${config.hairColor}" stroke-width="${jaw}" stroke-linecap="round" opacity="0.9"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
