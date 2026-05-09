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
import { Lock, Check, Heart, Sparkles } from "lucide-react";
import { SHOP_CATALOG, type ShopCategory, type ShopItem } from "../lib/avatarShop";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";

const CATEGORY_LABEL: Record<ShopCategory, string> = {
  style: "Style",
  background: "Fond",
  frame: "Parure",
  scene: "Scène",
  outfit3d: "Tenue 3D",
  accessory3d: "Accessoire 3D",
};

const TABS: { id: ShopCategory; label: string; hint: string }[] = [
  {
    id: "outfit3d",
    label: "Tenues 3D",
    hint: "Habillez votre avatar 3D avec des silhouettes premium.",
  },
  {
    id: "accessory3d",
    label: "Accessoires 3D",
    hint: "Couronnes, halos et ornements visibles à 360°.",
  },
  {
    id: "frame",
    label: "Parures",
    hint: "Effets de surimpression pour les cartes et portraits.",
  },
  {
    id: "scene",
    label: "Scènes",
    hint: "Halos animés équipables autour de votre médaillon.",
  },
];

export function AvatarShop() {
  const { profile, buyItem, addToWishlist, removeFromWishlist } = useProfile();
  const { notify } = useToast();
  const [tab, setTab] = useState<ShopCategory>("outfit3d");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Pendant un toggle wishlist on empêche les clics répétés sur le même
  // cœur (latence réseau). Les autres items restent interactifs.
  const [wishlistBusyId, setWishlistBusyId] = useState<string | null>(null);

  const ownedIds = useMemo(
    () => new Set(profile?.inventory ?? []),
    [profile?.inventory],
  );
  const wishlistIds = useMemo(
    () => new Set(profile?.wishlist ?? []),
    [profile?.wishlist],
  );

  const items = SHOP_CATALOG.filter((item) => item.category === tab);
  const groupedAccessories = useMemo(() => {
    if (tab !== "accessory3d") return [];
    const map = new Map<string, ShopItem[]>();
    for (const item of items) {
      const key = item.wearableFamily ?? "Autres";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items, tab]);

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

  async function handleToggleWishlist(item: ShopItem) {
    if (!profile) {
      notify("Connectez-vous pour utiliser la wishlist.", "error");
      return;
    }
    setWishlistBusyId(item.id);
    const isWished = wishlistIds.has(item.id);
    try {
      if (isWished) {
        await removeFromWishlist(item.id);
        notify(`${item.name} retiré de votre liste de souhaits.`);
      } else {
        await addToWishlist(item.id);
        notify(`${item.name} ajouté à votre liste de souhaits ❤️`);
      }
    } catch {
      notify("Impossible de mettre à jour la liste de souhaits.", "error");
    } finally {
      setWishlistBusyId(null);
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
            Utilisez vos Lueurs et vos Sylvins pour débloquer tenues,
            accessoires et effets de scène pour votre avatar 3D. Rien
            n'expire, tout est cumulable.
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

      {tab === "accessory3d" ? (
        <div className="space-y-5">
          {groupedAccessories.map(([family, familyItems]) => (
            <div key={family}>
              <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/50">
                {family}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {familyItems.map((item) => {
                  const owned = ownedIds.has(item.id);
                  const wished = wishlistIds.has(item.id);
                  const balance =
                    profile?.[item.currency === "lueurs" ? "lueurs" : "sylvins"] ?? 0;
                  const canAfford = balance >= item.price;
                  const busy = busyId === item.id;
                  const wishlistBusy = wishlistBusyId === item.id;
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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
                            {CATEGORY_LABEL[item.category]}
                          </span>
                          {!owned && (
                            <button
                              type="button"
                              onClick={() => handleToggleWishlist(item)}
                              disabled={wishlistBusy || !profile}
                              aria-pressed={wished}
                              aria-label={
                                wished
                                  ? "Retirer de ma liste de souhaits"
                                  : "Ajouter à ma liste de souhaits"
                              }
                              title={
                                wished
                                  ? "Retirer de ma liste de souhaits"
                                  : "Ajouter à ma liste de souhaits"
                              }
                              className={clsx(
                                "inline-flex h-7 w-7 items-center justify-center rounded-full border transition",
                                wished
                                  ? "border-rose-400/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                                  : "border-royal-500/40 text-ivory/55 hover:border-rose-300/60 hover:text-rose-200",
                                wishlistBusy && "opacity-60",
                              )}
                            >
                              <Heart
                                className="h-3.5 w-3.5"
                                fill={wished ? "currentColor" : "none"}
                                strokeWidth={1.8}
                              />
                            </button>
                          )}
                        </div>
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
            </div>
          ))}
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const owned = ownedIds.has(item.id);
          const wished = wishlistIds.has(item.id);
          const balance =
            profile?.[item.currency === "lueurs" ? "lueurs" : "sylvins"] ?? 0;
          const canAfford = balance >= item.price;
          const busy = busyId === item.id;
          const wishlistBusy = wishlistBusyId === item.id;
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
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
                    {CATEGORY_LABEL[item.category]}
                  </span>
                  {!owned && (
                    <button
                      type="button"
                      onClick={() => handleToggleWishlist(item)}
                      disabled={wishlistBusy || !profile}
                      aria-pressed={wished}
                      aria-label={
                        wished
                          ? "Retirer de ma liste de souhaits"
                          : "Ajouter à ma liste de souhaits"
                      }
                      title={
                        wished
                          ? "Retirer de ma liste de souhaits"
                          : "Ajouter à ma liste de souhaits"
                      }
                      className={clsx(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full border transition",
                        wished
                          ? "border-rose-400/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                          : "border-royal-500/40 text-ivory/55 hover:border-rose-300/60 hover:text-rose-200",
                        wishlistBusy && "opacity-60",
                      )}
                    >
                      <Heart
                        className="h-3.5 w-3.5"
                        fill={wished ? "currentColor" : "none"}
                        strokeWidth={1.8}
                      />
                    </button>
                  )}
                </div>
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
      )}
    </section>
  );
}
