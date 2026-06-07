import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brush,
  Heart,
  Leaf,
  Loader2,
  ShieldCheck,
  Sparkles,
  Timer,
  Utensils,
} from "lucide-react";
import { FamiliarPortrait } from "../components/FamiliarPortrait";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import {
  cleanFamiliarEnclosure,
  feedActiveFamiliar,
  fetchUserFamiliars,
  type FamiliarAffectionState,
  type OwnedFamiliar,
} from "../lib/familiarsApi";

const CLEANING_COOLDOWN_SECONDS = 20 * 60;
const CLEANING_ITEMS = [
  { id: "leaf-1", label: "Feuilles dorées", icon: "🍃", x: 16, y: 68 },
  { id: "dust-1", label: "Poussière de lune", icon: "✨", x: 31, y: 78 },
  { id: "trace-1", label: "Trace dans l'herbe", icon: "🌿", x: 48, y: 66 },
  { id: "toy-1", label: "Jouet renversé", icon: "🧸", x: 66, y: 75 },
  { id: "leaf-2", label: "Brindilles", icon: "🪵", x: 78, y: 56 },
  { id: "spark-1", label: "Éclat instable", icon: "💫", x: 55, y: 42 },
  { id: "dust-2", label: "Nuage de poussière", icon: "☁️", x: 25, y: 46 },
  { id: "flower-1", label: "Fleurs froissées", icon: "🌸", x: 42, y: 83 },
];

const DEFAULT_AFFECTION: FamiliarAffectionState = {
  foodStock: 0,
  affectionFeedings: 0,
  affectionHearts: 0,
  affectionMealsIntoHeart: 0,
  affectionMealsForNextHeart: 10,
  affectionMealsUntilNextHeart: 10,
  affectionRewardedHearts: [],
  heartRequirements: [10, 15, 20, 30, 45, 60, 80, 105, 135, 170],
  heartRewards: [50, 75, 100, 150, 200, 275, 350, 450, 600, 800],
};

function formatRemaining(seconds: number) {
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes.toString().padStart(2, "0")}`;
}

function cooldownFromLastCleaned(lastCleanedAt: string | null) {
  if (!lastCleanedAt) return 0;
  const last = new Date(lastCleanedAt).getTime();
  if (!Number.isFinite(last)) return 0;
  const readyAt = last + CLEANING_COOLDOWN_SECONDS * 1000;
  return Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
}

function affectionFromFamiliar(familiar: OwnedFamiliar | null): FamiliarAffectionState {
  if (!familiar) return DEFAULT_AFFECTION;
  return {
    ...DEFAULT_AFFECTION,
    foodStock: familiar.foodStock ?? 0,
    affectionFeedings: familiar.affectionFeedings ?? 0,
    affectionHearts: familiar.affectionHearts ?? 0,
    affectionMealsIntoHeart: familiar.affectionMealsIntoHeart ?? 0,
    affectionMealsForNextHeart:
      familiar.affectionMealsForNextHeart ?? DEFAULT_AFFECTION.affectionMealsForNextHeart,
    affectionMealsUntilNextHeart:
      familiar.affectionMealsUntilNextHeart ?? DEFAULT_AFFECTION.affectionMealsUntilNextHeart,
    affectionRewardedHearts: familiar.affectionRewardedHearts ?? [],
  };
}

export function FamiliarEnclosure() {
  const { user } = useAuth();
  const { profile, refresh } = useProfile();
  const { notify } = useToast();
  const [active, setActive] = useState<OwnedFamiliar | null>(null);
  const [affection, setAffection] = useState<FamiliarAffectionState>(DEFAULT_AFFECTION);
  const [loading, setLoading] = useState(true);
  const [cleaned, setCleaned] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<"clean" | "feed" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [displayedLueurs, setDisplayedLueurs] = useState(() => profile?.lueurs ?? 0);
  const [heartPulse, setHeartPulse] = useState<number | null>(null);

  useEffect(() => {
    setDisplayedLueurs(profile?.lueurs ?? 0);
  }, [profile?.lueurs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldownRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      try {
        const collection = await fetchUserFamiliars(user.id);
        const current = collection.owned.find((entry) => entry.isActive) ?? null;
        if (!cancelled) {
          setActive(current);
          setAffection(affectionFromFamiliar(current));
          const remaining = cooldownFromLastCleaned(current?.enclosureLastCleanedAt ?? null);
          setCooldownRemaining(remaining);
          if (remaining > 0) {
            setCleaned(Object.fromEntries(CLEANING_ITEMS.map((item) => [item.id, true])));
          }
        }
      } catch {
        if (!cancelled) notify("Impossible de charger l'enclos du familier.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [notify, user?.id]);

  const cleanedCount = useMemo(
    () => CLEANING_ITEMS.filter((item) => cleaned[item.id]).length,
    [cleaned],
  );
  const cleaningProgress = Math.round((cleanedCount / CLEANING_ITEMS.length) * 100);
  const onCooldown = cooldownRemaining > 0;
  const canClean = !onCooldown && !actionLoading;
  const canFeed = affection.foodStock > 0 && !actionLoading && Boolean(active);
  const nextHeartProgress =
    affection.affectionMealsForNextHeart > 0
      ? Math.round(
          (affection.affectionMealsIntoHeart / affection.affectionMealsForNextHeart) * 100,
        )
      : 100;

  async function finishCleaning(nextCleaned: Record<string, boolean>) {
    if (!user?.id || actionLoading || onCooldown) return;
    const completed = CLEANING_ITEMS.every((item) => nextCleaned[item.id]);
    if (!completed) return;
    setActionLoading("clean");
    try {
      const result = await cleanFamiliarEnclosure(user.id);
      setActive(result.familiar);
      setAffection(result.affection);
      setCooldownRemaining(result.cooldownRemainingSeconds);
      setFeedback(`${result.message} Stock de nourriture : ${result.affection.foodStock}.`);
      notify(result.message, result.foodFound > 0 ? "success" : "info");
      void refresh();
    } catch (error) {
      setCleaned({});
      const message =
        error instanceof Error
          ? error.message
          : "Le nettoyage n'a pas pu être enregistré.";
      notify(message, "error");
    } finally {
      setActionLoading(null);
    }
  }

  function cleanItem(itemId: string) {
    if (!canClean || cleaned[itemId]) return;
    setCleaned((current) => {
      const next = { ...current, [itemId]: true };
      void finishCleaning(next);
      return next;
    });
  }

  async function feedFamiliar() {
    if (!user?.id || !canFeed) {
      if (affection.foodStock <= 0) {
        notify("Vous n'avez plus de nourriture. Nettoyez l'enclos pour en trouver.", "info");
      }
      return;
    }
    setActionLoading("feed");
    try {
      const result = await feedActiveFamiliar(user.id);
      setActive(result.familiar);
      setAffection(result.affection);
      setDisplayedLueurs(result.profileLueurs);
      setFeedback(result.message);
      notify(result.message, result.heartGained ? "success" : "info");
      if (result.heartGained) {
        setHeartPulse(result.heartGained);
        window.setTimeout(() => setHeartPulse(null), 1300);
      }
      void refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de nourrir le familier.";
      notify(message, "error");
    } finally {
      setActionLoading(null);
    }
  }

  function resetEnclosure() {
    if (onCooldown || actionLoading) return;
    setCleaned({});
    setFeedback(null);
  }

  if (!user?.id) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-ivory/70">
        <p>Connectez-vous pour ouvrir l'enclos de votre familier.</p>
        <Link to="/connexion" className="btn-gold mt-4 inline-flex">
          Se connecter
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-16 text-ivory/70">
        <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
      </section>
    );
  }

  return (
    <section className="relative mx-auto max-w-6xl px-3 pb-16 pt-5 sm:px-5 sm:pt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to="/familier"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-night-950/55 px-4 py-2 text-sm text-ivory/75 backdrop-blur transition hover:border-gold-300/45 hover:text-gold-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
        <div className="rounded-full border border-gold-300/25 bg-gold-500/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gold-100">
          {displayedLueurs.toLocaleString("fr-FR")} Lueurs
        </div>
      </div>

      <div className="overflow-hidden rounded-[34px] border border-royal-500/30 bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,0.18),transparent_34%),linear-gradient(180deg,rgba(14,10,28,0.92),rgba(5,9,18,0.94))] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <header className="border-b border-white/10 px-5 py-5 sm:px-7">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold-200/75">
            Enclos du familier
          </p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-3xl text-gold-100 sm:text-5xl">
                Affection, repas et petits cœurs
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/66">
                Nettoyez l'enclos pour trouver de la nourriture, nourrissez votre
                compagnon et faites grandir son affection sur 10 cœurs.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-72">
              <StatPill label="Nourriture" value={String(affection.foodStock)} />
              <StatPill
                label="Prochain nettoyage"
                value={onCooldown ? formatRemaining(cooldownRemaining) : "Prêt"}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-5 p-4 lg:grid-cols-[1.35fr,0.65fr] lg:p-6">
          <div className="relative min-h-[560px] overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(74,222,128,0.16),transparent_28%),linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.92))] sm:min-h-[640px]">
            <div className="absolute inset-x-0 bottom-0 h-[48%] rounded-t-[50%] bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.35),rgba(20,83,45,0.2)_48%,transparent_72%)]" />
            <div className="absolute left-[8%] top-[16%] h-32 w-32 rounded-full bg-gold-200/10 blur-3xl" />
            <div className="absolute right-[10%] top-[10%] h-40 w-40 rounded-full bg-cyan-200/10 blur-3xl" />

            <motion.div
              className="absolute left-[18%] top-[18%] h-24 w-24 rounded-[34px] border border-white/10 bg-white/5"
              animate={{ y: [0, -8, 0], rotate: [0, 2, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute right-[14%] top-[24%] h-16 w-28 rounded-full border border-white/10 bg-emerald-300/10"
              animate={{ y: [0, 7, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            />

            {active ? (
              <motion.div
                className="absolute z-20 flex flex-col items-center"
                style={{ color: active.color }}
                animate={{
                  left: ["18%", "58%", "46%", "25%", "18%"],
                  top: ["52%", "45%", "66%", "70%", "52%"],
                }}
                transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              >
                <AffectionHearts
                  hearts={affection.affectionHearts}
                  pulseHeart={heartPulse}
                />
                <FamiliarPortrait familiar={active} size="lg" />
                <div className="mt-2 rounded-full border border-white/10 bg-night-950/72 px-3 py-1 text-center text-xs text-ivory/80 backdrop-blur">
                  {active.nickname || active.name}
                </div>
              </motion.div>
            ) : (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-5 text-center">
                <div className="rounded-3xl border border-white/10 bg-night-950/70 p-5 text-ivory/70 backdrop-blur">
                  Aucun familier actif. Retournez choisir votre compagnon.
                </div>
              </div>
            )}

            {CLEANING_ITEMS.map((item) => {
              const isClean = cleaned[item.id] || onCooldown;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => cleanItem(item.id)}
                  disabled={!canClean || isClean}
                  className={`absolute z-30 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border text-3xl shadow-xl backdrop-blur transition ${
                    isClean
                      ? "pointer-events-none border-emerald-200/10 bg-emerald-300/5 opacity-0"
                      : "border-amber-200/30 bg-night-950/64 hover:scale-105 active:scale-95"
                  }`}
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                  title={item.label}
                  initial={false}
                  animate={
                    isClean
                      ? { opacity: 0, scale: 0.4, rotate: 20 }
                      : { opacity: 1, scale: [1, 1.04, 1] }
                  }
                  transition={{ duration: isClean ? 0.35 : 2.8, repeat: isClean ? 0 : Infinity }}
                >
                  {item.icon}
                </motion.button>
              );
            })}

            <div className="absolute inset-x-4 bottom-4 z-40 rounded-3xl border border-white/10 bg-night-950/72 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-ivory/55">
                <span>Nettoyage</span>
                <span>
                  {cleanedCount}/{CLEANING_ITEMS.length}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-gold-200 to-cyan-200 transition-all"
                  style={{ width: `${cleaningProgress}%` }}
                />
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[26px] border border-rose-300/20 bg-rose-500/10 p-5">
              <div className="flex items-center gap-2 text-rose-100">
                <Heart className="h-4 w-4" />
                <h2 className="font-display text-xl">Cœurs d'affection</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, index) => (
                  <Heart
                    key={index}
                    className={`h-5 w-5 ${
                      index < affection.affectionHearts
                        ? "fill-rose-300 text-rose-200"
                        : "text-white/25"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-4 text-sm text-ivory/68">
                {affection.affectionHearts >= 10
                  ? "Affection maximale atteinte."
                  : `${affection.affectionMealsIntoHeart} / ${affection.affectionMealsForNextHeart} repas pour le prochain cœur.`}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-300 to-gold-200 transition-all"
                  style={{ width: `${nextHeartProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-[26px] border border-gold-300/25 bg-gold-500/10 p-5">
              <div className="flex items-center gap-2 text-gold-100">
                <Utensils className="h-4 w-4" />
                <h2 className="font-display text-xl">Nourriture</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/68">
                Stock de nourriture :{" "}
                <span className="font-semibold text-gold-100">{affection.foodStock}</span>
              </p>
              <button
                type="button"
                onClick={() => void feedFamiliar()}
                disabled={!canFeed}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-gold-300/35 bg-night-950/50 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:border-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === "feed" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Utensils className="h-4 w-4" />
                )}
                {actionLoading === "feed" ? "Repas en cours..." : "Nourrir"}
              </button>
              {affection.foodStock <= 0 && (
                <p className="mt-3 text-xs leading-5 text-ivory/50">
                  Vous n'avez plus de nourriture. Nettoyez l'enclos pour en trouver.
                </p>
              )}
            </div>

            <InfoCard
              icon={<Brush className="h-4 w-4" />}
              title="Nettoyer l'enclos"
              text="Touchez chaque élément à ranger. Une fois l'enclos propre, le serveur ajoute 0 à 3 nourritures à votre stock."
            />
            <InfoCard
              icon={<Leaf className="h-4 w-4" />}
              title="Progression durable"
              text="Les cœurs demandent de plus en plus de repas. Le premier est accessible, le dixième devient prestigieux."
            />
            <InfoCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Récompenses protégées"
              text="Chaque nouveau cœur crédite des lueurs une seule fois, avec une trace serveur dans le ledger du wallet."
            />

            <div className="rounded-[26px] border border-white/10 bg-night-950/55 p-5">
              <div className="flex items-center gap-2 text-gold-100">
                <Sparkles className="h-4 w-4" />
                <h2 className="font-display text-xl">État de l'enclos</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/68">
                {onCooldown
                  ? `L'enclos est propre. Prochain nettoyage dans ${formatRemaining(cooldownRemaining)}.`
                  : feedback ?? "Nettoyez l'enclos, trouvez de la nourriture, puis nourrissez votre familier."}
              </p>
              <button
                type="button"
                onClick={resetEnclosure}
                disabled={onCooldown || Boolean(actionLoading)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-night-950/50 px-4 py-2 text-sm font-semibold text-ivory/80 transition hover:border-gold-200 hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === "clean" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : onCooldown ? (
                  <Timer className="h-4 w-4" />
                ) : (
                  <Brush className="h-4 w-4" />
                )}
                {actionLoading === "clean"
                  ? "Enregistrement..."
                  : onCooldown
                    ? "Enclos en repos"
                    : "Réinitialiser les objets"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function AffectionHearts({
  hearts,
  pulseHeart,
}: {
  hearts: number;
  pulseHeart: number | null;
}) {
  return (
    <div className="mb-2 flex rounded-full border border-white/10 bg-night-950/70 px-2.5 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur">
      {Array.from({ length: 10 }, (_, index) => {
        const heartNumber = index + 1;
        const filled = heartNumber <= hearts;
        return (
          <motion.span
            key={heartNumber}
            animate={
              pulseHeart === heartNumber
                ? { scale: [1, 1.45, 1], rotate: [0, -8, 0] }
                : undefined
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mx-0.5"
          >
            <Heart
              className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                filled ? "fill-rose-300 text-rose-200" : "text-white/30"
              }`}
            />
          </motion.span>
        );
      })}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-night-950/55 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">
        {label}
      </div>
      <div className="mt-1 font-display text-lg text-gold-100">{value}</div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-night-950/55 p-4">
      <div className="flex items-center gap-2 text-gold-100">
        {icon}
        <h3 className="font-display text-lg">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-ivory/62">{text}</p>
    </div>
  );
}
