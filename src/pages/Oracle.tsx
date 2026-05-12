import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Gem,
  MoonStar,
  Sparkles,
  Stars,
  Wand2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import {
  ApiError,
  apiGetOracleStatus,
  apiPlayOracle,
  type OracleHistoryEntryDto,
  type OracleRewardDto,
  type OracleStatusDto,
} from "../lib/api";

const RUNES = [
  {
    key: "lune",
    name: "Lune voilee",
    text: "Une rune froide, precise, imprevisible.",
    icon: MoonStar,
    accent: "from-sky-400/35 via-cyan-300/12 to-transparent",
  },
  {
    key: "flamme",
    name: "Flamme haute",
    text: "Une pulsation vive qui attire les lueurs rapides.",
    icon: Sparkles,
    accent: "from-amber-400/35 via-gold-400/10 to-transparent",
  },
  {
    key: "couronne",
    name: "Couronne ancienne",
    text: "La plus rare. Celle que l'on choisit quand on vise grand.",
    icon: Crown,
    accent: "from-fuchsia-400/30 via-rose-300/10 to-transparent",
  },
] as const;

const TONE_STYLES: Record<string, string> = {
  soft: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  bright: "border-gold-400/35 bg-gold-500/12 text-gold-100",
  epic: "border-orange-400/35 bg-orange-500/12 text-orange-100",
  legend: "border-emerald-400/40 bg-emerald-500/14 text-emerald-100",
  void: "border-royal-500/30 bg-night-900/60 text-ivory/75",
};

export function Oracle() {
  const { user } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const [status, setStatus] = useState<OracleStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<OracleRewardDto | null>(null);
  // Tick toutes les secondes pour rafraîchir le compte-à-rebours jusqu'au
  // prochain réveil des rituels (minuit UTC).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      setLastReward(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiGetOracleStatus(user.id)
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setLastReward(next.recentHistory[0]?.reward ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(err);
        notify("Impossible de charger ton rituel pour le moment.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, user]);

  const rewardSummary = useMemo(() => {
    if (!lastReward) return null;
    if (lastReward.currency === "none") return "Le voile n'a rien livre cette fois.";
    if (lastReward.currency === "sylvins") return "Le jackpot rare est tombe.";
    return `Gain credite : ${lastReward.amount} lueurs.`;
  }, [lastReward]);

  // Compte-à-rebours jusqu'au prochain réveil des rituels (minuit UTC).
  // Quand le serveur renvoie un `nextResetAt` dans le passé (la machine du
  // user a son horloge en avance, ou on a chargé la page juste avant
  // minuit UTC et passé l'heure), on retombe sur "bientôt" pour éviter
  // d'afficher un négatif. Quand il en reste, on auto-refresh à l'arrivée
  // à 0 pour récupérer le nouveau quota côté serveur.
  const resetCountdown = useMemo(() => {
    if (!status?.nextResetAt) return null;
    const reset = Date.parse(status.nextResetAt);
    if (Number.isNaN(reset)) return null;
    const remaining = Math.max(0, reset - now);
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return {
      remaining,
      label: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    };
  }, [status?.nextResetAt, now]);

  // Quand le compte-à-rebours tombe à zéro, on resync le statut serveur
  // pour récupérer les 3 nouvelles tentatives. On guard sur `playsLeftToday`
  // à 0 pour ne pas spammer l'endpoint quand l'user a encore des tentatives.
  useEffect(() => {
    if (!user) return;
    if (!resetCountdown) return;
    if (resetCountdown.remaining > 0) return;
    if ((status?.playsLeftToday ?? 0) > 0) return;
    let cancelled = false;
    void apiGetOracleStatus(user.id).then((next) => {
      if (cancelled) return;
      setStatus(next);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resetCountdown, status?.playsLeftToday, user]);

  async function play(runeKey: string) {
    if (!user) {
      notify("Connecte-toi pour tenter le rituel.", "info");
      return;
    }
    if (!status?.canPlay) {
      notify("Tes tentatives du jour sont deja epuisees.", "info");
      return;
    }
    setPlayingKey(runeKey);
    try {
      const result = await apiPlayOracle({ userId: user.id, runeKey });
      setStatus({
        dayKey: result.dayKey,
        nextResetAt: result.nextResetAt,
        playsUsedToday: result.playsUsedToday,
        playsLeftToday: result.playsLeftToday,
        maxDailyPlays: result.maxDailyPlays,
        canPlay: result.playsLeftToday > 0,
        recentHistory: result.recentHistory,
      });
      setLastReward(result.reward);
      await refreshProfile();
      if (result.reward.currency === "sylvins") {
        notify("Oracle : 1 Sylvin ancestral credite.", "success");
      } else if (result.reward.currency === "lueurs") {
        notify(`Oracle : +${result.reward.amount} lueurs creditees.`, "success");
      } else {
        notify("Le rituel s'est referme sans recompense.", "info");
      }
    } catch (err) {
      console.warn(err);
      const message =
        err instanceof ApiError && err.status === 429
          ? "Tes 3 rituels du jour sont deja utilises."
          : "Le rituel n'a pas pu aboutir pour le moment.";
      notify(message, "error");
    } finally {
      setPlayingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <SectionHeading
        eyebrow="Rituel exclusif"
        title={
          <>
            Oracle des <span className="text-mystic">Runes</span>
          </>
        }
        subtitle="Trois runes. Trois tentatives par jour. Les Lueurs tombent souvent, le Sylvin n'arrive presque jamais."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="card-royal overflow-hidden p-6">
          <div className="relative overflow-hidden rounded-[28px] border border-gold-400/20 bg-night-950/80 p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,170,70,0.2),_transparent_48%),radial-gradient(circle_at_bottom_left,_rgba(74,52,122,0.28),_transparent_40%)]" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-regal text-[11px] tracking-[0.35em] text-gold-300">
                  RITUEL DU JOUR
                </p>
                <h3 className="mt-2 font-display text-3xl text-gold-100">
                  Choisis une rune
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-ivory/70">
                  Chaque tirage est decide par le serveur, enregistre en base et
                  credite directement ton profil.
                </p>
              </div>
              <div className="rounded-2xl border border-gold-400/20 bg-gold-500/10 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300/90">
                  Tentatives
                </p>
                <p className="mt-1 font-display text-2xl text-gold-100">
                  {user ? status?.playsLeftToday ?? "..." : "3"} / 3
                </p>
                {resetCountdown && (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-gold-300/70">
                    Reveil dans <span className="font-mono">{resetCountdown.label}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="relative mt-8 grid gap-4 md:grid-cols-3">
              {RUNES.map((rune, index) => {
                const Icon = rune.icon;
                const disabled = !user || !status?.canPlay || !!playingKey;
                const active = playingKey === rune.key;
                return (
                  <motion.button
                    key={rune.key}
                    type="button"
                    disabled={disabled}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    whileHover={disabled ? undefined : { y: -4, scale: 1.01 }}
                    whileTap={disabled ? undefined : { scale: 0.98 }}
                    onClick={() => play(rune.key)}
                    className={`group relative overflow-hidden rounded-[26px] border px-5 py-6 text-left transition ${
                      disabled
                        ? "cursor-not-allowed border-royal-500/20 bg-night-900/50 opacity-75"
                        : "border-gold-400/25 bg-night-900/70 hover:border-gold-300/55"
                    }`}
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${rune.accent}`}
                    />
                    <div className="relative">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-400/25 bg-night-950/70 text-gold-200 shadow-glow-gold">
                        <Icon className={`h-7 w-7 ${active ? "animate-pulse" : ""}`} />
                      </div>
                      <h4 className="mt-5 font-display text-xl text-gold-100">
                        {rune.name}
                      </h4>
                      <p className="mt-2 text-sm text-ivory/72">{rune.text}</p>
                      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold-400/20 bg-night-950/70 px-3 py-1 text-xs text-gold-200">
                        <Wand2 className="h-3.5 w-3.5" />
                        {active ? "Invocation..." : "Tirer cette rune"}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-[26px] border border-royal-500/25 bg-night-900/55 p-5">
              <div className="flex items-center gap-2">
                <Stars className="h-4 w-4 text-gold-300" />
                <p className="font-display text-lg text-gold-100">
                  Ce que tu peux gagner
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/8 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                    Frequent
                  </p>
                  <p className="mt-2 font-display text-xl text-sky-100">
                    15 a 40 L
                  </p>
                </div>
                <div className="rounded-2xl border border-gold-400/20 bg-gold-500/8 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-gold-200/80">
                    Rare
                  </p>
                  <p className="mt-2 font-display text-xl text-gold-100">
                    70 a 120 L
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">
                    Tres rare
                  </p>
                  <p className="mt-2 font-display text-xl text-emerald-100">
                    1 Sylvin
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-gold-400/20 bg-gold-500/8 p-5">
              <div className="flex items-center gap-2">
                <Gem className="h-4 w-4 text-gold-300" />
                <p className="font-display text-lg text-gold-100">
                  Dernier verdict
                </p>
              </div>
              <div
                className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${
                  lastReward ? TONE_STYLES[lastReward.tone] : TONE_STYLES.void
                }`}
              >
                <p className="font-medium">
                  {lastReward?.label ?? "Aucun rituel lance pour le moment."}
                </p>
                <p className="mt-2 text-xs opacity-85">
                  {rewardSummary ??
                    "Lance une rune pour recevoir le verdict de l'Oracle."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="card-royal p-5">
            <h3 className="font-display text-xl text-gold-100">
              Regles du rituel
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-ivory/75">
              <li>3 tentatives maximum par jour et par membre.</li>
              <li>Les gains sont decides cote serveur puis credites en base.</li>
              <li>
                Le Sylvin gagne ici tombe dans le pot promo : il reste depensable
                sur la plateforme, mais non retirable en euros.
              </li>
            </ul>
            {!user && (
              <div className="mt-5 rounded-2xl border border-gold-400/20 bg-gold-500/8 p-4 text-sm text-gold-100">
                Connecte-toi pour jouer et enregistrer tes recompenses.
                <div className="mt-3">
                  <Link to="/connexion" className="btn-gold inline-flex">
                    Se connecter
                  </Link>
                </div>
              </div>
            )}
            {user && (
              <div className="mt-5 rounded-2xl border border-royal-500/25 bg-night-900/55 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-gold-300/85">
                  Etat du jour
                </p>
                <p className="mt-2 font-display text-2xl text-gold-100">
                  {loading ? "..." : status?.playsLeftToday ?? 0} tentative
                  {(status?.playsLeftToday ?? 0) > 1 ? "s" : ""} restante
                  {(status?.playsLeftToday ?? 0) > 1 ? "s" : ""}
                </p>
                <p className="mt-2 text-sm text-ivory/70">
                  {status?.canPlay
                    ? "Le portail est encore ouvert pour toi aujourd'hui."
                    : "Tes runes du jour sont deja toutes utilisees."}
                </p>
                {resetCountdown && (
                  <div className="mt-3 rounded-xl border border-gold-400/25 bg-night-950/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300/85">
                      {status?.canPlay
                        ? "Prochain reset complet"
                        : "Prochain rituel dans"}
                    </p>
                    <p className="mt-1 font-mono text-xl text-gold-100">
                      {resetCountdown.label}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card-royal p-5">
            <h3 className="font-display text-xl text-gold-100">
              Historique recent
            </h3>
            <ul className="mt-4 space-y-3">
              {(status?.recentHistory ?? []).map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
              {(status?.recentHistory ?? []).length === 0 && (
                <li className="rounded-2xl border border-dashed border-royal-500/25 px-4 py-5 text-sm text-ivory/55">
                  Aucun tirage enregistre pour ce membre.
                </li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: OracleHistoryEntryDto }) {
  return (
    <li
      className={`rounded-2xl border px-4 py-3 text-sm ${TONE_STYLES[entry.reward.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{entry.reward.label}</p>
          <p className="mt-1 text-xs opacity-80">
            Rune {entry.runeKey} • {new Date(entry.createdAt).toLocaleString("fr-FR")}
          </p>
        </div>
        <span className="font-display text-lg">
          {entry.reward.currency === "none"
            ? "0"
            : `${entry.reward.amount} ${entry.reward.currency === "sylvins" ? "S" : "L"}`}
        </span>
      </div>
    </li>
  );
}
