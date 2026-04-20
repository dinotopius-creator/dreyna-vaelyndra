/**
 * Section "Liste de souhaits" (PR G).
 *
 * Affichée sur `/moi` (wishlist de l'utilisateur courant) et sur `/u/:id`
 * (wishlist d'un autre elfe).
 *
 * - Sur son propre profil : on affiche les items souhaités + un bouton pour
 *   retirer (cœur rempli qu'on peut décliquer). Aucun bouton "Offrir".
 * - Sur le profil d'un autre : on affiche les items + un bouton "Offrir"
 *   qui débite la bourse du visiteur et ajoute l'item à l'inventaire du
 *   destinataire (atomique côté backend).
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Gift, Heart, Sparkles } from "lucide-react";
import { SHOP_CATALOG, type ShopItem } from "../lib/avatarShop";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";

interface Props {
  /** Wishlist du profil affiché (ids d'items). */
  wishlist: string[];
  /** Inventaire du profil affiché (pour masquer les items déjà possédés). */
  ownedIds?: string[];
  /** Id du user dont on affiche le profil. */
  targetUserId: string;
  /** Nom affiché (pour les toasts / empty state). */
  targetUsername: string;
  /** true si on regarde son propre profil. */
  isSelf: boolean;
  /**
   * Notifié après un cadeau réussi (envoyé à un autre user). Permet à la
   * page parente de rafraîchir le profil affiché (inventaire + wishlist).
   */
  onGifted?: () => void;
}

export function WishlistSection({
  wishlist,
  ownedIds,
  targetUserId,
  targetUsername,
  isSelf,
  onGifted,
}: Props) {
  const { profile, removeFromWishlist, giftItem } = useProfile();
  const { notify } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const ownedSet = useMemo(() => new Set(ownedIds ?? []), [ownedIds]);

  // On résout chaque id vers l'entrée du catalogue. Les ids inconnus (legacy
  // ou custom items futurs) sont ignorés silencieusement — on ne sait pas
  // comment les représenter visuellement.
  const items: ShopItem[] = useMemo(() => {
    const seen = new Set<string>();
    const resolved: ShopItem[] = [];
    for (const id of wishlist) {
      if (seen.has(id) || ownedSet.has(id)) continue;
      const item = SHOP_CATALOG.find((it) => it.id === id);
      if (item) {
        seen.add(id);
        resolved.push(item);
      }
    }
    return resolved;
  }, [wishlist, ownedSet]);

  async function handleRemove(item: ShopItem) {
    setBusyId(item.id);
    try {
      await removeFromWishlist(item.id);
      notify(`${item.name} retiré de votre liste de souhaits.`);
    } catch {
      notify("Impossible de retirer cet item.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleGift(item: ShopItem) {
    if (!profile) {
      notify("Connectez-vous pour offrir un cadeau.", "error");
      return;
    }
    const balance =
      item.currency === "lueurs" ? profile.lueurs : profile.sylvins;
    if (balance < item.price) {
      notify(
        item.currency === "lueurs"
          ? "Pas assez de Lueurs pour offrir cet item."
          : "Pas assez de Sylvins pour offrir cet item.",
        "error",
      );
      return;
    }
    setBusyId(item.id);
    try {
      await giftItem({
        receiverId: targetUserId,
        itemId: item.id,
        price: item.price,
        currency: item.currency,
      });
      notify(`🎁 ${item.name} offert à ${targetUsername} !`);
      onGifted?.();
    } catch {
      notify("Le cadeau n'a pas abouti. Réessayez.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const canGift = !isSelf && profile && profile.id !== targetUserId;

  return (
    <section className="card-royal p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-rose-300" />
        <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
          Liste de souhaits
        </p>
      </div>
      <h3 className="mt-2 font-display text-xl text-gold-200">
        {isSelf
          ? "Vos envies cosmétiques"
          : `Les envies de ${targetUsername}`}
      </h3>
      <p className="mt-1 text-[12px] text-ivory/60">
        {isSelf
          ? "Ajoutez des items depuis la boutique en cliquant sur le cœur ❤️. Les autres elfes pourront vous les offrir."
          : `Offrez un item depuis la boutique — il sera ajouté à l'inventaire de ${targetUsername} et retiré de sa liste.`}
      </p>

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-royal-500/20 bg-night-950/40 p-4 text-center text-[12px] text-ivory/55">
          {isSelf
            ? "Aucun item souhaité pour le moment — parcourez la boutique !"
            : "Aucun souhait exprimé pour l'instant."}
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const busy = busyId === item.id;
            const balance =
              profile?.[item.currency === "lueurs" ? "lueurs" : "sylvins"] ?? 0;
            const canAfford = balance >= item.price;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-royal-500/30 bg-night-950/60 p-3"
              >
                <span className="text-2xl" aria-hidden>
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm text-ivory">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-ivory/55">
                    {item.price}{" "}
                    {item.currency === "lueurs" ? "Lueurs" : "Sylvins"}
                  </p>
                </div>
                {isSelf ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    disabled={busy}
                    aria-label="Retirer de ma liste de souhaits"
                    title="Retirer de ma liste de souhaits"
                    className={clsx(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25",
                      busy && "opacity-60",
                    )}
                  >
                    <Heart
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      strokeWidth={1.8}
                    />
                  </button>
                ) : canGift ? (
                  <button
                    type="button"
                    onClick={() => handleGift(item)}
                    disabled={busy || !canAfford}
                    aria-label={`Offrir ${item.name} à ${targetUsername}`}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-regal text-[11px] tracking-[0.16em] transition",
                      canAfford
                        ? "bg-gold-shine text-night-900 hover:brightness-110"
                        : "border border-royal-500/40 text-ivory/50",
                      busy && "opacity-60",
                    )}
                  >
                    {canAfford ? (
                      <Gift className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {busy
                      ? "Envoi…"
                      : canAfford
                        ? "Offrir"
                        : "Solde bas"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
