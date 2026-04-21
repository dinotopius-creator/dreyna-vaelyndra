/**
 * Classement hebdomadaire des streamers par Sylvins reçus.
 *
 * Architecture :
 * - Source de vérité = backend (`/streamers/leaderboard`). On poll toutes
 *   les 10 s pour rester en ~quasi-temps-réel sans ouvrir une vraie
 *   WebSocket (cohérent avec le pattern `ProfileContext` de PR 1).
 * - Polling "this" = court (10 s). Polling "last" = désactivé (snapshot
 *   figé côté backend, pas la peine de retaper).
 * - Le parent peut passer un `refreshTick` pour forcer un refetch immédiat
 *   après un gift envoyé (mise à jour "instantanée" perçue).
 *
 * Visuel :
 * - Podium Top 1/2/3 en haut (médaillons avec glow + icône 🥇🥈🥉).
 * - Liste compacte Top 4–50 en dessous (scroll vertical, hauteur bornée).
 * - Chaque ligne/médaillon est un `<Link>` vers le profil du streamer.
 * - Animations Framer Motion `layout` pour interpoler les changements de
 *   rang au fil des dons (effet "rise").
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Sparkles, Trophy } from "lucide-react";
import {
  apiGetStreamerLeaderboard,
  type StreamerLeaderboardEntryDto,
} from "../lib/api";
import { formatNumber } from "../lib/helpers";
import { CreatureBadge, RoleBadge } from "./UserBadges";
import StreamerGradeBadge from "./StreamerGradeBadge";

type Period = "this" | "last";

interface Props {
  /**
   * Si défini, un tick croissant force un refetch immédiat (appelé par le
   * parent quand il sait qu'un cadeau vient d'être envoyé).
   */
  refreshTick?: number;
}

const PERIOD_LABELS: Record<Period, string> = {
  this: "Cette semaine",
  last: "Semaine dernière",
};

// Podium metadata — couleurs + label emoji. Classés par rang.
const PODIUM_STYLES: Array<{
  ring: string;
  halo: string;
  chip: string;
  medal: string;
}> = [
  {
    ring: "ring-gold-400/80",
    halo: "shadow-[0_0_32px_rgba(250,204,21,0.45)]",
    chip: "bg-gold-500/25 text-gold-100 border-gold-400/60",
    medal: "🥇",
  },
  {
    ring: "ring-slate-200/70",
    halo: "shadow-[0_0_26px_rgba(226,232,240,0.35)]",
    chip: "bg-slate-300/20 text-slate-100 border-slate-200/50",
    medal: "🥈",
  },
  {
    ring: "ring-amber-600/70",
    halo: "shadow-[0_0_24px_rgba(217,119,6,0.35)]",
    chip: "bg-amber-700/20 text-amber-100 border-amber-500/50",
    medal: "🥉",
  },
];

const POLL_MS_THIS = 10_000; // temps réel « doux » pour la semaine courante
const POLL_MS_LAST = 0; // snapshot figé — pas de polling

export function StreamerLeaderboard({ refreshTick }: Props) {
  const [period, setPeriod] = useState<Period>("this");
  const [entries, setEntries] = useState<StreamerLeaderboardEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>("");

  const fetchNow = useCallback(async (target: Period) => {
    try {
      const data = await apiGetStreamerLeaderboard(target, 50);
      setEntries(data.entries);
      setWeekStart(data.weekStart);
      setError(null);
    } catch (err) {
      console.warn("Classement streamers indisponible", err);
      setError("Classement indisponible pour l'instant.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchNow(period);
    const interval = period === "this" ? POLL_MS_THIS : POLL_MS_LAST;
    if (!interval) return;
    const id = window.setInterval(() => void fetchNow(period), interval);
    return () => window.clearInterval(id);
  }, [period, fetchNow]);

  useEffect(() => {
    if (refreshTick === undefined) return;
    void fetchNow(period);
  }, [refreshTick, period, fetchNow]);

  const [podium, rest] = useMemo(() => {
    return [entries.slice(0, 3), entries.slice(3, 50)];
  }, [entries]);

  return (
    <div className="card-royal overflow-hidden p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Trophy className="h-4 w-4 text-gold-300" />
        <h3 className="font-display text-lg text-gold-200">
          Classement des Streamers
        </h3>
        {weekStart && (
          <span className="ml-auto font-regal text-[10px] tracking-[0.22em] text-ivory/45">
            Sem. du {formatWeekShort(weekStart)}
          </span>
        )}
      </header>

      <div
        className="mt-3 inline-flex rounded-full border border-gold-400/30 bg-night-900/60 p-1"
        role="tablist"
        aria-label="Période du classement"
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1 text-[11px] font-regal tracking-[0.18em] transition ${
              period === p
                ? "bg-gold-500/25 text-gold-100 shadow-[0_0_12px_rgba(250,204,21,0.25)]"
                : "text-ivory/60 hover:text-ivory/90"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-ivory/55">
          Convocation de la cour...
        </p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-rose-300/80">{error}</p>
      )}

      {/* Podium Top 1/2/3 */}
      {podium.length > 0 && (
        <ol className="mt-5 grid grid-cols-3 items-end gap-2">
          {[1, 0, 2].map((idx) => {
            const entry = podium[idx];
            if (!entry) return <li key={`ghost-${idx}`} />;
            const style = PODIUM_STYLES[idx];
            const size =
              idx === 0 ? "h-20 w-20" : idx === 1 ? "h-16 w-16" : "h-14 w-14";
            const pedestalH = idx === 0 ? "h-20" : idx === 1 ? "h-14" : "h-10";
            return (
              <motion.li
                key={entry.userId}
                layout
                layoutId={`podium-${entry.userId}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="flex flex-col items-center"
              >
                <Link
                  to={`/u/${entry.userId}`}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <span className="text-xl" aria-hidden>
                    {style.medal}
                  </span>
                  <div
                    className={`relative rounded-full ${style.halo} ring-2 ${style.ring} transition-transform group-hover:scale-105`}
                  >
                    <img
                      src={entry.avatarImageUrl || FALLBACK_AVATAR}
                      alt={entry.username}
                      className={`${size} rounded-full object-cover`}
                      loading="lazy"
                    />
                  </div>
                  <p className="max-w-[7rem] truncate text-center font-display text-xs text-ivory/95 group-hover:text-gold-100">
                    {entry.username}
                  </p>
                </Link>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-regal tracking-[0.18em] ${style.chip}`}
                >
                  <Sparkles className="h-3 w-3" />
                  {formatNumber(entry.totalSylvins)}
                </span>
                <div
                  className={`mt-2 w-full ${pedestalH} rounded-t-xl border-x border-t border-gold-400/20 bg-gradient-to-t from-gold-500/15 via-gold-500/5 to-transparent`}
                  aria-hidden
                />
              </motion.li>
            );
          })}
        </ol>
      )}

      {/* Top 4–50 compact */}
      {rest.length > 0 && (
        <ol className="mt-4 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {rest.map((entry) => (
              <motion.li
                key={entry.userId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <Link
                  to={`/u/${entry.userId}`}
                  className="flex items-center gap-3 rounded-lg border border-transparent bg-night-900/30 px-2 py-1.5 text-sm transition hover:border-gold-400/40 hover:bg-night-900/60"
                >
                  <span className="w-7 shrink-0 text-center font-display text-xs text-ivory/55">
                    #{entry.rank}
                  </span>
                  <img
                    src={entry.avatarImageUrl || FALLBACK_AVATAR}
                    alt={entry.username}
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-gold-400/30"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-display text-xs text-ivory/90">
                        {entry.username}
                      </p>
                      {entry.role === "admin" && (
                        <Crown className="h-3 w-3 shrink-0 text-gold-300" />
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {entry.creature && (
                        <CreatureBadge
                          creatureId={entry.creature.id}
                          size="sm"
                        />
                      )}
                      {entry.role === "animator" && (
                        <RoleBadge role={entry.role} size="sm" />
                      )}
                      {entry.grade && (
                        <StreamerGradeBadge grade={entry.grade} size="sm" />
                      )}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full border border-gold-400/30 bg-night-900/50 px-2 py-0.5 text-[10px] font-regal tracking-[0.16em] text-gold-100">
                    <Sparkles className="h-3 w-3" />
                    {formatNumber(entry.totalSylvins)}
                  </span>
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="mt-6 text-center text-sm text-ivory/55">
          {period === "this"
            ? "La couronne est encore vacante — les premiers dons ouvriront le classement."
            : "Aucun don scellé la semaine passée."}
        </p>
      )}
    </div>
  );
}

const FALLBACK_AVATAR =
  "https://api.dicebear.com/7.x/shapes/svg?seed=vaelyndra";

function formatWeekShort(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}
