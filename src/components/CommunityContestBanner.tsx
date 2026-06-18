import { Clock3, Gift, Megaphone, Trophy, Hash, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { COMMUNITY_DRAWING_CONTEST, drawingContestEndsIn } from "../data/communityContest";
import { formatRelative } from "../lib/helpers";

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}h ${minutes
    .toString()
    .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
}

export function CommunityContestBanner({
  compact = false,
  showWhenInactive = true,
}: {
  compact?: boolean;
  showWhenInactive?: boolean;
}) {
  const remaining = drawingContestEndsIn();
  const active = remaining > 0;

  if (!active && !showWhenInactive) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[30px] border border-gold-300/25 bg-night-950/80 shadow-[0_20px_70px_rgba(0,0,0,0.35)]"
    >
      <Link
        to="/communaute/hashtag/concoursdessin"
        className="relative block"
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{ backgroundImage: `url(${COMMUNITY_DRAWING_CONTEST.bannerImage})` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.22),transparent_30%),linear-gradient(135deg,rgba(8,10,20,0.96),rgba(22,16,38,0.94))]" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300/35 bg-gold-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-100">
              <Megaphone className="h-3.5 w-3.5" />
              Annonce officielle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-100">
              <Hash className="h-3.5 w-3.5" />
              #concoursdessin
            </span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr,0.7fr] lg:items-end">
            <div className="space-y-3">
              <h2 className="font-display text-3xl text-gold-100 sm:text-4xl">
                Concours de dessin de la communauté
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-ivory/78">
                Crée un post avec ton dessin et le hashtag obligatoire{" "}
                <span className="font-semibold text-gold-100">#concoursdessin</span>.
                Le post le plus liké à la fin des 24 heures gagne{" "}
                <span className="font-semibold text-gold-100">1000 lueurs</span>{" "}
                et <span className="font-semibold text-gold-100">6 nourritures familier</span>.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-ivory/70">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-gold-200" />
                  {active ? formatCountdown(remaining) : "Concours terminé"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  <Trophy className="h-3.5 w-3.5 text-gold-200" />
                  Plus de likes = victoire
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  <Gift className="h-3.5 w-3.5 text-gold-200" />
                  Récompenses côté serveur
                </span>
              </div>
            </div>
            <div className="rounded-[24px] border border-gold-300/25 bg-night-950/70 p-4 backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-200/70">
                {active ? "Temps restant" : "État"}
              </p>
              <p className="mt-2 font-display text-2xl text-gold-100">
                {active ? formatCountdown(remaining) : "Clôturé"}
              </p>
              <p className="mt-2 text-sm text-ivory/70">
                {active
                  ? "Le concours est en cours. Participe maintenant."
                  : `L'annonce est conservée en archive pendant ${formatRelative(COMMUNITY_DRAWING_CONTEST.endsAt)}.`}
              </p>
              {!compact && (
                <div className="mt-4 rounded-2xl border border-gold-300/20 bg-gold-500/10 p-3 text-xs text-ivory/78">
                  <p className="font-semibold text-gold-100">Règles rapides</p>
                  <ul className="mt-2 space-y-1.5">
                    {COMMUNITY_DRAWING_CONTEST.rules.map((rule) => (
                      <li key={rule}>• {rule}</li>
                    ))}
                  </ul>
                </div>
              )}
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-200">
                Voir les participations <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.section>
  );
}
