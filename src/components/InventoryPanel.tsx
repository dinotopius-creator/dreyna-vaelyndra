/**
 * Panneau d'inventaire / équipement.
 *
 * Liste les items cosmétiques possédés par l'utilisateur et, pour les
 * slots avec choix actif (aujourd'hui : `frame`), expose un sélecteur
 * pour équiper/retirer. Les styles et fonds débloqués apparaissent dans
 * l'atelier (AvatarEditor) directement : pas besoin d'équipement
 * explicite ici, on les affiche juste comme tag « Dispo dans l'atelier ».
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { X, Check } from "lucide-react";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { CATALOG_BY_ID, EQUIP_SLOT, SHOP_CATALOG } from "../lib/avatarShop";

export function InventoryPanel() {
  const { profile, setEquipped } = useProfile();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const owned = useMemo(() => {
    const inventory = profile?.inventory ?? [];
    return inventory
      .map((id) => CATALOG_BY_ID[id])
      .filter((item): item is (typeof SHOP_CATALOG)[number] => !!item);
  }, [profile?.inventory]);

  const equippedFrame = profile?.equipped?.[EQUIP_SLOT.Frame] ?? null;

  async function toggleFrame(itemId: string) {
    setBusy(itemId);
    try {
      const next = equippedFrame === itemId ? null : itemId;
      await setEquipped(EQUIP_SLOT.Frame, next);
      notify(
        next
          ? `${CATALOG_BY_ID[itemId]?.name ?? "Parure"} équipée ✨`
          : "Parure retirée.",
        "info",
      );
    } catch {
      notify("Impossible de mettre à jour l'équipement.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (!profile) return null;

  const frames = owned.filter((i) => i.category === "frame");
  const stylesOrBgs = owned.filter((i) => i.category !== "frame");

  return (
    <section className="card-royal space-y-5 p-6">
      <div>
        <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
          ✦ Mon inventaire
        </p>
        <h3 className="mt-1 font-display text-2xl text-gold-200">
          Vos trouvailles ({owned.length})
        </h3>
        <p className="mt-1 text-sm text-ivory/60">
          Équipez une seule parure à la fois — elle se superpose à votre avatar
          partout sur le site.
        </p>
      </div>

      {frames.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ivory/50">
            Parures
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {frames.map((item) => {
              const active = equippedFrame === item.id;
              const isBusy = busy === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleFrame(item.id)}
                  disabled={isBusy}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                    active
                      ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                      : "border-royal-500/30 bg-night-950/60 text-ivory/80 hover:border-gold-400/40",
                    isBusy && "opacity-60",
                  )}
                >
                  <span className="text-2xl" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {item.name}
                    </p>
                    <p className="truncate text-[11px] text-ivory/55">
                      {active ? "Équipée" : "Cliquer pour équiper"}
                    </p>
                  </div>
                  {active ? (
                    <Check className="h-4 w-4 text-gold-300" />
                  ) : (
                    <X className="h-4 w-4 text-ivory/30" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stylesOrBgs.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ivory/50">
            Styles & fonds débloqués
          </p>
          <div className="flex flex-wrap gap-2">
            {stylesOrBgs.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 bg-night-950/60 px-3 py-1.5 text-[11px] text-ivory/75"
              >
                <span aria-hidden>{item.icon}</span>
                {item.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ivory/45">
            Dispo automatiquement dans l'atelier d'avatar.
          </p>
        </div>
      )}

      {owned.length === 0 && (
        <p className="text-[12px] text-ivory/55">
          Vous n'avez encore rien débloqué. Rendez-vous dans la boutique
          avatar ci-dessous pour commencer votre collection.
        </p>
      )}
    </section>
  );
}
