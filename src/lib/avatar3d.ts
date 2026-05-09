export const AVATAR_3D_PREFIX = "vaelyndra3d:";

export type Avatar3DBodyType = "femme" | "homme";
export type Avatar3DFaceShape = "soft" | "sharp";
export type Avatar3DHairStyle = "bob" | "wave" | "fade" | "braids";

export interface Avatar3DConfig {
  version: 1;
  bodyType: Avatar3DBodyType;
  faceShape: Avatar3DFaceShape;
  hairStyle: Avatar3DHairStyle;
  skinTone: string;
  hairColor: string;
  eyeColor: string;
}

export const DEFAULT_AVATAR_3D_CONFIG: Avatar3DConfig = {
  version: 1,
  bodyType: "femme",
  faceShape: "soft",
  hairStyle: "wave",
  skinTone: "#f2d1bf",
  hairColor: "#2d160f",
  eyeColor: "#7fd8ff",
};

export const AVATAR_3D_SKIN_TONES = [
  "#f7dfcf",
  "#f2d1bf",
  "#d9a07a",
  "#8d593f",
] as const;

export const AVATAR_3D_HAIR_COLORS = [
  "#1c0f0d",
  "#5b331f",
  "#a56a3a",
  "#cfd8ff",
  "#8b5cf6",
  "#0f766e",
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
    unescape(encodeURIComponent(JSON.stringify({ ...config, version: 1 }))),
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
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      bodyType: parsed.bodyType === "homme" ? "homme" : "femme",
      faceShape: parsed.faceShape === "sharp" ? "sharp" : "soft",
      hairStyle:
        parsed.hairStyle === "bob" ||
        parsed.hairStyle === "fade" ||
        parsed.hairStyle === "braids"
          ? parsed.hairStyle
          : "wave",
      skinTone: typeof parsed.skinTone === "string" ? parsed.skinTone : DEFAULT_AVATAR_3D_CONFIG.skinTone,
      hairColor: typeof parsed.hairColor === "string" ? parsed.hairColor : DEFAULT_AVATAR_3D_CONFIG.hairColor,
      eyeColor: typeof parsed.eyeColor === "string" ? parsed.eyeColor : DEFAULT_AVATAR_3D_CONFIG.eyeColor,
    };
  } catch {
    return null;
  }
}

export function buildAvatar3DPosterDataUrl(config: Avatar3DConfig): string {
  const shoulders = config.bodyType === "homme" ? 82 : 74;
  const torso = config.bodyType === "homme" ? "#4338ca" : "#9d174d";
  const cape = config.bodyType === "homme" ? "#312e81" : "#6d28d9";
  const jaw = config.faceShape === "sharp" ? "14" : "21";
  const hairTop = config.hairStyle === "fade" ? 42 : 28;
  const hairSides = config.hairStyle === "bob" ? 10 : config.hairStyle === "braids" ? 4 : 14;
  const extraHair =
    config.hairStyle === "wave"
      ? `<path d="M72 118c6 14 18 24 33 30 2-23 7-43 16-60-22 3-39 13-49 30Z" fill="${config.hairColor}" opacity="0.95" />`
      : config.hairStyle === "braids"
        ? `<rect x="76" y="118" width="10" height="48" rx="5" fill="${config.hairColor}" />
           <rect x="170" y="118" width="10" height="48" rx="5" fill="${config.hairColor}" />`
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
      <path d="M121 128c4 4 10 6 14 6 4 0 10-2 14-6" stroke="#5c2d24" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M128 99c3 8 4 15 3 22" stroke="#a86a50" stroke-width="3" stroke-linecap="round"/>
      <path d="M95 82c7-9 18-14 33-14 17 0 31 6 40 17" stroke="${config.hairColor}" stroke-width="${jaw}" stroke-linecap="round" opacity="0.82"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
