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
import { Familiar3DStage } from "../components/Familiar3DStage";
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

const CLEANING_ITEMS = [
  { id: "leaf-1", label: "Feuilles dorées", icon: "🍃", x: 16, y: 44 },
  { id: "dust-1", label: "Poussière de lune", icon: "✨", x: 30, y: 52 },
  { id: "trace-1", label: "Trace dans l'herbe", icon: "🌿", x: 47, y: 46 },
  { id: "toy-1", label: "Jouet renversé", icon: "🧸", x: 66, y: 55 },
  { id: "leaf-2", label: "Brindilles", icon: "🪵", x: 82, y: 42 },
  { id: "spark-1", label: "Éclat instable", icon: "💫", x: 57, y: 34 },
  { id: "dust-2", label: "Nuage de poussière", icon: "☁️", x: 24, y: 35 },
  { id: "flower-1", label: "Fleurs froissées", icon: "🌸", x: 42, y: 57 },
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

function playFeedSound() {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const firstTone = context.createOscillator();
    const secondTone = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    firstTone.type = "sine";
    secondTone.type = "triangle";
    firstTone.frequency.setValueAtTime(660, now);
    firstTone.frequency.exponentialRampToValueAtTime(880, now + 0.09);
    secondTone.frequency.setValueAtTime(990, now + 0.06);
    secondTone.frequency.exponentialRampToValueAtTime(1320, now + 0.17);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    firstTone.connect(gain);
    secondTone.connect(gain);
    gain.connect(context.destination);
    firstTone.start(now);
    secondTone.start(now + 0.055);
    firstTone.stop(now + 0.18);
    secondTone.stop(now + 0.24);
    window.setTimeout(() => void context.close(), 320);
  } catch {
    // Browsers can block audio contexts; the visual feedback still runs.
  }
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
    heartRequirements: familiar.heartRequirements ?? DEFAULT_AFFECTION.heartRequirements,
    heartRewards: familiar.heartRewards ?? DEFAULT_AFFECTION.heartRewards,
  };
}

function cleanStateForAllItems(isClean: boolean) {
  return isClean ? Object.fromEntries(CLEANING_ITEMS.map((item) => [item.id, true])) : {};
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [feedBurstId, setFeedBurstId] = useState(0);

  useEffect(() => {
    setDisplayedLueurs(profile?.lueurs ?? 0);
  }, [profile?.lueurs]);

  useEffect(() => {
    document.body.classList.add("vaelyndra-familiar-enclosure-open");
    return () => {
      document.body.classList.remove("vaelyndra-familiar-enclosure-open");
    };
  }, []);

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
          const remaining = current?.enclosureCooldownRemainingSeconds ?? 0;
          setCooldownRemaining(remaining);
          setCleaned(cleanStateForAllItems(remaining > 0));
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

  const onCooldown = cooldownRemaining > 0;
  const cleanedCount = useMemo(
    () =>
      onCooldown
        ? CLEANING_ITEMS.length
        : CLEANING_ITEMS.filter((item) => cleaned[item.id]).length,
    [cleaned, onCooldown],
  );
  const cleaningProgress = Math.round((cleanedCount / CLEANING_ITEMS.length) * 100);
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
      setCleaned(cleanStateForAllItems(result.cooldownRemainingSeconds > 0));
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
      playFeedSound();
      setFeedBurstId((current) => current + 1);
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

  function tapFamiliar() {
    if (!active) return;
    setFeedback(`${active.nickname || active.name} vous regarde et sourit.`);
    setFeedBurstId((current) => current + 1);
    playFeedSound();
  }

  if (!user?.id) {
    return (
      <section className="flex h-[100dvh] items-center justify-center bg-night-950 px-4 text-center text-ivory/70">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-night-900/75 p-6 backdrop-blur-xl">
          <p>Connectez-vous pour ouvrir l'enclos de votre familier.</p>
          <Link to="/connexion" className="btn-gold mt-4 inline-flex">
            Se connecter
          </Link>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex h-[100dvh] items-center justify-center bg-night-950 px-4 text-ivory/70">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-night-900/75 px-6 py-8 text-center backdrop-blur-xl">
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
          <div>
            <p className="font-display text-2xl text-gold-100">Ouverture de l'enclos…</p>
            <p className="mt-2 text-sm text-ivory/60">
              Préparation de votre familier, de la nourriture et des récompenses.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="fixed inset-0 z-40 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_30%),linear-gradient(180deg,rgba(5,10,20,0.98),rgba(5,8,16,1))] text-ivory">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-[10%] top-[8%] h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="absolute right-[8%] top-[16%] h-64 w-64 rounded-full bg-gold-300/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-[82vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.24),rgba(15,23,42,0)_70%)]" />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-night-950/65 px-3 py-3 backdrop-blur-xl sm:px-5">
        <Link
          to="/familier"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-night-950/80 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/45 hover:text-gold-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Quitter
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold-200/70">
            Enclos vivant
          </p>
          <h1 className="font-display text-lg text-gold-100 sm:text-2xl">
            {active?.nickname || active?.name || "Familier actif"}
          </h1>
        </div>
        <div className="rounded-full border border-gold-300/25 bg-gold-500/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gold-100">
          {displayedLueurs.toLocaleString("fr-FR")} Lueurs
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="grid gap-4 p-3 pb-8 lg:grid-cols-[1.35fr,0.65fr] lg:p-5">
          <div className="relative min-h-[62dvh] overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(74,222,128,0.16),transparent_28%),linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.92))] shadow-[0_30px_90px_rgba(0,0,0,0.35)] lg:min-h-[calc(100dvh-8.5rem)]">
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
            <div className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-night-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-ivory/70 backdrop-blur">
              Touchez le familier
            </div>

            {active ? (
              <motion.button
                type="button"
                onClick={tapFamiliar}
                className="absolute z-20 flex flex-col items-center focus:outline-none"
                style={{ color: active.color }}
                animate={{
                  left: ["18%", "58%", "46%", "25%", "18%"],
                  top: ["56%", "48%", "68%", "72%", "56%"],
                }}
                transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              >
                <AffectionHearts
                  hearts={affection.affectionHearts}
                  pulseHeart={heartPulse}
                />
                <div className="relative h-[340px] w-[340px] sm:h-[420px] sm:w-[420px]">
                  <Familiar3DStage familiar={active} onTap={tapFamiliar} />
                  <FeedHeartBurst burstId={feedBurstId} />
                </div>
                <div className="mt-2 rounded-full border border-white/10 bg-night-950/72 px-3 py-1 text-center text-xs text-ivory/80 backdrop-blur">
                  {active.nickname || active.name}
                </div>
              </motion.button>
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

            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-40 rounded-3xl border border-white/10 bg-night-950/72 p-4 backdrop-blur-xl">
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

          <aside className="min-h-0 space-y-4 overflow-y-visible pr-1 pb-4 lg:overflow-y-auto">
            <div className="rounded-[26px] border border-rose-300/20 bg-rose-500/10 p-5">
              <div className="flex items-center gap-2 text-rose-100">
                <Heart className="h-4 w-4" />
                <h2 className="font-display text-xl">Cœurs d'affection</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/68">
                Les cœurs représentent l'affection de votre familier. Nourrissez-le
                pour gagner des cœurs et débloquer des lueurs.
              </p>
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
              <button
                type="button"
                onClick={() => setGuideOpen((current) => !current)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-rose-200/25 bg-night-950/45 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-200/55"
              >
                <Sparkles className="h-4 w-4" />
                {guideOpen ? "Masquer le guide" : "À quoi servent les cœurs ?"}
              </button>
              {guideOpen && <FamiliarHeartRewardGuide affection={affection} />}
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
              title="Progression sauvegardée"
              text="Les cœurs, les repas, le stock de nourriture et les récompenses sont sauvegardés côté serveur pour chaque familier."
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

function FeedHeartBurst({ burstId }: { burstId: number }) {
  if (burstId <= 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      {[0, 1, 2, 3, 4].map((index) => {
        const x = [-28, -12, 8, 22, 34][index];
        const y = [-32, -44, -54, -40, -26][index];
        const delay = index * 0.045;
        return (
          <motion.span
            key={`${burstId}-${index}`}
            className="absolute rounded-full border border-rose-100/25 bg-rose-400/15 p-1.5 text-rose-100 shadow-[0_0_18px_rgba(251,113,133,0.45)] backdrop-blur"
            initial={{ opacity: 0, scale: 0.35, x: 0, y: 10 }}
            animate={{ opacity: [0, 1, 0], scale: [0.35, 1.1, 0.7], x, y }}
            transition={{ duration: 0.95, delay, ease: "easeOut" }}
          >
            <Heart className="h-3.5 w-3.5 fill-rose-200 text-rose-100" />
          </motion.span>
        );
      })}
    </div>
  );
}

function FamiliarHeartRewardGuide({
  affection,
}: {
  affection: FamiliarAffectionState;
}) {
  const nextHeart = Math.min(10, affection.affectionHearts + 1);

  return (
    <div className="mt-4 space-y-4 rounded-[24px] border border-white/10 bg-night-950/50 p-4">
      <div>
        <h3 className="font-display text-lg text-gold-100">
          Guide des 10 cœurs
        </h3>
        <p className="mt-2 text-sm leading-6 text-ivory/65">
          Chaque nourriture donnée compte comme un repas. Quand un nouveau cœur
          est débloqué, la récompense en lueurs est accordée une seule fois et
          reste enregistrée sur ce familier.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 10 }, (_, index) => {
          const heart = index + 1;
          const requirement = affection.heartRequirements[index] ?? 0;
          const reward = affection.heartRewards[index] ?? 0;
          const unlocked = heart <= affection.affectionHearts;
          const current = heart === nextHeart && affection.affectionHearts < 10;
          const rewarded = affection.affectionRewardedHearts.includes(heart);
          const badge = unlocked ? "Débloqué" : current ? "En cours" : "Verrouillé";
          const badgeClass = unlocked
            ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
            : current
              ? "border-gold-300/45 bg-gold-400/10 text-gold-100"
              : "border-white/10 bg-white/5 text-ivory/45";

          return (
            <div
              key={heart}
              className={`rounded-2xl border p-3 ${
                current
                  ? "border-gold-300/35 bg-gold-500/10"
                  : "border-white/10 bg-night-950/45"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-ivory/85">
                  <Heart
                    className={`h-4 w-4 ${
                      unlocked ? "fill-rose-300 text-rose-200" : "text-white/30"
                    }`}
                  />
                  Cœur {heart}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${badgeClass}`}
                >
                  {badge}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ivory/58">
                Objectif : nourrir le familier {requirement} fois
                {heart > 1 ? " supplémentaires" : ""}.
              </p>
              <p className="mt-1 text-xs leading-5 text-gold-100">
                Récompense : {reward.toLocaleString("fr-FR")} lueurs
              </p>
              <p className="mt-1 text-[11px] leading-5 text-ivory/45">
                {rewarded
                  ? "Récompense déjà obtenue."
                  : current
                    ? `Encore ${affection.affectionMealsUntilNextHeart} repas avant ce cœur.`
                    : unlocked
                      ? "Cœur débloqué."
                      : "Récompense à venir."}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-cyan-200/15 bg-cyan-300/10 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
          <Utensils className="h-4 w-4" />
          Comment obtenir de la nourriture ?
        </div>
        <p className="mt-2 text-xs leading-5 text-ivory/62">
          Nettoyez l'enclos de votre familier pour avoir une chance de trouver
          de la nourriture. La nourriture trouvée est ajoutée à votre stock,
          puis vous pouvez l'utiliser avec le bouton Nourrir.
        </p>
        <p className="mt-2 text-xs text-gold-100">
          Stock actuel : {affection.foodStock.toLocaleString("fr-FR")} nourriture
          {affection.foodStock > 1 ? "s" : ""}
        </p>
      </div>

      <div className="rounded-2xl border border-gold-300/20 bg-gold-500/10 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gold-100">
          <Sparkles className="h-4 w-4" />
          Récompenses d'affection
        </div>
        <p className="mt-2 text-xs leading-5 text-ivory/62">
          À chaque nouveau cœur débloqué, vous recevez des lueurs. Plus le cœur
          est difficile à atteindre, plus la récompense est importante. Chaque
          récompense de cœur est obtenue une seule fois.
        </p>
        <p className="mt-2 text-xs font-semibold text-gold-100">
          Objectif final : 10 cœurs et{" "}
          {(affection.heartRewards[9] ?? 0).toLocaleString("fr-FR")} lueurs
          pour le dernier palier.
        </p>
      </div>
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
