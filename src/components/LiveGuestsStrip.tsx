import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  acceptedGuestsFor,
  useLiveInvites,
} from "../contexts/LiveInvitesContext";
import { useLiveMeshAudio } from "../contexts/LiveMeshAudioContext";

/**
 * Bandeau d'invités "sur scène" en surimpression du live (PR H + PR I).
 *
 * PR H posait les avatars. PR I ajoute :
 *  - un indicateur "micro coupé" sur l'avatar de l'invité (détecté via
 *    la présence/absence du stream distant dans le mesh audio). Si le
 *    stream n'a pas encore été reçu (peer offline), on considère le
 *    micro comme coupé côté UX.
 *  - un toggle "me silencer ce peer" (mute local, côté écoute) au clic,
 *    visible uniquement pour les autres participants (pas pour soi-même).
 */
export function LiveGuestsStrip({ broadcasterId }: { broadcasterId: string }) {
  const { user } = useAuth();
  const { state } = useLiveInvites();
  const { remoteAudios, mutedPeers, togglePeerMute, meshActive } =
    useLiveMeshAudio();

  const guests = useMemo(
    () => acceptedGuestsFor(state, broadcasterId),
    [state, broadcasterId],
  );

  /** userIds dont on reçoit actuellement un flux audio vivant. */
  const activeAudioUserIds = useMemo(() => {
    return new Set(remoteAudios.map((r) => r.userId));
  }, [remoteAudios]);

  if (guests.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-400/40 bg-night-900/70 px-3 py-1.5 backdrop-blur">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
          <Mic className="h-3 w-3" /> Sur scène
        </span>
        <AnimatePresence initial={false}>
          {guests.map((g) => {
            const isSelf = g.userId === user?.id;
            const hasAudio = activeAudioUserIds.has(g.userId);
            const isMutedByMe = mutedPeers.has(g.userId);
            // On n'affiche la pastille "audio coupé" que quand le mesh
            // est actif — sinon on ne sait tout simplement pas s'il y a
            // du son côté distant (ex. mesh pas encore monté).
            const showSilentBadge = meshActive && !isSelf && !hasAudio;
            return (
              <motion.div
                key={g.userId}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5"
                title={
                  isSelf
                    ? `${g.username} (toi)`
                    : isMutedByMe
                      ? `${g.username} — muté pour toi`
                      : g.username
                }
              >
                <div className="relative">
                  <img
                    src={g.avatar}
                    alt={g.username}
                    className="h-7 w-7 rounded-full border border-emerald-300/60 object-cover"
                  />
                  {showSilentBadge && (
                    <span className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-300/70 bg-night-900 text-rose-200">
                      <MicOff className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <span className="hidden font-display text-xs text-emerald-50 sm:inline">
                  {g.username}
                </span>
                {!isSelf && hasAudio && (
                  <button
                    type="button"
                    onClick={() => togglePeerMute(g.userId)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-night-950/60 text-ivory/80 transition hover:border-white/40 hover:text-ivory"
                    aria-label={
                      isMutedByMe
                        ? `Réactiver l'écoute de ${g.username}`
                        : `Me silencer ${g.username}`
                    }
                    title={
                      isMutedByMe
                        ? `Tu as coupé le son de ${g.username} (pour toi uniquement)`
                        : `Couper le son de ${g.username} (pour toi uniquement)`
                    }
                  >
                    {isMutedByMe ? (
                      <VolumeX className="h-2.5 w-2.5" />
                    ) : (
                      <Volume2 className="h-2.5 w-2.5" />
                    )}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
