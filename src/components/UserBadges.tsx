import { getCreature } from "../data/creatures";

export type BadgeSize = "sm" | "md";

interface CreatureBadgeProps {
  creatureId: string | null | undefined;
  size?: BadgeSize;
  bare?: boolean;
}

export function CreatureBadge({
  creatureId,
  size = "sm",
  bare = false,
}: CreatureBadgeProps) {
  const c = getCreature(creatureId);
  if (!c) return null;
  const base =
    size === "md"
      ? "gap-1.5 px-2.5 py-1 text-xs"
      : "gap-1 px-2 py-0.5 text-[11px]";
  if (bare) {
    return (
      <span
        className={`inline-flex items-center ${base} text-ivory/80`}
        title={c.description}
      >
        <span aria-hidden>{c.icon}</span>
        <span>{c.name}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border ${base}`}
      style={{
        borderColor: `${c.color}66`,
        background: `${c.color}14`,
        color: c.color,
      }}
      title={c.description}
    >
      <span aria-hidden>{c.icon}</span>
      <span>{c.name}</span>
    </span>
  );
}

interface RoleBadgeProps {
  role: string | null | undefined;
  size?: BadgeSize;
}

export function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  if (!role || role === "user") return null;
  const base =
    size === "md"
      ? "gap-1.5 px-2.5 py-1 text-xs"
      : "gap-1 px-2 py-0.5 text-[11px]";

  if (role === "architect") {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-gold-300/80 bg-gradient-to-r from-gold-500/30 via-sky-500/20 to-fuchsia-500/25 ${base} font-semibold text-gold-100 shadow-[0_0_18px_rgba(214,170,70,0.35)]`}
        title="Architecte Vaelyndra"
        aria-label="Badge officiel Architecte Vaelyndra"
      >
        <span aria-hidden>♛</span>
        <span>Architecte</span>
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-500/15 ${base} font-semibold text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.22)]`}
        title="Administratrice Vaelyndra"
        aria-label="Badge officiel Administratrice Vaelyndra"
      >
        <span aria-hidden>✓</span>
        <span>Administratrice</span>
      </span>
    );
  }

  if (role === "animator") {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-cyan-300/55 bg-cyan-500/12 ${base} font-semibold text-cyan-100`}
        title="Créateur officiel Vaelyndra"
        aria-label="Badge officiel Créateur Vaelyndra"
      >
        <span aria-hidden>✦</span>
        <span>Officiel</span>
      </span>
    );
  }

  return null;
}

interface UserBadgesProps {
  creatureId?: string | null;
  role?: string | null;
  size?: BadgeSize;
  className?: string;
}

export function UserBadges({
  creatureId,
  role,
  size = "sm",
  className = "",
}: UserBadgesProps) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <RoleBadge role={role} size={size} />
      <CreatureBadge creatureId={creatureId} size={size} />
    </span>
  );
}
