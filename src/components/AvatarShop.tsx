/**
 * Boutique avatar — catalogue d'items cosmétiques achetables avec les
 * bourses internes (Lueurs / Sylvins).
 */
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Heart, Lock, Sparkles } from "lucide-react";
import { AvatarViewer } from "./AvatarViewer";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { PREMIUM_AVATAR_PACK } from "../data/premiumAvatarPack";
import {
  EQUIP_SLOT,
  SHOP_CATALOG,
  type ShopCategory,
  type ShopItem,
} from "../lib/avatarShop";
import { isAvatar3DUrl } from "../lib/avatar3d";
import { compatibilityForItem } from "../lib/avatarHumanoidCompatibility";

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
    hint: "Silhouettes complètes visibles sur votre double.",
  },
  {
    id: "accessory3d",
    label: "Accessoires 3D",
    hint: "Couronnes, halos, masques et ornements à 360°.",
  },
  {
    id: "frame",
    label: "Parures",
    hint: "Effets décoratifs pour les portraits, posts et profils.",
  },
  {
    id: "scene",
    label: "Scènes",
    hint: "Fonds animés équipables autour de votre avatar.",
  },
];

function slotForCategory(category: ShopCategory): string | null {
  switch (category) {
    case "frame":
      return EQUIP_SLOT.Frame;
    case "scene":
      return EQUIP_SLOT.Scene;
    case "outfit3d":
      return EQUIP_SLOT.Outfit3D;
    case "accessory3d":
      return EQUIP_SLOT.Accessory3D;
    default:
      return null;
  }
}

function itemPriceLabel(item: ShopItem) {
  return `${item.price} ${item.currency === "lueurs" ? "Lueurs" : "Sylvins"}`;
}

export function AvatarShop() {
  const {
    profile,
    buyItem,
    addToWishlist,
    removeFromWishlist,
    setEquipped,
  } = useProfile();
  const { notify } = useToast();
  const [tab, setTab] = useState<ShopCategory>("outfit3d");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wishlistBusyId, setWishlistBusyId] = useState<string | null>(null);

  const items = useMemo(
    () => SHOP_CATALOG.filter((item) => item.category === tab),
    [tab],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!selectedItem && items[0]) setSelectedId(items[0].id);
  }, [items, selectedItem]);

  const ownedIds = useMemo(
    () => new Set(profile?.inventory ?? []),
    [profile?.inventory],
  );
  const wishlistIds = useMemo(
    () => new Set(profile?.wishlist ?? []),
    [profile?.wishlist],
  );
  const equippedBySlot = useMemo(
    () => profile?.equipped ?? {},
    [profile?.equipped],
  );

  const previewEquipped = useMemo(() => {
    const next = { ...equippedBySlot };
    const slot = selectedItem ? slotForCategory(selectedItem.category) : null;
    if (selectedItem && slot) next[slot] = selectedItem.id;
    return next;
  }, [equippedBySlot, selectedItem]);

  const premiumPreviewAvatar =
    (isAvatar3DUrl(profile?.avatarUrl) ? profile?.avatarUrl : null) ??
    PREMIUM_AVATAR_PACK.vrmModels[0]?.path ??
    null;

  const groupedItems = useMemo(() => {
    if (tab !== "accessory3d") return [["Tous", items]] as const;
    const groups = new Map<string, ShopItem[]>();
    for (const item of items) {
      const key = item.wearableFamily ?? "Autres";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
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
          ? "Pas assez de Lueurs. Revenez collecter ou réclamer votre récompense."
          : "Pas assez de Sylvins. Un pack boutique peut compléter votre solde.",
        "error",
      );
      return;
    }
    setSelectedId(item.id);
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

  async function handleEquip(item: ShopItem) {
    const slot = slotForCategory(item.category);
    if (!profile || !slot) return;
    setSelectedId(item.id);
    setBusyId(item.id);
    try {
      const activeId = equippedBySlot[slot] ?? null;
      await setEquipped(slot, activeId === item.id ? null : item.id);
      notify(
        activeId === item.id
          ? `${item.name} retiré.`
          : `${item.name} équipé ✨`,
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Impossible d'équiper cet item.",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleWishlist(item: ShopItem) {
    if (!profile) {
      notify("Connectez-vous pour utiliser la wishlist.", "error");
      return;
    }
    setSelectedId(item.id);
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

  function renderCard(item: ShopItem) {
    const owned = ownedIds.has(item.id);
    const wished = wishlistIds.has(item.id);
    const balance =
      profile?.[item.currency === "lueurs" ? "lueurs" : "sylvins"] ?? 0;
    const canAfford = balance >= item.price;
    const busy = busyId === item.id;
    const wishlistBusy = wishlistBusyId === item.id;
    const slot = slotForCategory(item.category);
    const equipped = !!slot && equippedBySlot[slot] === item.id;
    const selected = selectedItem?.id === item.id;
    const humanoidCompatibility = compatibilityForItem(item);

    return (
      <article
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId(item.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setSelectedId(item.id);
        }}
        className={clsx(
          "group flex h-full cursor-pointer flex-col rounded-3xl border p-4 text-left transition",
          selected
            ? "border-gold-300/80 bg-gold-500/15 shadow-[0_0_30px_rgba(250,204,21,0.14)]"
            : owned
              ? "border-gold-400/50 bg-gold-500/10"
              : "border-royal-500/30 bg-night-950/60 hover:border-gold-400/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-3xl" aria-hidden>
            {item.icon}
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-ivory/50">
              {CATEGORY_LABEL[item.category]}
            </span>
            {!owned && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleToggleWishlist(item);
                }}
                disabled={wishlistBusy || !profile}
                aria-pressed={wished}
                aria-label={
                  wished
                    ? "Retirer de ma liste de souhaits"
                    : "Ajouter à ma liste de souhaits"
                }
                className={clsx(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
                  wished
                    ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
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

        <h4 className="mt-3 font-display text-lg text-ivory">{item.name}</h4>
        <p className="mt-1 min-h-10 text-[12px] leading-5 text-ivory/65">
          {item.description}
        </p>
        {humanoidCompatibility && (
          <span
            className={clsx(
              "mt-3 inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
              humanoidCompatibility.status === "classic-fallback"
                ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100",
            )}
          >
            {humanoidCompatibility.label}
          </span>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <span
            className={clsx(
              "rounded-full px-3 py-1.5 text-[11px] font-semibold",
              item.currency === "lueurs"
                ? "bg-emerald-400/10 text-emerald-200"
                : "bg-gold-500/15 text-gold-200",
            )}
          >
            {itemPriceLabel(item)}
          </span>
          {owned ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleEquip(item);
              }}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-royal-500/40 px-3 py-2 font-regal text-[11px] tracking-[0.16em] text-ivory/80 transition hover:border-gold-300/50 hover:text-gold-100 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {busy ? "Maj..." : equipped ? "Retirer" : "Équiper"}
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleBuy(item);
              }}
              disabled={busy || !canAfford}
              className={clsx(
                "inline-flex min-h-10 items-center gap-2 rounded-full px-3 py-2 font-regal text-[11px] tracking-[0.16em] transition",
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
              {busy ? "Achat..." : "Acheter"}
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="card-royal overflow-visible p-4 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            ✦ Boutique d'avatar
          </p>
          <h3 className="mt-1 font-display text-2xl text-gold-200">
            Parez votre double
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ivory/60">
            Touchez un item pour le prévisualiser immédiatement sur votre avatar,
            puis achetez ou équipez sans remonter en haut de page.
          </p>
        </div>
        {profile && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gold-400/30 bg-night-950/60 p-2 text-center text-[11px] text-ivory/80 md:min-w-44">
            <div className="rounded-xl bg-emerald-400/10 px-3 py-2">
              <span className="block text-base font-semibold text-emerald-200">
                {profile.lueurs}
              </span>
              Lueurs
            </div>
            <div className="rounded-xl bg-gold-500/10 px-3 py-2">
              <span className="block text-base font-semibold text-gold-200">
                {profile.sylvins}
              </span>
              Sylvins
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto border-b border-royal-500/20 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                "shrink-0 rounded-full border px-4 py-2 font-regal text-[11px] tracking-[0.18em] transition",
                active
                  ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                  : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40 hover:text-gold-200",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(230px,320px)_1fr]">
        <aside className="sticky top-20 z-20 self-start rounded-[28px] border border-gold-400/30 bg-night-950/90 p-3 shadow-[0_18px_50px_rgba(2,6,23,0.42)] backdrop-blur-xl lg:top-24 lg:p-4">
          <div className="grid grid-cols-[112px_1fr] gap-3 lg:block">
            <AvatarViewer
              src={premiumPreviewAvatar}
              fallbackImage={profile?.avatarImageUrl ?? null}
              alt="Aperçu avatar boutique"
              size="portrait"
              framing="body"
              autoRotate={false}
              equippedFrameId={previewEquipped[EQUIP_SLOT.Frame] ?? null}
              equippedSceneId={previewEquipped[EQUIP_SLOT.Scene] ?? null}
              equippedOutfit3DId={previewEquipped[EQUIP_SLOT.Outfit3D] ?? null}
              equippedAccessory3DId={
                previewEquipped[EQUIP_SLOT.Accessory3D] ?? null
              }
              className="min-h-[150px] lg:min-h-[320px]"
            />
            <div className="min-w-0 lg:mt-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300">
                Aperçu direct
              </p>
              <h4 className="mt-1 truncate font-display text-lg text-ivory lg:text-xl">
                {selectedItem?.name ?? "Sélectionnez un item"}
              </h4>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-ivory/60">
                {selectedItem?.description ??
                  "Touchez une carte pour voir le rendu sur votre avatar."}
              </p>
              {selectedItem && (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-ivory/65">
                    {CATEGORY_LABEL[selectedItem.category]}
                  </span>
                  <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-2.5 py-1 text-gold-200">
                    {itemPriceLabel(selectedItem)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <p className="mb-4 text-xs text-ivory/45">
            {TABS.find((t) => t.id === tab)?.hint}
          </p>
          <div className="space-y-6">
            {groupedItems.map(([group, groupItems]) => (
              <div key={group}>
                {tab === "accessory3d" && (
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ivory/50">
                    {group}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groupItems.map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
