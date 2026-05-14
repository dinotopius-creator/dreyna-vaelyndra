/**
 * Boutique des familiers (PR familiers#4).
 *
 * Catalogue complet (gratuits + premium) avec filtre par rareté, badge
 * "déjà possédé" / "actif" et achat des familiers premium en Sylvins.
 *
 * Le débit Sylvins est atomique côté serveur (cf. `POST /users/{id}/
 * familiers/buy`) — on se contente d'afficher l'état et de rafraîchir
 * `backendMe` après chaque achat pour synchroniser le solde.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Lock, Sparkles, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  RARITY_LABELS,
  buyFamiliar,
  fetchFamiliarsCatalog,
  fetchUserFamiliars,
  type FamiliarCatalogItem,
  type FamiliarCollection,
} from "../lib/familiarsApi";

type RarityFilter = "all" | "commun" | "rare" | "epique" | "legendaire" | "mythique";

const RARITY_ORDER: RarityFilter[] = [
  "commun",
  "rare",
  "epique",
  "legendaire",
  "mythique",
];

const RARITY_GRADIENT: Record<string, string> = {
  commun: "from-slate-400/40 to-slate-200/10",
  rare: "from-sky-400/40 to-sky-200/10",
  epique: "from-violet-400/40 to-violet-200/10",
  legendaire: "from-amber-400/40 to-amber-200/10",
  mythique: "from-fuchsia-400/50 via-rose-400/30 to-amber-200/10",
};

export function BoutiqueFamiliars() {
  const { user, backendMe, refreshBackendMe } = useAuth();
  const { notify } = useToast();
  const [catalog, setCatalog] = useState<FamiliarCatalogItem[] | null>(null);
  const [collection, setCollection] = useState<FamiliarCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RarityFilter>("all");
  const [buying, setBuying] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchFamiliarsCatalog();
      setCatalog(items);
      if (user?.id) {
        const col = await fetchUserFamiliars(user.id);
        setCollection(col);
      } else {
        setCollection(null);
      }
    } catch {
      notify("Impossible de charger la boutique.", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.id, notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ownedIds = useMemo(
    () => new Set((collection?.owned ?? []).map((o) => o.familiarId)),
    [collection],
  );

  const filtered = useMemo(() => {
    if (!catalog) return [] as FamiliarCatalogItem[];
    const sorted = [...catalog].sort((a, b) => {
      // Free d'abord, puis premium, puis par prix croissant à l'intérieur.
      if (a.tier !== b.tier) return a.tier === "free" ? -1 : 1;
      return a.priceSylvins - b.priceSylvins;
    });
    if (filter === "all") return sorted;
    return sorted.filter((f) => f.rarity === filter);
  }, [catalog, filter]);

  const sylvinsTotal =
    (backendMe?.sylvins_paid ?? 0) + (backendMe?.sylvins_promo ?? 0);

  async function purchase(item: FamiliarCatalogItem) {
    if (!user?.id) {
      notify("Connecte-toi pour acheter un familier.", "error");
      return;
    }
    if (ownedIds.has(item.id)) return;
    if (item.tier === "premium" && sylvinsTotal < item.priceSylvins) {
      notify(
        `Solde insuffisant : ${item.priceSylvins} Sylvins requis, tu en as ${sylvinsTotal}.`,
        "error",
      );
      return;
    }
    const ok = window.confirm(
      item.tier === "premium"
        ? `Acquérir ${item.name} pour ${item.priceSylvins} Sylvins ?\n\nIl rejoindra ta collection. Tu pourras l'activer depuis la page Mon Familier (1er switch gratuit, puis 300 Sylvins).`
        : `Ajouter ${item.name} à ta collection (gratuit) ?`,
    );
    if (!ok) return;
    setBuying(item.id);
    try {
      const updated = await buyFamiliar(user.id, item.id);
      setCollection(updated);
      notify(`${item.icon} ${item.name} rejoint ta collection.`);
      // Synchronise le solde Sylvins après débit serveur.
      await refreshBackendMe();
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.message ? e.message : "Achat impossible.";
      notify(msg, "error");
    } finally {
      setBuying(null);
    }
  }

  if (loading) {
    return (
      <section className="mx-auto flex max-w-5xl items-center justify-center px-4 py-20 text-ivory/70">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-10">
      <div className="mb-2">
        <Link
          to="/familier"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-ivory/60 hover:text-ivory"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Mon Familier
        </Link>
      </div>
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-gold-300">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="text-xs uppercase tracking-[0.3em]">Boutique</span>
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <h1 className="heading-gold text-2xl sm:text-3xl">
          Boutique des familiers
        </h1>
        <p className="max-w-xl text-sm text-ivory/70">
          Familiers d'éveil et ancestraux. Les ancestraux se débloquent en
          Sylvins et apportent des animations rares, des effets de particules
          et des cadres premium sur ton profil.
        </p>
        {user?.id && (
          <div className="mt-1 rounded-full bg-night-800/60 px-3 py-1 text-[11px] text-ivory/70">
            Solde :{" "}
            <span className="text-gold-200">
              {sylvinsTotal.toLocaleString("fr-FR")}
            </span>{" "}
            Sylvins
          </div>
        )}
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <RarityChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Tout"
        />
        {RARITY_ORDER.map((r) => (
          <RarityChip
            key={r}
            active={filter === r}
            onClick={() => setFilter(r)}
            label={RARITY_LABELS[r] ?? r}
          />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const owned = ownedIds.has(item.id);
          const active = collection?.activeFamiliarId === item.id;
          return (
            <BoutiqueCard
              key={item.id}
              item={item}
              owned={owned}
              active={active}
              pending={buying === item.id}
              canAfford={
                item.tier === "free" || sylvinsTotal >= item.priceSylvins
              }
              onBuy={() => purchase(item)}
            />
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-ivory/60">
            Aucun familier dans cette rareté.
          </p>
        )}
      </div>

      <p className="mt-10 text-center text-[11px] text-ivory/50">
        Achat irréversible. Le familier rejoint immédiatement ta collection.
        Tu pourras l'activer depuis la page Mon Familier.
      </p>
    </section>
  );
}

function RarityChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest transition ${
        active
          ? "border-gold-400 bg-gold-400/15 text-gold-200"
          : "border-ivory/10 bg-night-800/40 text-ivory/60 hover:border-ivory/25 hover:text-ivory"
      }`}
    >
      {label}
    </button>
  );
}

interface CardProps {
  item: FamiliarCatalogItem;
  owned: boolean;
  active: boolean;
  pending: boolean;
  canAfford: boolean;
  onBuy: () => void;
}

function BoutiqueCard({
  item,
  owned,
  active,
  pending,
  canAfford,
  onBuy,
}: CardProps) {
  const grad = RARITY_GRADIENT[item.rarity] ?? RARITY_GRADIENT.commun;
  return (
    <motion.div
      className="card-royal relative flex flex-col overflow-hidden p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${grad} opacity-60`}
        aria-hidden
      />
      <div className="relative flex flex-col items-center text-center">
        <motion.div
          className="flex h-28 w-28 items-center justify-center rounded-3xl border text-6xl"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${item.color}33, ${item.color}11 60%, transparent)`,
            borderColor: `${item.color}55`,
            boxShadow: `0 0 40px -10px ${item.color}`,
          }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <span style={{ filter: `drop-shadow(0 0 10px ${item.color})` }}>
            {item.icon}
          </span>
        </motion.div>
        <h3 className="mt-3 text-lg font-semibold text-ivory">{item.name}</h3>
        <span className="mt-0.5 text-[11px] uppercase tracking-widest text-ivory/60">
          {RARITY_LABELS[item.rarity] ?? item.rarity} •{" "}
          {item.tier === "premium" ? "Ancestral" : "D'éveil"}
        </span>
        <p className="mt-3 text-xs italic text-ivory/70">"{item.tagline}"</p>
        <p className="mt-2 text-xs leading-snug text-ivory/60">
          {item.description}
        </p>

        <div className="mt-4 grid w-full grid-cols-5 gap-1.5">
          {Object.entries(item.baseStats).map(([key, value]) => {
            const pct = Math.min(100, Math.max(0, value));
            return (
              <div
                key={key}
                className="rounded-md border border-ivory/10 bg-night-800/60 p-1 text-[9px] uppercase tracking-wider text-ivory/50"
                title={`${key}: ${value}`}
              >
                <div className="truncate">{key.split("_")[0]}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-night-900/80">
                  <div
                    className="h-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-gold-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-2">
        <div className="text-sm text-ivory/80">
          {item.tier === "premium" ? (
            <>
              <span className="text-gold-200">
                {item.priceSylvins.toLocaleString("fr-FR")}
              </span>{" "}
              <span className="text-[11px] uppercase tracking-widest text-ivory/50">
                Sylvins
              </span>
            </>
          ) : (
            <span className="text-[11px] uppercase tracking-widest text-emerald-300/80">
              Gratuit
            </span>
          )}
        </div>
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-3 py-1.5 text-[11px] uppercase tracking-widest text-gold-200">
            <Check className="h-3 w-3" aria-hidden /> Actif
          </span>
        ) : owned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1.5 text-[11px] uppercase tracking-widest text-emerald-200">
            <Check className="h-3 w-3" aria-hidden /> Possédé
          </span>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={pending || (!canAfford && item.tier === "premium")}
            className="btn-gold inline-flex items-center gap-2 px-4 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : !canAfford && item.tier === "premium" ? (
              <>
                <Lock className="h-3.5 w-3.5" aria-hidden /> Solde
              </>
            ) : (
              "Acquérir"
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
