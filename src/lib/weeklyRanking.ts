const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function parseWeekStart(value?: string | null): Date {
  if (!value) return getCurrentWeekStartUtc();
  const normalized = value.includes("T") ? value : `${value}T00:00:00Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return getCurrentWeekStartUtc();
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function getCurrentWeekStartUtc(now = new Date()): Date {
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utcMidnight.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - daysSinceMonday);
  return utcMidnight;
}

export function getWeekEndExclusive(weekStart: Date): Date {
  return new Date(weekStart.getTime() + WEEK_MS);
}

export function getWeekEndInclusive(weekStart: Date): Date {
  return new Date(getWeekEndExclusive(weekStart).getTime() - 1000);
}

export function formatWeekShort(value?: string | null): string {
  const weekStart = parseWeekStart(value);
  return weekStart.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatWeekRange(value?: string | null): string {
  const weekStart = parseWeekStart(value);
  const weekEnd = getWeekEndInclusive(weekStart);
  const start = weekStart.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const end = weekEnd.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return `${start} -> ${end}`;
}

export function getRemainingMsUntilWeekEnd(value?: string | null, now = new Date()): number {
  const weekEnd = getWeekEndExclusive(parseWeekStart(value));
  return Math.max(0, weekEnd.getTime() - now.getTime());
}

export function formatDurationCompact(milliseconds: number, withSeconds = true): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${days}j ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return withSeconds ? `${base} ${String(seconds).padStart(2, "0")}s` : base;
}
