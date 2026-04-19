/**
 * Modal "Changer de créature" utilisé depuis `/moi`. Partage la grille
 * utilisée par Register, mais déclenche l'API `PATCH /users/{id}/creature`
 * au lieu du register local.
 */
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { CREATURES } from "../data/creatures";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";

interface Props {
  open: boolean;
  currentCreatureId?: string | null;
  onClose: () => void;
}

export function CreaturePickerModal({
  open,
  currentCreatureId,
  onClose,
}: Props) {
  const { setCreature } = useProfile();
  const { notify } = useToast();
  const [selected, setSelected] = useState<string | null>(
    currentCreatureId ?? null,
  );
  const [pending, setPending] = useState(false);

  if (!open) return null;

  async function confirm() {
    if (!selected) return;
    setPending(true);
    try {
      await setCreature(selected);
      const c = CREATURES.find((x) => x.id === selected);
      notify(
        c
          ? `Ta créature est désormais ${c.icon} ${c.name}.`
          : "Créature mise à jour.",
      );
      onClose();
    } catch {
      notify("Impossible de changer de créature.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card-royal relative w-full max-w-2xl overflow-hidden p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-ivory/60 hover:bg-night-800 hover:text-ivory"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="heading-gold text-center text-2xl">
          Choisis ta créature
        </h2>
        <p className="mt-1 text-center text-sm text-ivory/60">
          Ton essence est visible partout dans le royaume.
        </p>
        <div
          role="radiogroup"
          className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {CREATURES.map((c) => {
            const isSel = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => setSelected(c.id)}
                className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                  isSel
                    ? "border-gold-400 bg-night-700/80"
                    : "border-ivory/10 bg-night-800/60 hover:border-ivory/25"
                }`}
                style={
                  isSel
                    ? {
                        boxShadow: `0 0 0 1px ${c.color}88, 0 0 28px -6px ${c.color}`,
                      }
                    : undefined
                }
              >
                <span
                  className="text-3xl"
                  aria-hidden
                  style={{
                    filter: isSel
                      ? "drop-shadow(0 0 8px " + c.color + ")"
                      : "none",
                  }}
                >
                  {c.icon}
                </span>
                <span className="text-sm font-semibold text-ivory">
                  {c.name}
                </span>
                <span className="text-[11px] leading-snug text-ivory/60">
                  {c.description}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selected || pending}
            className="btn-gold justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Confirmer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
