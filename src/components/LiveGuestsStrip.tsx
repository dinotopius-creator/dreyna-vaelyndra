import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import {
  acceptedGuestsFor,
  useLiveInvites,
} from "../contexts/LiveInvitesContext";

/**
 * Bandeau d'invités "sur scène" en surimpression du live (PR H).
 *
 * Positionné en haut du cadre vidéo (conformément à la spec user :
 * « Son avatar 2D apparaît en haut du live »). Pour PR H il s'agit
 * d'une simple rangée d'avatars + pseudos, sans audio. La PR I (mesh
 * WebRTC audio) viendra décorer chaque pastille d'un indicateur de
 * niveau sonore / coupure micro sans modifier la structure.
 */
export function LiveGuestsStrip({ broadcasterId }: { broadcasterId: string }) {
  const { state } = useLiveInvites();
  const guests = useMemo(
    () => acceptedGuestsFor(state, broadcasterId),
    [state, broadcasterId],
  );

  if (guests.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-400/40 bg-night-900/70 px-3 py-1.5 backdrop-blur">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
          <Mic className="h-3 w-3" /> Sur scène
        </span>
        <AnimatePresence initial={false}>
          {guests.map((g) => (
            <motion.div
              key={g.userId}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5"
              title={g.username}
            >
              <img
                src={g.avatar}
                alt={g.username}
                className="h-7 w-7 rounded-full border border-emerald-300/60 object-cover"
              />
              <span className="hidden font-display text-xs text-emerald-50 sm:inline">
                {g.username}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
