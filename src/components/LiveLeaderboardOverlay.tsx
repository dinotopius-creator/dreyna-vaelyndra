/**
 * Top 3 Sylvins du live en surimpression (coin haut-gauche du cadre vidéo).
 *
 * La cour voit en temps réel qui soutient le plus le streamer pendant la
 * séance. Le rang se recompose dès qu'un cadeau arrive ; le passage d'un
 * position à l'autre est animé (cadeau = "couronnement").
 *
 * Le composant est 100% visuel : le parent lui passe la liste agrégée des
 * Sylvins donnés pendant la séance en cours (reset au changement de
 * broadcaster via un `key={broadcasterId}` côté parent).
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Trophy, Sparkles } from "lucide-react";

/**
 * Une contribution agrégée : un utilisateur + le total Sylvins offerts
 * pendant la séance en cours.
 */
export interface TributeEntry {
  userId: string;
  name: string;
  avatar?: string;
  total: number;
}

interface Props {
  entries: TributeEntry[];
  /**
   * "overlay" : surimpression coin haut-gauche du cadre vidéo (ancien
   * comportement, encore utilisé en plein écran).
   * "panel"   : rendu statique dans une carte hors du player (mode
   * normal — on ne salit plus la vidéo).
   */
  variant?: "overlay" | "panel";
}

const RANK_STYLES = [
  {
    chip: "bg-gold-400/25 ring-gold-300/70 text-gold-100",
    icon: <Crown className="h-3.5 w-3.5 text-gold-200" />,
    label: "Top 1",
  },
  {
    chip: "bg-ivory/20 ring-ivory/60 text-ivory",
    icon: <Trophy className="h-3.5 w-3.5 text-ivory/90" />,
    label: "Top 2",
  },
  {
    chip: "bg-rose-500/20 ring-rose-300/60 text-rose-100",
    icon: <Sparkles className="h-3.5 w-3.5 text-rose-200" />,
    label: "Top 3",
  },
];

export function LiveLeaderboardOverlay({
  entries,
  variant = "overlay",
}: Props) {
  // On trie et on coupe à 3. Les totaux nuls sont exclus (jusqu'à ce
  // qu'il y en ait vraiment un, pas d'affichage "0 Sylvins").
  const top3 = useMemo(
    () =>
      [...entries]
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
    [entries],
  );

  // Le panneau (variant="panel") s'affiche même vide pour réserver une
  // place visuelle stable à côté du titre du live ; la version overlay
  // reste invisible tant qu'il n'y a pas de soutien (pas de bandeau
  // vide en surimpression de la vidéo).
  if (top3.length === 0 && variant === "overlay") return null;

  const wrapperClass =
    variant === "overlay"
      ? "pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1.5"
      : "flex flex-col gap-2";
  const headerClass =
    variant === "overlay"
      ? "rounded-full bg-night-900/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-gold-200 backdrop-blur"
      : "text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-200";

  return (
    <div className={wrapperClass}>
      <div className={headerClass}>Top soutiens</div>
      {top3.length === 0 && variant === "panel" && (
        <p className="text-xs text-ivory/55">
          Personne n'a encore offert de Sylvins sur ce live. Sois le premier ✨
        </p>
      )}
      <AnimatePresence initial={false}>
        {top3.map((entry, i) => {
          const style = RANK_STYLES[i];
          return (
            <motion.div
              key={entry.userId}
              layout
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.35 }}
              className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs ring-1 backdrop-blur ${style.chip}`}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {style.icon}
              </span>
              {entry.avatar ? (
                <img
                  src={entry.avatar}
                  alt=""
                  className="h-5 w-5 rounded-full ring-1 ring-night-900/60"
                />
              ) : null}
              <span className="max-w-[110px] truncate font-medium">
                {entry.name}
              </span>
              <span className="ml-1 tabular-nums text-ivory/90">
                {formatSylvins(entry.total)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Format compact pour le chip : 1 234 / 12,3k / 1,2M. Les formatters
 * existants (`formatSylvins` de `lib/sylvins.ts`) retournent "X S" —
 * trop verbeux ici. On garde juste le nombre + suffixe k/M.
 */
function formatSylvins(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
