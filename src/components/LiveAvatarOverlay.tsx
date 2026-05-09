/**
 * Overlay « avatar en live » — médaillon paper-doll du broadcaster
 * affiché en surimpression du flux (`/live/:broadcasterId`).
 *
 * Objectif : pendant qu'un streamer partage son écran ou son Twitch, les
 * viewers voient toujours *qui* ils regardent, avec sa scène et sa parure
 * équipées. C'est le pendant « cam ronde » des streamers Twitch, mais
 * sans caméra — l'avatar scellé remplace la webcam.
 *
 * Implémentation :
 * - Fetch du profil serveur du broadcaster (`apiGetProfile`) pour
 *   récupérer `avatarImageUrl`, `equipped.scene`, `equipped.frame`.
 * - Médaillon rond (`AvatarViewer size="square"` avec un ring et une
 *   inset réduite) positionné en absolute sur le stage vidéo.
 * - 4 ancrages (TL/TR/BL/BR) sélectionnables par le host, persistés en
 *   localStorage par broadcaster. Bouton œil pour masquer côté host.
 * - Pour les viewers : overlay visible, pas contrôlable (pas de bouton).
 *   L'ancrage est synchronisé via la même clé localStorage que les
 *   autres préférences UI — pas critique si ça ne se synchronise pas
 *   entre appareils.
 */
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Move } from "lucide-react";
import { AvatarViewer } from "./AvatarViewer";
import { apiGetProfile, type UserProfileDto } from "../lib/api";

type Anchor = "tl" | "tr" | "bl" | "br";

const ANCHORS: { id: Anchor; label: string; className: string }[] = [
  { id: "tl", label: "Haut gauche", className: "top-4 left-4" },
  { id: "tr", label: "Haut droit", className: "top-4 right-4" },
  { id: "bl", label: "Bas gauche", className: "bottom-24 left-4" },
  { id: "br", label: "Bas droit", className: "bottom-24 right-4" },
];

const STORAGE_KEY = "vaelyndra_live_overlay_v1";

interface Prefs {
  anchor: Anchor;
  hidden: boolean;
}

/** Préférences par broadcaster (scope simple : 1 overlay par live). */
function loadPrefs(broadcasterId: string): Prefs {
  if (typeof window === "undefined")
    return { anchor: "br", hidden: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { anchor: "br", hidden: false };
    const all = JSON.parse(raw) as Record<string, Prefs>;
    return all[broadcasterId] ?? { anchor: "br", hidden: false };
  } catch {
    return { anchor: "br", hidden: false };
  }
}

function savePrefs(broadcasterId: string, prefs: Prefs) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Prefs>) : {};
    all[broadcasterId] = prefs;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota / mode privé — overlay reste fonctionnel, on perd juste la persistance.
  }
}

interface Props {
  broadcasterId: string;
  /** Nom affiché sous le médaillon (source de vérité : page Live). */
  broadcasterName: string;
  /** Fallback image si le profil serveur n'a pas encore répondu. */
  fallbackAvatar: string | null;
  /** Si vrai, affiche les contrôles (ancrage, masquer) — uniquement pour le host. */
  showControls: boolean;
}

export function LiveAvatarOverlay({
  broadcasterId,
  broadcasterName,
  fallbackAvatar,
  showControls,
}: Props) {
  const [serverProfile, setServerProfile] = useState<UserProfileDto | null>(
    null,
  );
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(broadcasterId));
  const [menuOpen, setMenuOpen] = useState(false);

  // Reset immédiat sur changement de broadcaster pour éviter un flash d'identité.
  useEffect(() => {
    setServerProfile(null);
    setPrefs(loadPrefs(broadcasterId));
  }, [broadcasterId]);

  // Fetch du profil serveur (avatar + équipement). Silencieusement ignoré
  // si le profil n'existe pas encore (user jamais connecté).
  useEffect(() => {
    if (!broadcasterId) return;
    let cancelled = false;
    apiGetProfile(broadcasterId)
      .then((p) => {
        if (!cancelled) setServerProfile(p);
      })
      .catch(() => {
        if (!cancelled) setServerProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [broadcasterId]);

  const anchorClass = useMemo(
    () => ANCHORS.find((a) => a.id === prefs.anchor)?.className ?? "bottom-24 right-4",
    [prefs.anchor],
  );

  function updatePrefs(next: Partial<Prefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(broadcasterId, merged);
  }

  // Rien à afficher tant qu'on n'a ni profil serveur ni fallback — l'overlay
  // n'a pas de raison d'exister si le broadcaster n'a pas d'avatar.
  const hasAvatar = !!(serverProfile?.avatarImageUrl || fallbackAvatar);
  if (!hasAvatar) return null;

  // Host-only : bouton réafficher si masqué (les viewers ne peuvent pas masquer).
  if (prefs.hidden) {
    if (!showControls) return null;
    return (
      <button
        type="button"
        onClick={() => updatePrefs({ hidden: false })}
        className={clsx(
          "absolute z-20 inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-night-950/80 px-3 py-1.5 text-[11px] font-semibold text-gold-200 shadow-lg backdrop-blur hover:border-gold-300",
          anchorClass,
        )}
      >
        <Eye className="h-3.5 w-3.5" /> Afficher mon avatar
      </button>
    );
  }

  return (
    <div
      className={clsx(
        "pointer-events-auto absolute z-20 flex flex-col items-center gap-1.5",
        anchorClass,
      )}
    >
      <div className="relative w-24 sm:w-28">
        <AvatarViewer
          src={serverProfile?.avatarUrl ?? null}
          fallbackImage={serverProfile?.avatarImageUrl ?? fallbackAvatar}
          alt={`Avatar de ${broadcasterName}`}
          size="square"
          framing="face"
          autoRotate={false}
          equippedFrameId={serverProfile?.equipped?.frame ?? null}
          equippedSceneId={serverProfile?.equipped?.scene ?? null}
          equippedOutfit3DId={serverProfile?.equipped?.outfit3d ?? null}
          equippedAccessory3DId={
            serverProfile?.equipped?.accessory3d ?? null
          }
          className="shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
        />

        {showControls && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Options de l'overlay"
            className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gold-400/60 bg-night-950/90 text-gold-200 shadow-md hover:border-gold-300"
          >
            <Move className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="rounded-full border border-gold-400/40 bg-night-950/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-200 shadow backdrop-blur">
        {broadcasterName}
      </div>

      {showControls && menuOpen && (
        <div
          className={clsx(
            // Le player vidéo parent utilise `overflow-hidden`, donc quand
            // l'overlay est ancré en bas (`bl`/`br`), un menu qui s'ouvre
            // vers le bas serait tronqué. On l'ouvre vers le haut dans ce
            // cas pour qu'il reste entièrement visible.
            "absolute w-44 rounded-xl border border-gold-400/40 bg-night-950/95 p-2 text-[11px] text-ivory/80 shadow-xl",
            prefs.anchor === "bl" || prefs.anchor === "br"
              ? "bottom-full mb-2"
              : "top-full mt-2",
          )}
        >
          <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-gold-300">
            Position
          </p>
          <div className="grid grid-cols-2 gap-1">
            {ANCHORS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  updatePrefs({ anchor: a.id });
                  setMenuOpen(false);
                }}
                className={clsx(
                  "rounded-md border px-2 py-1 text-left transition",
                  prefs.anchor === a.id
                    ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                    : "border-royal-500/30 hover:border-gold-400/40",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              updatePrefs({ hidden: true });
              setMenuOpen(false);
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-royal-500/40 bg-night-900/60 px-2 py-1 text-ivory/70 hover:border-gold-400/40"
          >
            <EyeOff className="h-3.5 w-3.5" /> Masquer pour moi
          </button>
        </div>
      )}
    </div>
  );
}
