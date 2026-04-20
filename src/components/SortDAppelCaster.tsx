/**
 * Bouton unique de sorts d'appel séquentiels.
 *
 * La spec produit (PR F) remplace les 3 boutons indépendants (I/II/III)
 * par un **seul** bouton qui cycle dans l'ordre :
 *
 *   clic 1 → Sort I   (cooldown 10 s)
 *   clic 2 → Sort II  (cooldown 25 s)
 *   clic 3 → Sort III (cooldown 60 s)
 *   clic 4 → Sort IV  (cooldown 120 s)
 *   puis boucle au Sort I.
 *
 * Pendant le cooldown du sort qui vient d'être lancé, le bouton est
 * désactivé (impossible de lancer plusieurs sorts en même temps — c'est
 * aussi pour ça que la spec produit un bouton unique et non plus un
 * bouton par niveau). À la fin du cooldown le bouton réapparaît avec
 * le niveau suivant.
 */
import { useEffect, useMemo, useState } from "react";
import { Flame, Sparkles, Wand2, Crown } from "lucide-react";

/** Niveau de sort disponible. */
export type SortLevel = 1 | 2 | 3 | 4;

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
  {
    level: 4,
    label: "Sort IV",
    cooldownMs: 120_000,
    tone: "text-sky-200 ring-sky-400/50 hover:bg-sky-500/15",
    icon: <Crown className="h-3.5 w-3.5" />,
  },
];

interface Props {
  /**
   * Callback déclenché quand un sort part. Le parent décide quoi faire
   * (annonce chat, particule, etc.). Si le parent refuse (pas connecté),
   * il doit retourner `false` pour qu'on **n'arme pas** le cooldown et
   * qu'on ne progresse pas dans la séquence.
   */
  onCast: (level: SortLevel) => boolean | void;
  /** Désactive toute interaction (ex. pas connecté). */
  disabled?: boolean;
}

export function SortDAppelCaster({ onCast, disabled }: Props) {
  // Index (0..SORT_LEVELS.length-1) du prochain sort à lancer. On boucle
  // au bout. La progression n'a lieu **qu'après** que le parent a accepté
  // le sort (retour ≠ false) ET que le cooldown est armé — pour que, si
  // l'utilisateur n'est pas connecté, on ne sauterait pas silencieusement
  // au niveau suivant sans rien avoir lancé.
  const [nextIndex, setNextIndex] = useState(0);
  /** Timestamp (ms) jusqu'auquel le bouton reste grisé (cooldown global). */
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const nextTier = SORT_LEVELS[nextIndex];

  // Tick 250 ms pour rafraîchir l'affichage du minuteur. Stoppé dès que
  // plus aucun cooldown n'est actif pour ne pas re-render inutilement.
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooldownUntil, now]);

  const remaining = Math.max(0, cooldownUntil - now);
  const locked = remaining > 0;
  const secs = Math.ceil(remaining / 1000);

  // Le sort "en cours de cooldown" est celui qu'on vient de lancer —
  // donc l'entrée précédente par rapport à `nextIndex` dans la séquence.
  const castingTier = useMemo(() => {
    if (!locked) return null;
    const castedIndex =
      (nextIndex - 1 + SORT_LEVELS.length) % SORT_LEVELS.length;
    return SORT_LEVELS[castedIndex];
  }, [locked, nextIndex]);

  function handleClick() {
    if (disabled || locked) return;
    const accepted = onCast(nextTier.level);
    if (accepted === false) return;
    setCooldownUntil(Date.now() + nextTier.cooldownMs);
    setNextIndex((i) => (i + 1) % SORT_LEVELS.length);
  }

  const visibleTier = castingTier ?? nextTier;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || locked}
      aria-label={
        locked
          ? `${visibleTier.label} en cooldown (${secs} s restants)`
          : `Lancer ${visibleTier.label} (cooldown ${Math.round(visibleTier.cooldownMs / 1000)} s)`
      }
      title={
        locked
          ? `Prochain sort : ${nextTier.label} (cooldown ${Math.round(nextTier.cooldownMs / 1000)} s)`
          : undefined
      }
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night-900/40 px-3 py-1.5 text-xs ring-1 backdrop-blur transition ${visibleTier.tone} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-night-900/40`}
    >
      {visibleTier.icon}
      <span>{visibleTier.label}</span>
      {locked ? (
        <span className="tabular-nums text-ivory/70">· {secs}s</span>
      ) : (
        <span className="text-ivory/40">
          · {Math.round(visibleTier.cooldownMs / 1000)}s
        </span>
      )}
    </button>
  );
}
