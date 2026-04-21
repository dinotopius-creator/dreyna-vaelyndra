/**
 * Petits badges réutilisables pour afficher la créature et le rôle d'un user
 * (fil, profils, live, boutique, etc.). Usage groupé via `<UserBadges>` ou
 * individuel (`<CreatureBadge>`, `<RoleBadge>`).
 *
 * On prend volontairement du texte court façon "🐉 Dragon" pour tenir dans
 * les cards serrées, et une variante "dot" pour les listes denses.
 */
import { getCreature } from "../data/creatures";

export type BadgeSize = "sm" | "md";

interface CreatureBadgeProps {
  creatureId: string | null | undefined;
  size?: BadgeSize;
  /** Retire le fond/pilule, utile dans un en-tête déjà stylé. */
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

/**
 * Badge spécial :
 * - `admin` → 👑 Admin (gold shine)
 * - `animator` → 🎭 Animatrice officielle
 * - `user` ou inconnu → rien (on n'encombre pas l'UI)
 */
export function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  if (!role || role === "user") return null;
  const base =
    size === "md"
      ? "gap-1.5 px-2.5 py-1 text-xs"
      : "gap-1 px-2 py-0.5 text-[11px]";
  if (role === "admin") {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-gold-400/60 bg-gold-500/15 ${base} font-semibold text-gold-200`}
        title="Administrateur de la plateforme"
      >
        <span aria-hidden>🛡️</span>
        <span>Administrateur</span>
      </span>
    );
  }
  if (role === "animator") {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 ${base} font-semibold text-fuchsia-200`}
        title="Animateur / animatrice officiel·le Vaelyndra"
      >
        <span aria-hidden>🎭</span>
        <span>Animateur</span>
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
