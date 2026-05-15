export function resizeImageToDataUrl(
  file: Blob,
  maxSize = 256,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const src = reader.result;
      if (typeof src !== "string") {
        reject(new Error("not a data url"));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        const scale = longest > maxSize ? maxSize / longest : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no canvas ctx"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e instanceof Error ? e : new Error("encode failed"));
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string) {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((d - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatPrice(amount: number, currency = "€") {
  if (currency === "Lueurs") {
    return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} Lueurs`;
  }
  return `${amount.toFixed(2).replace(".", ",")} ${currency}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function generateId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readingTime(text: string) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function renderMarkdown(md: string) {
  // Tiny markdown helper (bold + paragraphs). Safe for static content.
  return md
    .split(/\n\n+/)
    .map((p) =>
      p
        .replace(/\*\*(.+?)\*\*/g, "<strong class='text-gold-200'>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>"),
    );
}

export type VideoEmbed =
  | { kind: "youtube"; embedUrl: string; originalUrl: string }
  | { kind: "tiktok"; embedUrl: string; originalUrl: string }
  | { kind: "file"; src: string; originalUrl: string }
  | { kind: "unknown"; originalUrl: string };

const UNSUPPORTED_POST_IMAGE_HOSTS = new Set([
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "facebook.com",
]);

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function isDataImageUrl(value: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

export type PostImageSource =
  | { kind: "image"; src: string }
  | { kind: "external"; url: string; hostname: string }
  | { kind: "invalid"; url: string };

export function parsePostImageUrl(raw: string): PostImageSource | null {
  const value = raw.trim();
  if (!value) return null;
  if (isDataImageUrl(value)) {
    return { kind: "image", src: value };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { kind: "invalid", url: value };
    }
    const hostname = normalizeHostname(url.hostname);
    if (UNSUPPORTED_POST_IMAGE_HOSTS.has(hostname)) {
      return { kind: "external", url: value, hostname };
    }
    return { kind: "image", src: value };
  } catch {
    return { kind: "invalid", url: value };
  }
}

function preloadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export async function validatePostImageUrl(raw: string): Promise<
  | { ok: true; normalized: string }
  | { ok: false; message: string }
> {
  const parsed = parsePostImageUrl(raw);
  if (!parsed) {
    return { ok: false, message: "Ajoute une URL d'image valide." };
  }
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      message: "L'URL d'image est invalide. Utilise un lien http(s) direct.",
    };
  }
  if (parsed.kind === "external") {
    return {
      ok: false,
      message:
        "Ce lien pointe vers une page sociale, pas vers une image directe. Utilise une vraie image .jpg, .png ou .webp.",
    };
  }

  const loads = await preloadImage(parsed.src);
  if (!loads) {
    return {
      ok: false,
      message:
        "Cette URL ne charge pas comme une image. Utilise une image directe accessible publiquement.",
    };
  }

  return { ok: true, normalized: parsed.src };
}

export function parseVideoUrl(raw: string): VideoEmbed | null {
  const url = raw.trim();
  if (!url) return null;

  // YouTube: https://www.youtube.com/watch?v=XXX / https://youtu.be/XXX / /shorts/XXX
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  if (ytMatch) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
      originalUrl: url,
    };
  }

  // TikTok: https://www.tiktok.com/@user/video/1234567890
  const tkMatch = url.match(/tiktok\.com\/(?:@[\w.-]+\/video|embed\/v2)\/(\d+)/);
  if (tkMatch) {
    return {
      kind: "tiktok",
      embedUrl: `https://www.tiktok.com/embed/v2/${tkMatch[1]}`,
      originalUrl: url,
    };
  }

  // Direct video files (MP4, WebM, MOV, OGG)
  if (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(url)) {
    return { kind: "file", src: url, originalUrl: url };
  }

  return { kind: "unknown", originalUrl: url };
}
