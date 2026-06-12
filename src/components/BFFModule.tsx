/**
 * Module BFF (Best Friend Forever) — pour chaque streamer top, son plus
 * gros donateur de tous les temps.
 *
 * Visuel : petite pile de duos "Streamer ❤️ Donateur · X Sylvins", le tout
 * cliquable vers les deux profils. Polling aligné sur le leaderboard (10 s
 * côté semaine en cours) pour que le duo se réarrange si un donateur est
 * dépassé en direct.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, ShieldCheck, Sparkles } from "lucide-react";
import { apiGetBFFs, type BFFEntryDto } from "../lib/api";
import { formatNumber } from "../lib/helpers";

interface Props {
  refreshTick?: number;
  /** Période d'agrégation des donateurs. "all" par défaut (tout-temps). */
  period?: "this" | "last" | "all";
  /** Nombre max de duos à afficher. */
  limit?: number;
}

const POLL_MS = 10_000;
const FALLBACK_AVATAR =
  "https://api.dicebear.com/7.x/shapes/svg?seed=vaelyndra-bff";

export function BFFModule({
  refreshTick,
  period = "all",
  limit = 8,
}: Props) {
  const [entries, setEntries] = useState<BFFEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNow = useCallback(async () => {
    try {
      const data = await apiGetBFFs(period, limit);
      setEntries(data);
      setError(null);
    } catch (err) {
      console.warn("BFF indisponible", err);
      setError("Module BFF indisponible.");
    } finally {
      setLoading(false);
    }
  }, [period, limit]);

  useEffect(() => {
    setLoading(true);
    void fetchNow();
    // "all" et "this" bougent en direct (nouveaux dons), "last" est figé
    // mais on garde un polling léger pour la cohérence.
    const id = window.setInterval(() => void fetchNow(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchNow]);

  useEffect(() => {
    if (refreshTick === undefined) return;
    void fetchNow();
  }, [refreshTick, fetchNow]);

  return (
    <div className="card-royal p-5">
      <header className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-rose-300" />
        <h3 className="font-display text-lg text-gold-200">BFF</h3>
        <span className="ml-auto font-regal text-[10px] tracking-[0.22em] text-ivory/45">
          Duos de membres
        </span>
      </header>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ivory/55">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-200/80" />
        Les duos BFF publics excluent les comptes staff et internes.
      </p>

      {loading && entries.length === 0 && (
        <p className="mt-4 text-center text-sm text-ivory/55">
          Alignement des duos...
        </p>
      )}
      {error && (
        <p className="mt-4 text-center text-sm text-rose-300/80">{error}</p>
      )}

      <ul className="mt-3 space-y-2.5">
        <AnimatePresence initial={false}>
          {entries.map((e, index) => (
            <motion.li
              key={`${e.streamer.id}-${e.donor.id}`}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="rounded-2xl border border-rose-400/20 bg-gradient-to-r from-rose-900/25 via-night-900/55 to-fuchsia-900/20 p-3 shadow-[0_14px_34px_rgba(10,7,25,0.28)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full border border-gold-400/25 bg-gold-500/10 px-2 py-0.5 font-regal text-[10px] tracking-[0.18em] text-gold-100/85">
                  Duo #{index + 1}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/30 bg-night-900/50 px-2 py-0.5 text-[10px] font-regal tracking-[0.16em] text-gold-100">
                  <Sparkles className="h-3 w-3" />
                  {formatNumber(e.totalSylvins)} offerts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/u/${e.streamer.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-2"
                >
                  <img
                    src={e.streamer.avatarImageUrl || FALLBACK_AVATAR}
                    alt={e.streamer.username}
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-gold-400/40 transition group-hover:ring-gold-300/80"
                    loading="lazy"
                  />
                  <p className="min-w-0 truncate font-display text-xs text-ivory/95 group-hover:text-gold-100">
                    {e.streamer.username}
                  </p>
                </Link>
                <motion.span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-rose-300/30 bg-rose-500/10 text-rose-300"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <Heart className="h-4 w-4 fill-rose-400/70" />
                </motion.span>
                <Link
                  to={`/u/${e.donor.id}`}
                  className="group flex min-w-0 flex-1 items-center justify-end gap-2"
                >
                  <p className="min-w-0 truncate text-right font-display text-xs text-ivory/95 group-hover:text-gold-100">
                    {e.donor.username}
                  </p>
                  <img
                    src={e.donor.avatarImageUrl || FALLBACK_AVATAR}
                    alt={e.donor.username}
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-rose-300/50 transition group-hover:ring-rose-200/80"
                    loading="lazy"
                  />
                </Link>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {!loading && !error && entries.length === 0 && (
        <p className="mt-4 text-center text-sm text-ivory/55">
          Aucun duo encore scellé. Les premiers dons forgeront les BFF.
        </p>
      )}
    </div>
  );
}
