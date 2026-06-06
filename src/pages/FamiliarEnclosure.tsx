import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brush,
  Gem,
  Leaf,
  Loader2,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { apiApplyWalletDelta } from "../lib/api";
import { fetchUserFamiliars, type OwnedFamiliar } from "../lib/familiarsApi";

const CLEANING_REWARD_LUEURS = 18;
const RARE_SYLVIN_CHANCE = 1 / 1000;
const CLEANING_COOLDOWN_MS = 6 * 60 * 60 * 1000;
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

function cooldownKey(userId: string) {
  return `vaelyndra_familiar_enclosure_cleaned_at:${userId}`;
}

function formatRemaining(ms: number) {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes.toString().padStart(2, "0")}`;
}

function rollRareSylvin() {
  const random = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
    : Math.random();
  return random < RARE_SYLVIN_CHANCE;
}

export function FamiliarEnclosure() {
  const { user } = useAuth();
  const { profile, setProfile, refresh } = useProfile();
  const { notify } = useToast();
  const [active, setActive] = useState<OwnedFamiliar | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaned, setCleaned] = useState<Record<string, boolean>>({});
  const [savingReward, setSavingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [lastCleanedAt, setLastCleanedAt] = useState<number>(() => {
    if (!user?.id) return 0;
    return Number(localStorage.getItem(cooldownKey(user.id)) ?? "0");
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      try {
        const collection = await fetchUserFamiliars(user.id);
        if (!cancelled) {
          setActive(collection.owned.find((entry) => entry.isActive) ?? null);
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
  const progress = Math.round((cleanedCount / CLEANING_ITEMS.length) * 100);
  const cooldownRemaining = Math.max(
    0,
    lastCleanedAt + CLEANING_COOLDOWN_MS - now,
  );
  const onCooldown = cooldownRemaining > 0;
  const canClean = !onCooldown && !savingReward;

  async function finishCleaning(nextCleaned: Record<string, boolean>) {
    if (!user?.id || savingReward || onCooldown) return;
    const completed = CLEANING_ITEMS.every((item) => nextCleaned[item.id]);
    if (!completed) return;
    setSavingReward(true);
    const premiumWon = rollRareSylvin();
    try {
      const updated = await apiApplyWalletDelta(user.id, {
        lueurs: CLEANING_REWARD_LUEURS,
        ...(premiumWon ? { sylvins_promo: 1 } : {}),
        reason: premiumWon
          ? "familiar-enclosure-clean:rare-sylvin"
          : "familiar-enclosure-clean:lueurs",
      });
      setProfile(updated);
      void refresh();
      const now = Date.now();
      localStorage.setItem(cooldownKey(user.id), String(now));
      setNow(now);
      setLastCleanedAt(now);
      setRewardMessage(
        premiumWon
          ? `Enclos impeccable : +${CLEANING_REWARD_LUEURS} Lueurs et +1 Sylvin rare.`
          : `Enclos impeccable : +${CLEANING_REWARD_LUEURS} Lueurs.`,
      );
      notify(
        premiumWon
          ? `Récompense rare : +${CLEANING_REWARD_LUEURS} Lueurs et +1 Sylvin.`
          : `+${CLEANING_REWARD_LUEURS} Lueurs ajoutées à ta bourse.`,
        "success",
      );
    } catch (error) {
      setCleaned({});
      const message =
        error instanceof Error
          ? error.message
          : "La récompense n'a pas pu être scellée.";
      notify(message, "error");
    } finally {
      setSavingReward(false);
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

  function resetAfterCooldown() {
    if (onCooldown) return;
    setCleaned({});
    setRewardMessage(null);
  }

  if (!user?.id) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-ivory/70">
        <p>Connecte-toi pour ouvrir l'enclos de ton familier.</p>
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
          {profile?.lueurs?.toLocaleString("fr-FR") ?? 0} Lueurs
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
                Un refuge vivant à nettoyer
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/66">
                Touchez les éléments à ranger, laissez votre compagnon se promener, puis scellez une petite récompense quand l'enclos est propre.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-64">
              <StatPill label="Nettoyage" value={`${progress}%`} />
              <StatPill
                label="Cooldown"
                value={onCooldown ? formatRemaining(cooldownRemaining) : "Prêt"}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-5 p-4 lg:grid-cols-[1.35fr,0.65fr] lg:p-6">
          <div className="relative min-h-[520px] overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(74,222,128,0.16),transparent_28%),linear-gradient(180deg,rgba(16,185,129,0.12),rgba(15,23,42,0.92))] sm:min-h-[620px]">
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
                  top: ["55%", "48%", "68%", "72%", "55%"],
                }}
                transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.div
                  className="flex h-28 w-28 items-center justify-center rounded-[34px] border border-white/15 bg-night-950/62 text-6xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur"
                  style={{
                    boxShadow: `0 0 48px -10px ${active.color}`,
                    borderColor: `${active.color}66`,
                  }}
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {active.icon}
                </motion.div>
                <div className="mt-2 rounded-full border border-white/10 bg-night-950/72 px-3 py-1 text-center text-xs text-ivory/80 backdrop-blur">
                  {active.nickname || active.name}
                </div>
              </motion.div>
            ) : (
              <div className="absolute inset-0 z-20 flex items-center justify-center px-5 text-center">
                <div className="rounded-3xl border border-white/10 bg-night-950/70 p-5 text-ivory/70 backdrop-blur">
                  Aucun familier actif. Retourne choisir ton compagnon.
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
                <span>Progression</span>
                <span>
                  {cleanedCount}/{CLEANING_ITEMS.length}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-gold-200 to-cyan-200 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <InfoCard
              icon={<Brush className="h-4 w-4" />}
              title="Nettoyage tactile"
              text="Appuie sur chaque élément dans l'enclos. Sur mobile, les cibles sont assez grandes pour le pouce."
            />
            <InfoCard
              icon={<Leaf className="h-4 w-4" />}
              title="Récompense contrôlée"
              text={`Une session complète donne ${CLEANING_REWARD_LUEURS} Lueurs, puis verrouille l'enclos pendant ${formatRemaining(CLEANING_COOLDOWN_MS)}.`}
            />
            <InfoCard
              icon={<Gem className="h-4 w-4" />}
              title="Chance rare"
              text="Environ 1 fois sur 1000, le nettoyage peut aussi donner 1 Sylvin promo. Le gain est scellé via le wallet serveur."
            />
            <InfoCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Anti-abus"
              text="Cooldown local, attribution serveur et reason de ledger limitent les clics répétés. Une validation serveur dédiée pourra renforcer la règle ensuite."
            />

            <div className="rounded-[26px] border border-gold-300/25 bg-gold-500/10 p-5">
              <div className="flex items-center gap-2 text-gold-100">
                <Sparkles className="h-4 w-4" />
                <h2 className="font-display text-xl">État de l'enclos</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/68">
                {onCooldown
                  ? `L'enclos est propre. Prochaine récompense dans ${formatRemaining(cooldownRemaining)}.`
                  : rewardMessage ?? "L'enclos attend ton passage. Nettoie tout pour sceller la récompense."}
              </p>
              <button
                type="button"
                onClick={resetAfterCooldown}
                disabled={onCooldown || savingReward}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gold-300/35 bg-night-950/50 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:border-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingReward ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : onCooldown ? (
                  <Timer className="h-4 w-4" />
                ) : (
                  <Brush className="h-4 w-4" />
                )}
                {savingReward ? "Scellement..." : onCooldown ? "Enclos en repos" : "Recommencer l'enclos"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
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
