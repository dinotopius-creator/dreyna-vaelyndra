/**
 * Boutique avatar — catalogue d'items cosmétiques achetables avec les
 * bourses internes (Lueurs / Sylvins).
 *
 * Sépare 3 familles (styles, fonds, parures) via onglets. Chaque card
 * montre l'icône, le nom, la description et un bouton :
 *   - « Débloqué » si l'item est déjà dans l'inventaire
 *   - « Acheter XX Lueurs/Sylvins » sinon, désactivé si solde insuffisant
 *
 * La logique d'achat (débit + ajout inventaire) vit dans ProfileContext.
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Lock, Check, Sparkles } from "lucide-react";
import { SHOP_CATALOG, type ShopCategory, type ShopItem } from "../lib/avatarShop";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";

const TABS: { id: ShopCategory; label: string; hint: string }[] = [
  {
    id: "style",
    label: "Styles",
    hint: "Débloquez de nouveaux styles pour l'atelier.",
  },
  {
    id: "background",
    label: "Fonds",
    hint: "Couleurs exclusives en arrière-plan.",
  },
  {
    id: "frame",
    label: "Parures",
    hint: "Accessoires posés au-dessus de votre avatar.",
  },
  {
    id: "scene",
    label: "Scènes",
    hint: "Halos animés équipables autour de votre médaillon.",
  },
];

export function AvatarShop() {
  const { profile, buyItem } = useProfile();
  const { notify } = useToast();
  const [tab, setTab] = useState<ShopCategory>("style");
  const [busyId, setBusyId] = useState<string | null>(null);

  const ownedIds = useMemo(
    () => new Set(profile?.inventory ?? []),
    [profile?.inventory],
  );

  const items = SHOP_CATALOG.filter((item) => item.category === tab);

  async function handleBuy(item: ShopItem) {
    if (!profile) {
      notify("Connectez-vous pour acheter des items.", "error");
      return;
    }
    const balance =
      item.currency === "lueurs" ? profile.lueurs : profile.sylvins;
    if (balance < item.price) {
      notify(
        item.currency === "lueurs"
          ? "Pas assez de Lueurs — récompense quotidienne dispo ?"
          : "Pas assez de Sylvins — un pack boutique vous attend.",
        "error",
      );
      return;
    }
    setBusyId(item.id);
    try {
      await buyItem({
        itemId: item.id,
        currency: item.currency,
        price: item.price,
      });
      notify(`${item.name} ajouté à votre inventaire ✨`);
    } catch {
      notify("L'achat n'a pas abouti. Réessayez.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card-royal space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            ✦ Boutique d'avatar
          </p>
          <h3 className="mt-1 font-display text-2xl text-gold-200">
            Parez votre double
          </h3>
          <p className="mt-1 text-sm text-ivory/60">
            Utilisez vos Lueurs et vos Sylvins pour débloquer des styles, des
            fonds ou des parures. Rien n'expire, tout est cumulable.
          </p>
        </div>
        {profile && (
          <div className="hidden flex-shrink-0 rounded-2xl border border-gold-400/30 bg-night-950/60 px-4 py-2 text-right text-[11px] text-ivory/80 md:block">
            <div>
              <span className="text-gold-200">{profile.lueurs}</span> Lueurs
            </div>
            <div>
              <span className="text-gold-300">{profile.sylvins}</span> Sylvins
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-royal-500/20 pb-3">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                "rounded-full border px-4 py-1.5 font-regal text-[11px] tracking-[0.22em] transition",
                active
                  ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                  : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40 hover:text-gold-200",
              )}
            >
              {t.label}
            </button>
          );
        })}
        <p className="ml-auto self-center text-[11px] text-ivory/45">
          {TABS.find((t) => t.id === tab)?.hint}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const owned = ownedIds.has(item.id);
          const balance =
            profile?.[item.currency === "lueurs" ? "lueurs" : "sylvins"] ?? 0;
          const canAfford = balance >= item.price;
          const busy = busyId === item.id;
          return (
            <article
              key={item.id}
              className={clsx(
                "flex h-full flex-col rounded-2xl border p-4 transition",
                owned
                  ? "border-gold-400/60 bg-gold-500/10"
                  : "border-royal-500/30 bg-night-950/60 hover:border-gold-400/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
                  {item.category === "style"
                    ? "Style"
                    : item.category === "background"
                      ? "Fond"
                      : "Parure"}
                </span>
              </div>
              <h4 className="mt-3 font-display text-lg text-ivory">
                {item.name}
              </h4>
              <p className="mt-1 text-[12px] text-ivory/65">
                {item.description}
              </p>
              <div className="mt-auto pt-4">
                {owned ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-gold-500/15 px-3 py-1.5 text-[11px] font-semibold text-gold-200">
                    <Check className="h-3.5 w-3.5" /> Débloqué
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBuy(item)}
                    disabled={busy || !canAfford}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-regal text-[11px] tracking-[0.16em] transition",
                      canAfford
                        ? "bg-gold-shine text-night-900 hover:brightness-110"
                        : "border border-royal-500/40 text-ivory/50",
                      busy && "opacity-60",
                    )}
                  >
                    {canAfford ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {busy
                      ? "Achat…"
                      : `${item.price} ${item.currency === "lueurs" ? "Lueurs" : "Sylvins"}`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
