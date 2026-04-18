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
