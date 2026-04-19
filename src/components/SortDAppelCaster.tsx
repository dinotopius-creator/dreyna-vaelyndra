/**
 * Sorts d'appel à plusieurs niveaux avec cooldown par niveau.
 *
 * Trois paliers sont exposés (I / II / III). Un niveau plus élevé fait
 * plus de bruit (annonce marquée, particules, etc. — géré par le parent
 * via `onCast`) mais impose un cooldown plus long. Le cooldown est
 * indépendant par niveau : si on lance le niveau I, il bloque seulement
 * le bouton I ; les II/III restent disponibles (on ne peut pas spammer
 * un même niveau, mais on peut panacher).
 *
 * La fenêtre de cooldown suit la spec produit :
 *   I   → 10 s
 *   II  → 25 s
 *   III → 60 s
 *
 * Côté UI on affiche un minuteur qui décroit dans le bouton pendant le
 * cooldown, pour que l'utilisateur comprenne pourquoi il est grisé.
 */
import { useEffect, useState } from "react";
import { Flame, Sparkles, Wand2 } from "lucide-react";

/** Niveau de sort disponible. */
export type SortLevel = 1 | 2 | 3;

export const SORT_LEVELS: {
  level: SortLevel;
  label: string;
  cooldownMs: number;
  tone: string;
  icon: React.ReactNode;
}[] = [
  {
    level: 1,
    label: "Sort I",
    cooldownMs: 10_000,
    tone: "text-rose-200 ring-rose-400/40 hover:bg-rose-500/15",
    icon: <Flame className="h-3.5 w-3.5" />,
  },
  {
    level: 2,
    label: "Sort II",
    cooldownMs: 25_000,
    tone: "text-gold-200 ring-gold-400/50 hover:bg-gold-500/15",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  {
    level: 3,
    label: "Sort III",
    cooldownMs: 60_000,
    tone: "text-fuchsia-200 ring-fuchsia-400/50 hover:bg-fuchsia-500/15",
    icon: <Wand2 className="h-3.5 w-3.5" />,
  },
];

interface Props {
  /**
   * Callback déclenché quand un sort part. Le parent décide quoi faire
   * (annonce chat, particule, etc.). Si le parent refuse (pas connecté),
   * il doit retourner `false` pour qu'on **n'arme pas** le cooldown.
   */
  onCast: (level: SortLevel) => boolean | void;
  /** Désactive toute interaction (ex. pas connecté). */
  disabled?: boolean;
}

export function SortDAppelCaster({ onCast, disabled }: Props) {
  /** Timestamp (ms) jusqu'auquel chaque niveau reste en cooldown. */
  const [cooldownUntil, setCooldownUntil] = useState<Record<SortLevel, number>>(
    { 1: 0, 2: 0, 3: 0 },
  );
  const [now, setNow] = useState(() => Date.now());

  // Tick 1s pour rafraîchir l'affichage du minuteur. Arrêté tant qu'on
  // n'a aucun cooldown actif pour ne pas re-render inutilement.
  useEffect(() => {
    const anyActive = Object.values(cooldownUntil).some((t) => t > now);
    if (!anyActive) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooldownUntil, now]);

  function handle(level: SortLevel, cooldownMs: number) {
    if (disabled) return;
    const until = cooldownUntil[level];
    if (until > Date.now()) return;
    // Si le parent retourne `false`, on laisse le bouton libre (pas
    // connecté, refus du live, etc.).
    const accepted = onCast(level);
    if (accepted === false) return;
    setCooldownUntil((prev) => ({
      ...prev,
      [level]: Date.now() + cooldownMs,
    }));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SORT_LEVELS.map(({ level, label, cooldownMs, tone, icon }) => {
        const until = cooldownUntil[level];
        const remaining = Math.max(0, until - now);
        const locked = remaining > 0;
        const secs = Math.ceil(remaining / 1000);
        return (
          <button
            key={level}
            type="button"
            onClick={() => handle(level, cooldownMs)}
            disabled={disabled || locked}
            aria-label={`Lancer ${label} (cooldown ${Math.round(cooldownMs / 1000)} s)`}
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night-900/40 px-3 py-1.5 text-xs ring-1 backdrop-blur transition ${tone} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-night-900/40`}
          >
            {icon}
            <span>{label}</span>
            {locked ? (
              <span className="tabular-nums text-ivory/70">· {secs}s</span>
            ) : (
              <span className="text-ivory/40">
                · {Math.round(cooldownMs / 1000)}s
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
