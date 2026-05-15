import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Radio, Sparkles, Trophy, Video } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { SectionHeading } from "../components/SectionHeading";
import { StreamerLeaderboard } from "../components/StreamerLeaderboard";
import { BFFModule } from "../components/BFFModule";
import { LIVE_CATEGORIES, getLiveCategory } from "../data/liveCategories";
import { formatRelative } from "../lib/helpers";

export function LiveHub() {
  const { user } = useAuth();
  const { liveRegistry } = useLive();
  const lives = useMemo(
    () =>
      Object.values(liveRegistry).sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [liveRegistry],
  );
  const featured = lives[0] ?? null;
  const categoriesWithLives = useMemo(
    () =>
      LIVE_CATEGORIES.map((category) => ({
        category,
        lives: lives.filter(
          (entry) => getLiveCategory(entry.category).id === category.id,
        ),
      })),
    [lives],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Lives publics"
        title={
          <>
            La salle des <span className="text-mystic">lives</span>
          </>
        }
        subtitle="Retrouvez tous les directs en cours, les classements et les streamers qui font vibrer Vaelyndra."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr,0.65fr]">
        <section className="overflow-hidden rounded-2xl border border-royal-500/30 bg-night-900/55">
          {featured ? (
            <Link to={`/live/${featured.userId}`} className="group block">
              <div className="relative min-h-[340px] overflow-hidden">
                <img
                  src={featured.avatar}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-45 blur-sm transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/70 to-night-900/20" />
                <div className="relative flex min-h-[340px] flex-col justify-end p-5 sm:p-8">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-rose-500/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-100">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
                      En direct
                    </span>
                    {(() => {
                      const cat = getLiveCategory(featured.category);
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${cat.chipClass}`}
                        >
                          <span aria-hidden>{cat.icon}</span>
                          {cat.label}
                        </span>
                      );
                    })()}
                  </div>
                  <h2 className="font-display text-2xl text-gold-200 sm:text-5xl">
                    {featured.title || `${featured.username} est en direct`}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm text-ivory/75">
                    {featured.description ||
                      `Rejoignez ${featured.username} dans son live Vaelyndra.`}
                  </p>
                  <div className="mt-5 flex flex-col items-start gap-3 text-sm text-ivory/80 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={featured.avatar}
                        alt={featured.username}
                        className="h-9 w-9 rounded-full border border-gold-400/40 object-cover"
                      />
                      {featured.username}
                    </span>
                    <span>{formatRelative(featured.startedAt)}</span>
                    <span className="inline-flex items-center gap-1.5 text-gold-200">
                      Regarder <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
              <Radio className="h-12 w-12 text-royal-300" />
              <h2 className="mt-4 font-display text-3xl text-gold-200">
                Aucun live en cours
              </h2>
              <p className="mt-2 max-w-md text-sm text-ivory/65">
                Les prochains directs apparaîtront ici avec leurs catégories,
                leurs streamers et les accès rapides.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Link
            to={user ? "/live/studio" : "/connexion"}
            className="block rounded-2xl border border-gold-400/30 bg-gold-500/10 p-5 transition hover:border-gold-300/70 hover:bg-gold-500/15"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-shine text-night-900">
                <Video className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-lg text-gold-100">
                  Espace streamer
                </p>
                <p className="text-xs text-ivory/65">
                  Lance ton live, règle ton mode et gère ta scène.
                </p>
              </div>
            </div>
          </Link>

          <div className="rounded-2xl border border-royal-500/30 bg-night-900/50 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-300" />
              <h3 className="font-display text-lg text-gold-200">
                À suivre maintenant
              </h3>
            </div>
            <p className="mt-2 text-sm text-ivory/65">
              {lives.length > 0
                ? `${lives.length} live${lives.length > 1 ? "s" : ""} actif${
                    lives.length > 1 ? "s" : ""
                  } dans le royaume.`
                : "Les recommandations se rempliront dès que les streamers seront en direct."}
            </p>
          </div>
        </aside>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-rose-300" />
          <h2 className="font-display text-2xl text-gold-200">
            Fil live par catégorie
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {categoriesWithLives.map(({ category, lives: categoryLives }) => {
            const pinned = categoryLives[0] ?? null;
            return (
              <section
                key={category.id}
                className="rounded-2xl border border-royal-500/25 bg-night-900/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${category.chipClass}`}
                    >
                      <span aria-hidden>{category.icon}</span>
                      {category.label}
                    </span>
                    <p className="mt-2 text-xs text-ivory/55">
                      {category.description}
                    </p>
                  </div>
                  <span className="text-xs text-ivory/45">
                    {categoryLives.length}
                  </span>
                </div>
                {pinned ? (
                  <Link
                    to={`/live/${pinned.userId}`}
                    className="group mt-4 block overflow-hidden rounded-xl border border-gold-400/25 bg-night-800/65 transition hover:border-gold-300/60"
                  >
                    <div className="relative aspect-video overflow-hidden bg-night-900">
                      <img
                        src={pinned.avatar}
                        alt=""
                        className="h-full w-full object-cover opacity-60 transition group-hover:scale-105 group-hover:opacity-75"
                      />
                      <span className="absolute left-2 top-2 rounded-full border border-rose-400/50 bg-rose-500/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-100">
                        Épinglé
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate font-display text-sm text-gold-200">
                        {pinned.title || `${pinned.username} est en direct`}
                      </p>
                      <p className="mt-1 truncate text-xs text-ivory/55">
                        {pinned.username} · {formatRelative(pinned.startedAt)}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-4 rounded-xl border border-royal-500/20 bg-night-800/40 p-4 text-xs text-ivory/45">
                    Aucun live dans cette catégorie.
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-rose-300" />
          <h2 className="font-display text-2xl text-gold-200">
            Tous les lives en cours
          </h2>
        </div>
        {lives.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lives.map((entry, index) => {
              const cat = getLiveCategory(entry.category);
              return (
                <motion.article
                  key={entry.userId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <Link
                    to={`/live/${entry.userId}`}
                    className="group block overflow-hidden rounded-2xl border border-royal-500/30 bg-night-900/50 transition hover:border-gold-400/60"
                  >
                    <div className="relative aspect-video overflow-hidden bg-night-900">
                      <img
                        src={entry.avatar}
                        alt=""
                        className="h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105 group-hover:opacity-70"
                      />
                      <div className="absolute left-3 top-3 rounded-full border border-rose-400/50 bg-rose-500/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-100">
                        Live
                      </div>
                      <div
                        className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${cat.chipClass}`}
                      >
                        {cat.icon} {cat.label}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="truncate font-display text-lg text-gold-200">
                        {entry.title || `${entry.username} est en direct`}
                      </p>
                      <p className="mt-1 truncate text-sm text-ivory/65">
                        {entry.username} · {formatRelative(entry.startedAt)}
                      </p>
                      {entry.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-ivory/60">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-royal-500/25 bg-night-900/40 p-6 text-sm text-ivory/60">
            Aucun streamer n'est en direct pour le moment.
          </div>
        )}
      </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-2xl border border-royal-500/25 bg-night-900/35 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold-300" />
            <h2 className="font-display text-2xl text-gold-200">
              Classement live
            </h2>
          </div>
          <StreamerLeaderboard />
        </section>
        <section className="rounded-2xl border border-royal-500/25 bg-night-900/35 p-5">
          <BFFModule />
        </section>
      </div>
    </div>
  );
}
