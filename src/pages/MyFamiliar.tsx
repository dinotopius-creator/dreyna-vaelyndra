/**
 * Page "Mon Familier" (PR familiers#3).
 *
 * Tableau de bord du familier actif :
 *  - sticker animé + niveau + palier
 *  - barre XP avec progression dans le niveau courant
 *  - liste de stats cosmétiques (Aura, Énergie, Récolte, Affinité, Charisme)
 *  - liste des familiers possédés avec switch en 1 clic (1er gratuit, puis
 *    coût Sylvins)
 *  - lien vers la boutique (à venir en PR familiers#4)
 *
 * Si l'utilisateur n'a pas encore de familier (cas pré-onboarding), on
 * affiche un état d'invitation à choisir, mais c'est la modal globale qui
 * gère le flow obligatoire.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftRight, Loader2, Pencil, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  EVOLUTION_TIERS,
  RARITY_LABELS,
  STAT_LABELS,
  fetchUserFamiliars,
  setFamiliarNickname,
  switchFamiliar,
  type FamiliarCollection,
  type OwnedFamiliar,
} from "../lib/familiarsApi";

export function MyFamiliar() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [collection, setCollection] = useState<FamiliarCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchUserFamiliars(user.id);
      setCollection(data);
    } catch {
      notify("Impossible de charger ton familier.", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.id, notify]);

  useEffect(() => {
    if (!user?.id) {
      setCollection(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [user?.id, reload]);

  const active = useMemo<OwnedFamiliar | null>(() => {
    if (!collection) return null;
    return collection.owned.find((f) => f.isActive) ?? null;
  }, [collection]);

  if (!user?.id) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-ivory/70">
        <p>Connecte-toi pour rencontrer ton familier.</p>
        <Link to="/connexion" className="btn-gold mt-4 inline-flex">
          Se connecter
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto flex max-w-3xl items-center justify-center px-4 py-16 text-ivory/70">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </section>
    );
  }

  if (!collection || !active) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-ivory/70">
        <p>Tu n'as pas encore de familier. La modal d'éveil va apparaître.</p>
      </section>
    );
  }

  async function doSwitch(targetId: string) {
    if (!user?.id || pendingSwitch) return;
    if (collection && !collection.nextSwitchFree) {
      const ok = window.confirm(
        `Changer de familier coûte ${collection.switchPriceSylvins} Sylvins. Ta progression suivra le nouveau familier. Confirmer ?`,
      );
      if (!ok) return;
    }
    setPendingSwitch(targetId);
    try {
      const updated = await switchFamiliar(user.id, targetId);
      setCollection(updated);
      const fam = updated.owned.find((f) => f.familiarId === targetId);
      notify(fam ? `${fam.icon} ${fam.name} est désormais à tes côtés.` : "Familier changé.");
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? e.message : "Échec du switch.";
      notify(msg, "error");
    } finally {
      setPendingSwitch(null);
    }
  }

  async function saveNickname() {
    if (!user?.id || !active) return;
    const trimmed = nicknameDraft.trim().slice(0, 40);
    setSavingNickname(true);
    try {
      await setFamiliarNickname(user.id, active.id, trimmed || null);
      setEditingNickname(false);
      notify("Surnom enregistré.");
      await reload();
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? e.message : "Échec du surnom.";
      notify(msg, "error");
    } finally {
      setSavingNickname(false);
    }
  }

  const xpPct =
    active.xpToNextLevel <= 0
      ? 100
      : Math.min(
          100,
          Math.round((active.xpIntoLevel / active.xpToNextLevel) * 100),
        );
  const evo = EVOLUTION_TIERS[active.evolution.id] ?? {
    label: active.evolution.name,
    emoji: "✨",
  };

  return (
    <section className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:pt-10">
      <header className="mb-6 flex items-center justify-center gap-2 text-gold-300">
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="text-xs uppercase tracking-[0.3em]">Mon Familier</span>
        <Sparkles className="h-4 w-4" aria-hidden />
      </header>

      <motion.div
        className="card-royal relative overflow-hidden p-6 sm:p-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${active.color}44, transparent 70%)`,
          }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-6">
          <FamiliarSticker familiar={active} size="lg" />

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-1 sm:items-start">
              {editingNickname ? (
                <div className="flex w-full max-w-xs items-center gap-2">
                  <input
                    type="text"
                    value={nicknameDraft}
                    autoFocus
                    onChange={(e) => setNicknameDraft(e.target.value)}
                    maxLength={40}
                    placeholder={active.name}
                    className="flex-1 rounded-lg border border-ivory/10 bg-night-800/80 px-3 py-1.5 text-sm text-ivory placeholder-ivory/40 focus:border-gold-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveNickname}
                    className="btn-gold px-3 py-1 text-xs disabled:opacity-50"
                    disabled={savingNickname}
                  >
                    {savingNickname ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      "OK"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNickname(false)}
                    className="btn-ghost px-3 py-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNicknameDraft(active.nickname ?? "");
                    setEditingNickname(true);
                  }}
                  className="group inline-flex items-center gap-2 text-2xl font-semibold text-ivory hover:text-gold-200"
                >
                  {active.nickname || active.name}
                  <Pencil
                    className="h-3.5 w-3.5 opacity-50 transition group-hover:opacity-100"
                    aria-hidden
                  />
                </button>
              )}
              {active.nickname && (
                <span className="text-xs text-ivory/50">
                  {active.name} —{" "}
                  {RARITY_LABELS[active.rarity] ?? active.rarity}
                </span>
              )}
              {!active.nickname && (
                <span className="text-xs text-ivory/50">
                  {RARITY_LABELS[active.rarity] ?? active.rarity} •{" "}
                  {active.tier === "premium" ? "Ancestral" : "D'éveil"}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3 sm:justify-start">
              <span className="rounded-full bg-night-800/80 px-3 py-1 text-xs uppercase tracking-widest text-gold-300">
                Niveau {active.level}
              </span>
              <span className="rounded-full bg-night-800/80 px-3 py-1 text-xs uppercase tracking-widest text-ivory/70">
                {evo.emoji} {evo.label}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-ivory/50">
                <span>Progression</span>
                <span>
                  {active.xpIntoLevel} / {active.xpToNextLevel} XP
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-night-900/80">
                <motion.div
                  className="h-full"
                  style={{
                    background: `linear-gradient(90deg, ${active.color}, #f6d27a)`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <p className="mt-1 text-[11px] text-ivory/50">
                XP totale : {active.xp.toLocaleString("fr-FR")}
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-xs uppercase tracking-[0.3em] text-ivory/50">
              Caractéristiques
            </h3>
            <p className="text-[11px] text-ivory/40">
              Notées sur 100 — montent avec le niveau de ton familier
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(active.stats).map(([key, value]) => {
              const meta = STAT_LABELS[key] ?? {
                label: key,
                emoji: "✨",
                help: "",
              };
              const pct = Math.min(100, Math.max(0, value));
              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 rounded-2xl border border-ivory/10 bg-night-800/50 p-3"
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-ivory/60">
                    <span className="flex items-center gap-1.5 text-ivory/80">
                      <span aria-hidden>{meta.emoji}</span>
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold text-ivory">
                      {value}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-night-900/80">
                    <div
                      className="h-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-gold-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {meta.help && (
                    <p className="text-[11px] leading-snug text-ivory/55">
                      {meta.help}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-ivory/45">
            Les caractéristiques sont purement cosmétiques et conviviales —
            aucun avantage de jeu. Plus elles montent, plus tes interactions
            sociales et tes lives sont visuellement enrichis.
          </p>
        </div>
      </motion.div>

      <section className="mt-10">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="heading-gold text-lg">Mes familiers</h2>
          <Link
            to="/familiers/boutique"
            className="text-xs uppercase tracking-widest text-gold-300 hover:text-gold-200"
          >
            Découvrir la boutique →
          </Link>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {collection.owned.map((f) => (
            <OwnedFamiliarCard
              key={f.id}
              familiar={f}
              isActive={f.isActive}
              pending={pendingSwitch === f.familiarId}
              onSwitch={() => doSwitch(f.familiarId)}
              switchPrice={
                collection.nextSwitchFree ? 0 : collection.switchPriceSylvins
              }
            />
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-ivory/50">
          1er changement de familier gratuit, puis {collection.switchPriceSylvins}{" "}
          Sylvins. Ta progression (XP, niveau, palier) suit toujours ton
          nouveau familier.
        </p>
      </section>
    </section>
  );
}

interface StickerProps {
  familiar: OwnedFamiliar;
  size?: "sm" | "lg";
}

function FamiliarSticker({ familiar, size = "sm" }: StickerProps) {
  const dim = size === "lg" ? "h-32 w-32 text-7xl" : "h-16 w-16 text-3xl";
  // Les caractéristiques cosmétiques scalent les effets visuels :
  //   aura → intensité du halo,
  //   charisma → anneau pulsant autour du familier,
  //   affinity → étincelle premium en haut à droite.
  const aura = familiar.stats?.aura ?? 0;
  const charisma = familiar.stats?.charisma ?? 0;
  const affinity = familiar.stats?.affinity ?? 0;
  const haloPx = 18 + Math.round((aura / 99) * 30); // 18..48
  const haloAlpha = Math.min(0.85, 0.25 + aura / 200);
  const ringOpacity = Math.min(0.8, charisma / 140);
  return (
    <motion.div
      className={`relative flex shrink-0 items-center justify-center rounded-3xl border ${dim}`}
      style={{
        background: `radial-gradient(circle at 50% 40%, ${familiar.color}${Math.round(haloAlpha * 80).toString(16).padStart(2, "0")}, ${familiar.color}11 60%, transparent)`,
        borderColor: `${familiar.color}55`,
        boxShadow: `0 0 ${haloPx}px -8px ${familiar.color}`,
      }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      {ringOpacity > 0.05 && (
        <motion.span
          className="pointer-events-none absolute inset-[-6px] rounded-3xl"
          style={{
            border: `1px solid ${familiar.color}`,
            opacity: ringOpacity,
          }}
          animate={{ scale: [1, 1.06, 1], opacity: [ringOpacity, ringOpacity * 0.4, ringOpacity] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span style={{ filter: `drop-shadow(0 0 10px ${familiar.color})` }}>
        {familiar.icon}
      </span>
      {affinity >= 22 && (
        <motion.span
          className="pointer-events-none absolute -right-1 -top-1 text-xs"
          style={{ filter: `drop-shadow(0 0 4px ${familiar.color})` }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          ✦
        </motion.span>
      )}
    </motion.div>
  );
}

interface OwnedCardProps {
  familiar: OwnedFamiliar;
  isActive: boolean;
  pending: boolean;
  onSwitch: () => void;
  switchPrice: number;
}

function OwnedFamiliarCard({
  familiar,
  isActive,
  pending,
  onSwitch,
  switchPrice,
}: OwnedCardProps) {
  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
        isActive
          ? "border-gold-400 bg-night-700/80"
          : "border-ivory/10 bg-night-800/60"
      }`}
      style={
        isActive
          ? {
              boxShadow: `0 0 0 1px ${familiar.color}aa, 0 0 28px -8px ${familiar.color}`,
            }
          : undefined
      }
    >
      <FamiliarSticker familiar={familiar} />
      <div className="text-sm font-semibold text-ivory">
        {familiar.nickname || familiar.name}
      </div>
      <div className="text-[11px] text-ivory/50">
        Niveau {familiar.level} •{" "}
        {RARITY_LABELS[familiar.rarity] ?? familiar.rarity}
      </div>
      {isActive ? (
        <span className="inline-flex items-center rounded-full bg-gold-400/20 px-3 py-1 text-[11px] uppercase tracking-widest text-gold-200">
          Actif
        </span>
      ) : (
        <button
          type="button"
          onClick={onSwitch}
          disabled={pending}
          className="btn-ghost mt-1 inline-flex items-center gap-1.5 px-3 py-1 text-xs disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <ArrowLeftRight className="h-3 w-3" aria-hidden />
          )}
          Changer {switchPrice > 0 && `(${switchPrice} Sylvins)`}
        </button>
      )}
    </div>
  );
}
