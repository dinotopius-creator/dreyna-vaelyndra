import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { LiveRegistryEntry } from "../contexts/LiveContext";
import { getLiveCategory } from "../data/liveCategories";

/**
 * PR T — Bandeau horizontal « D'autres lives en cours » sous le player.
 *
 * Alimenté par le `liveRegistry` de `LiveContext`. Exclut le live courant
 * pour n'afficher que les *autres*. Si aucun autre live, le composant ne
 * rend rien (retour `null`) : on ne veut pas polluer la vue avec un bloc
 * vide quand il n'y a qu'un live en cours.
 *
 * Le clic sur une carte navigue vers `/live/:userId` via un `<Link>`
 * classique React Router : le switch de broadcaster se fait dans la même
 * page, sans rechargement, et `Live.tsx` reset son chat/leaderboard sur
 * le changement de `broadcasterId`.
 */
export function OtherLivesStrip({
  currentBroadcasterId,
  liveRegistry,
}: {
  currentBroadcasterId: string;
  liveRegistry: Record<string, LiveRegistryEntry>;
}) {
  const others = useMemo(() => {
    return Object.values(liveRegistry)
      .filter((e) => e.userId !== currentBroadcasterId)
      .sort((a, b) => {
        // Les lives les plus récents en premier : un viewer qui cherche
        // « quoi regarder d'autre » a plus de chance de trouver une
        // séance fraîche en tête de liste.
        const ta = new Date(a.startedAt).getTime();
        const tb = new Date(b.startedAt).getTime();
        return tb - ta;
      });
  }, [liveRegistry, currentBroadcasterId]);

  if (others.length === 0) return null;

  return (
    <section
      aria-label="Autres lives en cours"
      className="mt-6 rounded-2xl border border-gold-400/20 bg-night-900/40 p-4 backdrop-blur"
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">
          <Radio className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-ivory/80">
          Autres lives en cours
        </h3>
        <span className="ml-auto text-xs text-ivory/50">
          {others.length} en direct
        </span>
      </header>
      <div
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {others.map((entry) => {
          const cat = getLiveCategory(entry.category);
          return (
            <motion.div
              key={entry.userId}
              whileHover={{ y: -2 }}
              className="shrink-0 snap-start"
            >
              <Link
                to={`/live/${entry.userId}`}
                className="group block w-48 overflow-hidden rounded-xl border border-gold-400/30 bg-night-800/60 transition hover:border-gold-300/60 hover:bg-night-800"
                aria-label={`Rejoindre le live de ${entry.username} : ${entry.title}`}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-night-900">
                  <img
                    src={entry.avatar}
                    alt=""
                    className="h-full w-full object-cover opacity-60 transition group-hover:opacity-80"
                    loading="lazy"
                  />
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-100 backdrop-blur">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
                    Live
                  </div>
                  <div
                    className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur ${cat.chipClass}`}
                  >
                    {cat.icon} {cat.label}
                  </div>
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium text-ivory/90 group-hover:text-gold-100">
                    {entry.title || "Sans titre"}
                  </p>
                  <p className="truncate text-xs text-ivory/60">
                    {entry.username}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
