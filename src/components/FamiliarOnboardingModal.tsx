/**
 * Onboarding obligatoire du familier (PR familiers#3).
 *
 * Affichée automatiquement par `FamiliarOnboardingGate` quand un membre
 * connecté n'a pas encore de familier actif. Bloquante : impossible à
 * fermer sans choisir. Les familiers PREMIUM apparaissent dans le
 * carrousel mais nécessitent la boutique (`/familier`) — l'onboarding ne
 * propose que les gratuits pour respecter le parcours "1er familier
 * gratuit, puis switch payant".
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import {
  fetchFamiliarsCatalog,
  chooseFirstFamiliar,
  STAT_LABELS,
  type FamiliarCatalogItem,
} from "../lib/familiarsApi";
import { useToast } from "../contexts/ToastContext";

interface Props {
  userId: string;
  open: boolean;
  onChosen: () => void;
}

export function FamiliarOnboardingModal({ userId, open, onChosen }: Props) {
  const { notify } = useToast();
  const [catalog, setCatalog] = useState<FamiliarCatalogItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadError(null);
    fetchFamiliarsCatalog()
      .then((items) => {
        if (!alive) return;
        setCatalog(items);
        // Pré-sélection du premier familier gratuit pour guider l'œil.
        const firstFree = items.find((f) => f.tier === "free");
        if (firstFree) setSelected(firstFree.id);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError(
          "Impossible de charger les familiers. Réessaie dans un instant.",
        );
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const freeFamiliars = useMemo(
    () => (catalog ?? []).filter((f) => f.tier === "free"),
    [catalog],
  );
  const premiumFamiliars = useMemo(
    () => (catalog ?? []).filter((f) => f.tier === "premium"),
    [catalog],
  );

  async function confirm() {
    if (!selected) return;
    setConfirming(true);
    try {
      await chooseFirstFamiliar(userId, selected);
      const fam = catalog?.find((f) => f.id === selected);
      notify(
        fam ? `${fam.icon} ${fam.name} est désormais à tes côtés.` : "Familier lié.",
      );
      onChosen();
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message ? e.message : "Échec du choix du familier.";
      notify(msg, "error");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-night-900/90 p-3 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="familiar-onboarding-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className="card-royal relative my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden p-5 sm:max-h-[calc(100dvh-2rem)] sm:p-8"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" />
            <div className="flex items-center justify-center gap-2 text-gold-300">
              <Sparkles className="h-5 w-5" aria-hidden />
              <span className="text-xs uppercase tracking-[0.3em]">
                Rituel d'alliance
              </span>
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h2
              id="familiar-onboarding-title"
              className="heading-gold mt-3 text-center text-2xl sm:text-3xl"
            >
              Choisis ton familier
            </h2>
            <p className="mt-2 text-center text-sm text-ivory/70">
              Chaque membre de Vaelyndra reçoit un compagnon de chemin. Il
              grandira avec toi, gagnera de l'XP au fil de tes posts, lives
              et soutiens, et te suivra partout dans le royaume.
            </p>

            {loadError && (
              <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">
                {loadError}
              </div>
            )}

            {!catalog && !loadError && (
              <div className="mt-10 flex items-center justify-center text-ivory/60">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              </div>
            )}

            {catalog && (
              <div className="-mx-2 mt-4 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 sm:mt-6">
                <details className="group mb-4 rounded-2xl border border-ivory/10 bg-night-800/40 p-3 open:bg-night-800/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs uppercase tracking-widest text-ivory/60">
                    <span>Comprendre les caractéristiques</span>
                    <span className="text-ivory/40 transition group-open:rotate-180">
                      ⌄
                    </span>
                  </summary>
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(STAT_LABELS).map(([key, meta]) => (
                      <li
                        key={key}
                        className="rounded-xl bg-night-900/60 p-2 text-[11px] leading-snug text-ivory/70"
                      >
                        <span className="font-semibold text-ivory">
                          {meta.emoji} {meta.label}
                        </span>
                        <span className="block text-ivory/55">{meta.help}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-ivory/40">
                    Toutes les caractéristiques sont cosmétiques — aucun
                    avantage de jeu. Ton familier les fait monter en gagnant
                    de l'XP au fil de tes interactions.
                  </p>
                </details>
                <div className="">
                  <h3 className="text-xs uppercase tracking-widest text-ivory/50">
                    Familiers d'éveil — gratuits
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {freeFamiliars.map((f) => (
                      <FamiliarChoiceCard
                        key={f.id}
                        familiar={f}
                        selected={selected === f.id}
                        locked={false}
                        onSelect={() => setSelected(f.id)}
                      />
                    ))}
                  </div>
                </div>

                {premiumFamiliars.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs uppercase tracking-widest text-ivory/50">
                      Familiers ancestraux — disponibles depuis la boutique
                    </h3>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {premiumFamiliars.map((f) => (
                        <FamiliarChoiceCard
                          key={f.id}
                          familiar={f}
                          selected={false}
                          locked={true}
                          onSelect={() => {
                            notify(
                              `${f.name} est un familier ancestral, disponible depuis la boutique du familier (${f.priceSylvins} Sylvins).`,
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {catalog && (
              <div className="mt-4 flex flex-col items-center gap-2 border-t border-ivory/10 pt-4">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!selected || confirming}
                  className="btn-gold w-full max-w-xs justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    "Sceller le pacte"
                  )}
                </button>
                <p className="text-center text-[11px] text-ivory/50">
                  Tu pourras changer plus tard depuis la page Mon Familier
                  (1er changement gratuit, puis 300 Sylvins). Ta progression
                  suivra ton nouveau familier.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface StatsPreviewProps {
  baseStats: Record<string, number>;
}

function FamiliarStatsPreview({ baseStats }: StatsPreviewProps) {
  const top = Object.entries(baseStats)
    .map(([key, value]) => ({
      key,
      value,
      meta: STAT_LABELS[key],
    }))
    .filter((entry) => entry.meta)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2);
  if (top.length === 0) return null;
  return (
    <ul className="mt-1 w-full space-y-1 text-left text-[10px] text-ivory/55">
      {top.map((entry) => (
        <li key={entry.key} className="flex items-center justify-between gap-2">
          <span className="truncate" title={entry.meta!.help}>
            {entry.meta!.emoji} {entry.meta!.label}
          </span>
          <span className="tabular-nums text-ivory/70">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

interface ChoiceCardProps {
  familiar: FamiliarCatalogItem;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}

function FamiliarChoiceCard({
  familiar,
  selected,
  locked,
  onSelect,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
        selected
          ? "border-gold-400 bg-night-700/80"
          : locked
            ? "border-ivory/10 bg-night-800/40 opacity-70 hover:opacity-100"
            : "border-ivory/10 bg-night-800/60 hover:border-ivory/25"
      }`}
      style={
        selected
          ? {
              boxShadow: `0 0 0 1px ${familiar.color}aa, 0 0 30px -6px ${familiar.color}`,
            }
          : undefined
      }
      aria-pressed={selected}
    >
      <span
        className="text-4xl"
        aria-hidden
        style={{
          filter: selected
            ? `drop-shadow(0 0 10px ${familiar.color})`
            : `drop-shadow(0 0 4px ${familiar.color}66)`,
        }}
      >
        {familiar.icon}
      </span>
      <span className="text-sm font-semibold text-ivory">{familiar.name}</span>
      <span className="text-[11px] leading-snug text-ivory/60">
        {familiar.tagline}
      </span>
      <FamiliarStatsPreview baseStats={familiar.baseStats} />
      {locked && (
        <span className="mt-1 rounded-full bg-night-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold-300/80">
          {familiar.priceSylvins} Sylvins
        </span>
      )}
    </button>
  );
}
