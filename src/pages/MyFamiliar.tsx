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
import { ArrowLeftRight, Check, Loader2, Lock, Pencil, ShoppingBag, Sparkles } from "lucide-react";
import { FamiliarPortrait } from "../components/FamiliarPortrait";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import {
  EVOLUTION_TIERS,
  RARITY_LABELS,
  STAT_LABELS,
  buyFamiliarCosmetic,
  equipFamiliarCosmetic,
  fetchFamiliarCosmeticsCatalog,
  fetchUserFamiliars,
  setFamiliarNickname,
  switchFamiliar,
  type FamiliarCosmeticCatalogItem,
  type FamiliarCosmeticSlot,
  type FamiliarCollection,
  type OwnedFamiliar,
} from "../lib/familiarsApi";

const COSMETIC_TABS: Array<{ slot: FamiliarCosmeticSlot; label: string }> = [
  { slot: "color", label: "Couleurs" },
  { slot: "hair", label: "Cheveux" },
  { slot: "accessory", label: "Accessoires" },
  { slot: "frame", label: "Cadres" },
  { slot: "effect", label: "Effets" },
];

function cosmeticPriceLabel(item: FamiliarCosmeticCatalogItem) {
  if (item.currency === "free" || item.price <= 0) return "Gratuit";
  return `${item.price.toLocaleString("fr-FR")} ${
    item.currency === "lueurs" ? "Lueurs" : "Sylvins"
  }`;
}

export function MyFamiliar() {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const [collection, setCollection] = useState<FamiliarCollection | null>(null);
  const [cosmeticsCatalog, setCosmeticsCatalog] = useState<FamiliarCosmeticCatalogItem[]>([]);
  const [activeTab, setActiveTab] = useState<FamiliarCosmeticSlot>("color");
  const [loading, setLoading] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [pendingCosmetic, setPendingCosmetic] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    fetchFamiliarCosmeticsCatalog()
      .then((items) => {
        if (!cancelled) setCosmeticsCatalog(items);
      })
      .catch(() => {
        if (!cancelled) notify("Impossible de charger les cosmétiques du familier.", "error");
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const active = useMemo<OwnedFamiliar | null>(() => {
    if (!collection) return null;
    return collection.owned.find((f) => f.isActive) ?? null;
  }, [collection]);

  const visibleCosmetics = useMemo(
    () => cosmeticsCatalog.filter((item) => item.slot === activeTab),
    [activeTab, cosmeticsCatalog],
  );

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

  async function handleCosmeticAction(item: FamiliarCosmeticCatalogItem) {
    if (!user?.id || !active || pendingCosmetic) return;
    const owned = active.cosmeticInventory.includes(item.id);
    const equipped = active.cosmeticEquipped[item.slot] === item.id;
    setPendingCosmetic(item.id);
    try {
      let updated = collection;
      if (!owned) {
        const balance =
          item.currency === "lueurs"
            ? (profile?.lueurs ?? 0)
            : item.currency === "sylvins"
              ? (profile?.sylvins ?? 0)
              : Number.POSITIVE_INFINITY;
        if (item.currency !== "free" && balance < item.price) {
          notify(
            `Solde insuffisant : ${cosmeticPriceLabel(item)} requis.`,
            "error",
          );
          return;
        }
        updated = await buyFamiliarCosmetic(user.id, item.id);
        setCollection(updated);
        void refreshProfile();
      }
      if (!equipped) {
        updated = await equipFamiliarCosmetic(user.id, item.slot, item.id);
        setCollection(updated);
        notify(`${item.name} équipé sur ton familier.`);
      } else if (item.currency !== "free") {
        updated = await equipFamiliarCosmetic(user.id, item.slot, null);
        setCollection(updated);
        notify(`${item.name} retiré.`);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Impossible de modifier le familier.";
      notify(msg, "error");
    } finally {
      setPendingCosmetic(null);
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
          <FamiliarPortrait familiar={active} size="lg" />

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
          <div className="mb-6 overflow-hidden rounded-[26px] border border-gold-300/25 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.18),transparent_34%),rgba(15,23,42,0.58)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-gold-200/70">
                  Mini-jeu familier
                </p>
                <h3 className="mt-1 font-display text-2xl text-gold-100">
                  Enclos du familier
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ivory/62">
                  Laisse ton compagnon se promener, nettoie son refuge au toucher et gagne des Lueurs avec une chance très rare de Sylvin promo.
                </p>
              </div>
              <Link
                to="/familier/enclos"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gold-300/35 bg-gold-500/12 px-5 py-2 text-sm font-semibold text-gold-100 transition hover:border-gold-200 hover:bg-gold-500/18"
              >
                <Sparkles className="h-4 w-4" />
                Ouvrir l'enclos
              </Link>
            </div>
          </div>

          <div
            id="personnalisation"
            className="mb-8 overflow-hidden rounded-[28px] border border-violet-300/20 bg-night-950/55 p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="rounded-[24px] border border-white/10 bg-night-900/70 p-4 text-center lg:sticky lg:top-24 lg:w-56">
                <p className="text-[10px] uppercase tracking-[0.24em] text-gold-200/70">
                  Aperçu direct
                </p>
                <div className="mt-4 flex justify-center">
                  <FamiliarPortrait familiar={active} size="lg" />
                </div>
                <p className="mt-3 text-sm font-semibold text-ivory">
                  {active.nickname || active.name}
                </p>
                <p className="mt-1 text-xs text-ivory/50">
                  {profile?.lueurs?.toLocaleString("fr-FR") ?? 0} Lueurs ·{" "}
                  {profile?.sylvins?.toLocaleString("fr-FR") ?? 0} Sylvins
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-violet-200/70">
                      Atelier cosmétique
                    </p>
                    <h3 className="mt-1 font-display text-2xl text-gold-100">
                      Personnaliser mon familier
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/62">
                      Change ses couleurs, son visage, ses petites touffes, ses accessoires et son cadre. Les achats passent par le serveur avec les Lueurs ou les Sylvins.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                  {COSMETIC_TABS.map((tab) => (
                    <button
                      key={tab.slot}
                      type="button"
                      onClick={() => setActiveTab(tab.slot)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                        activeTab === tab.slot
                          ? "border-gold-300/70 bg-gold-400/15 text-gold-100"
                          : "border-white/10 bg-night-900/70 text-ivory/55 hover:border-gold-300/40 hover:text-gold-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleCosmetics.map((item) => {
                    const owned = active.cosmeticInventory.includes(item.id);
                    const equipped = active.cosmeticEquipped[item.slot] === item.id;
                    const pending = pendingCosmetic === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleCosmeticAction(item)}
                        disabled={pending}
                        className={`group min-h-[150px] rounded-[22px] border p-3 text-left transition disabled:opacity-60 ${
                          equipped
                            ? "border-gold-300/70 bg-gold-400/12"
                            : owned
                              ? "border-emerald-300/35 bg-emerald-400/8 hover:border-gold-300/45"
                              : "border-white/10 bg-night-900/65 hover:border-violet-300/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-lg"
                            style={{
                              background: `${item.color || active.color}22`,
                              color: item.color || active.color,
                              boxShadow: `0 0 18px -10px ${item.color || active.color}`,
                            }}
                          >
                            {item.icon || "✦"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ivory">
                              {item.name}
                            </span>
                            <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-ivory/45">
                              {RARITY_LABELS[item.rarity] ?? item.rarity}
                            </span>
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-ivory/58">
                          {item.description}
                        </p>
                        <span className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-ivory/62">
                            {cosmeticPriceLabel(item)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                              equipped
                                ? "bg-gold-300/20 text-gold-100"
                                : owned
                                  ? "bg-emerald-300/15 text-emerald-100"
                                  : "bg-violet-300/12 text-violet-100"
                            }`}
                          >
                            {pending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : equipped ? (
                              <Check className="h-3 w-3" />
                            ) : owned ? (
                              <Sparkles className="h-3 w-3" />
                            ) : item.currency === "free" ? (
                              <Sparkles className="h-3 w-3" />
                            ) : (
                              <ShoppingBag className="h-3 w-3" />
                            )}
                            {equipped
                              ? "Équipé"
                              : owned
                                ? "Équiper"
                                : item.currency === "free"
                                  ? "Débloquer"
                                  : "Acheter"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {visibleCosmetics.length === 0 && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-night-900/65 p-4 text-sm text-ivory/55">
                    <Lock className="mb-2 h-4 w-4 text-gold-200" />
                    Aucun cosmétique disponible dans cette catégorie pour le moment.
                  </div>
                )}
              </div>
            </div>
          </div>

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
      <FamiliarPortrait familiar={familiar} />
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
