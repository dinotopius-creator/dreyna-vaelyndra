/**
 * Menu contextuel déclenché en cliquant sur le pseudo ou l'avatar d'un
 * message dans l'historique du chat live.
 *
 * Deux profils d'utilisation :
 *   - Tous les viewers → "Voir le profil" (navigation vers `/u/:id`).
 *   - Broadcaster uniquement → en plus, boutons de modération :
 *       * Mute 2 min / 5 min / 10 min (empêche d'envoyer dans le chat).
 *       * Expulser du live (déconnexion + interdiction de rejoindre).
 *
 * Rendu comme une modale centrée full-screen pour rester lisible aussi
 * bien sur téléphone que sur PC. Fermeture par clic sur le fond, touche
 * Échap, ou choix d'une action.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { User, VolumeX, UserMinus, X } from "lucide-react";

interface Props {
  targetUserId: string;
  targetName: string;
  /** Si true, affiche les boutons de modération (broadcaster uniquement). */
  canModerate: boolean;
  onClose: () => void;
  onMute: (durationSeconds: number) => void;
  onKick: (durationSeconds: number) => void;
}

/** Durées de mute proposées (minutes → secondes). */
const MUTE_DURATIONS = [
  { label: "2 min", seconds: 2 * 60 },
  { label: "5 min", seconds: 5 * 60 },
  { label: "10 min", seconds: 10 * 60 },
];

/** Durée de kick par défaut : 10 min, valeur standard "time-out". */
const KICK_DURATION_SECONDS = 10 * 60;

export function LiveUserContextMenu({
  targetUserId,
  targetName,
  canModerate,
  onClose,
  onMute,
  onKick,
}: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 p-4 backdrop-blur"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Actions sur ${targetName}`}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gold-400/30 bg-night-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
              Actions sur
            </p>
            <h3 className="font-display text-xl text-gold-200">{targetName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Link
            to={`/u/${targetUserId}`}
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-ivory/10 bg-night-800/60 px-3 py-2 text-sm text-ivory hover:bg-night-800"
          >
            <User className="h-4 w-4 text-gold-300" />
            Voir le profil
          </Link>

          {canModerate && (
            <>
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
                  Mettre en sourdine
                </p>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {MUTE_DURATIONS.map((d) => (
                    <button
                      key={d.seconds}
                      type="button"
                      onClick={() => onMute(d.seconds)}
                      className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onKick(KICK_DURATION_SECONDS)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25"
              >
                <UserMinus className="h-4 w-4" />
                Expulser du live (10 min)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
