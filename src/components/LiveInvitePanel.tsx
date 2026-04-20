import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, Check, X, Mic, MicOff, UserMinus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  MAX_GUESTS,
  acceptedGuestsFor,
  inviteStateOf,
  pendingRequestsFor,
  useLiveInvites,
} from "../contexts/LiveInvitesContext";
import { getCreature } from "../data/creatures";

/**
 * Panneau "Demandes d'invitation" (PR H).
 *
 * Deux vues dans un seul composant :
 *  - **Viewer** : bouton "Demander à monter" / "Demande envoyée" / "Sur scène"
 *  - **Broadcaster** : liste des demandes en attente (accepter / refuser) et
 *    des invités sur scène (retirer).
 *
 * En PR H, cliquer "Accepter" ajoute simplement le viewer à la bannière
 * "Sur scène" — il n'y a **pas encore** d'audio WebRTC. L'audio arrivera
 * en PR I et viendra s'accrocher à l'état exposé par `LiveInvitesContext`
 * sans modifier le cycle d'acceptation.
 */

interface Props {
  broadcasterId: string;
  broadcasterName: string;
  /** true si l'utilisateur courant est le broadcaster de ce live. */
  isBroadcaster: boolean;
  /**
   * Appelé à chaque transition d'invitation pour que la page live
   * pousse une annonce dans le chat flottant. Facultatif pour permettre
   * au panneau d'être rendu en dehors de la page `/live/:id`.
   */
  onAnnounce?: (content: string) => void;
  /** true seulement quand un live est effectivement en cours. */
  isActiveLive: boolean;
}

export function LiveInvitePanel({
  broadcasterId,
  broadcasterName,
  isBroadcaster,
  onAnnounce,
  isActiveLive,
}: Props) {
  const { user } = useAuth();
  const { notify } = useToast();
  const {
    state,
    requestInvite,
    cancelInvite,
    acceptInvite,
    refuseInvite,
    revokeInvite,
  } = useLiveInvites();

  const pending = useMemo(
    () => pendingRequestsFor(state, broadcasterId),
    [state, broadcasterId],
  );
  const accepted = useMemo(
    () => acceptedGuestsFor(state, broadcasterId),
    [state, broadcasterId],
  );
  const myInvite = useMemo(
    () => (user ? inviteStateOf(state, broadcasterId, user.id) : null),
    [state, broadcasterId, user],
  );

  const onStage = accepted.length;
  const stageFull = onStage >= MAX_GUESTS;

  function handleRaiseHand() {
    if (!user) {
      notify("Connectez-vous pour demander à monter sur scène.", "info");
      return;
    }
    if (!isActiveLive) {
      notify("Le live n'est pas en cours.", "info");
      return;
    }
    requestInvite(broadcasterId, {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      creatureId: user.creatureId ?? null,
    });
    onAnnounce?.(`🖐️ ${user.username} demande à monter sur la scène`);
    notify("Main levée ✋ — votre demande a été envoyée.");
  }

  function handleCancelMine() {
    if (!user) return;
    cancelInvite(broadcasterId, user.id);
    if (myInvite?.status === "accepted") {
      onAnnounce?.(`👋 ${user.username} quitte la scène`);
    }
  }

  function handleAccept(userId: string, username: string) {
    const ok = acceptInvite(broadcasterId, userId);
    if (!ok) {
      notify(
        `La scène est pleine (${MAX_GUESTS} invités maximum). Retire quelqu'un avant d'en accepter un autre.`,
        "error",
      );
      return;
    }
    onAnnounce?.(`🎤 ${username} rejoint la scène de ${broadcasterName}`);
    notify(`${username} est sur scène.`);
  }

  function handleRefuse(userId: string, username: string) {
    refuseInvite(broadcasterId, userId);
    onAnnounce?.(`⛔ ${broadcasterName} a refusé ${username}`);
  }

  function handleRevoke(userId: string, username: string) {
    revokeInvite(broadcasterId, userId);
    onAnnounce?.(`👋 ${username} quitte la scène`);
  }

  // --- VUE VIEWER --------------------------------------------------------
  if (!isBroadcaster) {
    // Avant même de se connecter, on montre le bouton pour donner envie
    // de se connecter. `handleRaiseHand` gère le "pas connecté" avec un
    // toast explicite plutôt qu'un état désactivé silencieux.
    const status = myInvite?.status ?? null;
    const isPending = status === "pending";
    const isOnStage = status === "accepted";
    const wasRefused = status === "refused";

    if (!isActiveLive) return null;

    return (
      <div className="card-royal mt-4 flex flex-wrap items-center gap-3 p-4">
        {!isPending && !isOnStage && !wasRefused && (
          <button
            type="button"
            onClick={handleRaiseHand}
            className="btn-royal"
          >
            <Hand className="h-4 w-4" /> Demander à monter
          </button>
        )}
        {isPending && (
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1.5 text-xs text-gold-200">
              <Hand className="h-3.5 w-3.5 animate-pulse" />
              Demande envoyée — en attente du streamer
            </span>
            <button
              type="button"
              onClick={handleCancelMine}
              className="btn-ghost"
            >
              <X className="h-3.5 w-3.5" /> Annuler
            </button>
          </>
        )}
        {isOnStage && (
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">
              <Mic className="h-3.5 w-3.5" />
              Tu es sur scène
            </span>
            <button
              type="button"
              onClick={handleCancelMine}
              className="btn-ghost"
            >
              <UserMinus className="h-3.5 w-3.5" /> Quitter la scène
            </button>
          </>
        )}
        {wasRefused && (
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
              <MicOff className="h-3.5 w-3.5" />
              Demande refusée par {broadcasterName}
            </span>
            <button
              type="button"
              onClick={handleRaiseHand}
              className="btn-ghost"
            >
              <Hand className="h-3.5 w-3.5" /> Redemander
            </button>
          </>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-ivory/50">
          {onStage}/{MAX_GUESTS} invités sur scène
        </span>
      </div>
    );
  }

  // --- VUE BROADCASTER ---------------------------------------------------
  if (!isActiveLive) {
    // Pas de file d'attente utile tant que le live n'est pas lancé.
    return null;
  }

  return (
    <section className="card-royal mt-4 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <p className="font-regal text-[11px] uppercase tracking-[0.22em] text-gold-300">
          Demandes à monter
        </p>
        <span className="text-[10px] uppercase tracking-[0.2em] text-ivory/55">
          {pending.length} en attente · {onStage}/{MAX_GUESTS} sur scène
        </span>
        {stageFull && (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-rose-200">
            Scène pleine
          </span>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-ivory/55">
            File d'attente
          </p>
          {pending.length === 0 ? (
            <p className="text-xs italic text-ivory/50">
              Aucune demande pour le moment. Les viewers peuvent lever la
              main via le bouton « Demander à monter ».
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {pending.map((req) => {
                  const creature = getCreature(req.creatureId ?? null);
                  return (
                    <motion.li
                      key={req.userId}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="flex items-center gap-3 rounded-xl border border-royal-500/20 bg-night-900/40 p-2.5"
                    >
                      <img
                        src={req.avatar}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm text-gold-100">
                          {req.username}
                        </p>
                        {creature && (
                          <p className="truncate text-[10px] text-ivory/60">
                            <span aria-hidden>{creature.icon}</span>{" "}
                            {creature.name}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAccept(req.userId, req.username)}
                        disabled={stageFull}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 px-2.5 py-1 text-[11px] font-semibold text-night-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          stageFull
                            ? `Scène pleine (${MAX_GUESTS} max)`
                            : "Accepter"
                        }
                      >
                        <Check className="h-3 w-3" /> Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefuse(req.userId, req.username)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 px-2.5 py-1 text-[11px] text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10"
                      >
                        <X className="h-3 w-3" /> Refuser
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-ivory/55">
            Sur scène
          </p>
          {accepted.length === 0 ? (
            <p className="text-xs italic text-ivory/50">
              Aucun invité sur scène. Accepte une demande pour démarrer
              l'interaction.
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {accepted.map((req) => (
                  <motion.li
                    key={req.userId}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-2.5"
                  >
                    <img
                      src={req.avatar}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm text-emerald-100">
                        {req.username}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">
                        Sur scène
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(req.userId, req.username)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 px-2.5 py-1 text-[11px] text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10"
                    >
                      <UserMinus className="h-3 w-3" /> Retirer
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
