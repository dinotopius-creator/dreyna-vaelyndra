import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Contexte dédié aux **demandes d'invitation à monter sur scène** (PR H).
 *
 * Pattern volontairement isolé de `LiveContext` pour deux raisons :
 * 1. Il ne dépend pas de PeerJS — c'est purement de la gestion d'état
 *    partagée cross-tab via `localStorage` + `StorageEvent`. L'audio
 *    WebRTC mesh arrivera en PR I et viendra *s'accrocher* à ce contexte
 *    sans le réécrire.
 * 2. Il peut être chargé indépendamment par les surfaces "viewer"
 *    (profil, fil communautaire) sans tirer toute la machinerie peerjs.
 *
 * Modèle :
 *  - Chaque live (identifié par son broadcaster) possède une liste de
 *    demandes. Chaque demande a un statut `pending` (en attente),
 *    `accepted` (le viewer est sur scène) ou `refused` (refusé récemment,
 *    marqué comme tel pour que l'UI viewer sache pourquoi rien ne bouge).
 *  - Le broadcaster accepte / refuse / retire à tout moment. Les "accepted"
 *    constituent la liste des invités sur scène (bornée à `MAX_GUESTS`).
 *  - Les viewers lèvent la main / annulent eux-mêmes leur demande.
 *
 * Persistance : `localStorage` sous `vaelyndra_live_invites_v1`, propagé
 * cross-tab par `StorageEvent`. Lorsqu'un live s'arrête (détecté dans
 * `LiveContext` via le retrait du registre), la page `/live/:id` invoque
 * `resetBroadcast` pour purger ses demandes.
 */

const STORAGE_KEY = "vaelyndra_live_invites_v1";

/** Limite dure : mesh P2P (cf. décision user pour PR I). */
export const MAX_GUESTS = 4;

/**
 * Fenêtre pendant laquelle un refus reste visible côté viewer avant
 * d'être purgé. Passé ce délai, le viewer peut relever la main sans
 * friction (utile si le broadcaster change d'avis).
 */
const REFUSAL_GRACE_MS = 1000 * 60 * 3; // 3 minutes

export type InviteStatus = "pending" | "accepted" | "refused";

export interface InviteRequest {
  userId: string;
  username: string;
  avatar: string;
  /** Créature éventuelle (pour l'UI — badge dans la file d'attente). */
  creatureId?: string | null;
  requestedAt: string;
  /** ISO du passage à "accepted" — ordonne les invités sur scène. */
  acceptedAt?: string;
  /** ISO du passage à "refused" — pilote la purge automatique. */
  refusedAt?: string;
  status: InviteStatus;
}

/** État sérialisable : `{ broadcasterId -> { userId -> InviteRequest } }`. */
type InvitesState = Record<string, Record<string, InviteRequest>>;

function readState(): InvitesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InvitesState;
    if (!parsed || typeof parsed !== "object") return {};
    // Purge les refusés trop vieux à la lecture pour que l'utilisateur
    // ne soit pas bloqué par un résidu de session précédente.
    const now = Date.now();
    const cleaned: InvitesState = {};
    for (const [bId, reqs] of Object.entries(parsed)) {
      if (!reqs || typeof reqs !== "object") continue;
      const kept: Record<string, InviteRequest> = {};
      for (const [uId, r] of Object.entries(reqs)) {
        if (!r || typeof r !== "object") continue;
        if (r.status === "refused" && r.refusedAt) {
          const t = new Date(r.refusedAt).getTime();
          if (Number.isFinite(t) && now - t > REFUSAL_GRACE_MS) continue;
        }
        kept[uId] = r;
      }
      if (Object.keys(kept).length > 0) cleaned[bId] = kept;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeState(state: InvitesState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded → on ignore : l'UI redeviendra cohérente au prochain
    // écriture réussie. Pas de crash.
  }
}

interface InvitesCtx {
  /** Toutes les demandes par broadcaster (lecture). */
  state: InvitesState;
  /**
   * Côté viewer : demande à monter sur scène d'un broadcaster donné.
   * Idempotent — si déjà pending/accepted, ne casse rien.
   */
  requestInvite: (
    broadcasterId: string,
    viewer: {
      id: string;
      username: string;
      avatar: string;
      creatureId?: string | null;
    },
  ) => void;
  /**
   * Côté viewer : annule sa propre demande (pending) ou quitte la scène
   * (accepted). Les "refused" sont purgés automatiquement.
   */
  cancelInvite: (broadcasterId: string, userId: string) => void;
  /**
   * Côté broadcaster : accepte la demande d'un viewer. Respecte la limite
   * `MAX_GUESTS` — si pleine, retourne `false` pour laisser le caller
   * notifier l'utilisateur.
   */
  acceptInvite: (broadcasterId: string, userId: string) => boolean;
  /** Côté broadcaster : refuse la demande. */
  refuseInvite: (broadcasterId: string, userId: string) => void;
  /** Côté broadcaster : retire un invité déjà sur scène. */
  revokeInvite: (broadcasterId: string, userId: string) => void;
  /**
   * Purge toutes les demandes d'un broadcaster donné (appelé quand le
   * live s'arrête pour éviter des résidus cross-session).
   */
  resetBroadcast: (broadcasterId: string) => void;
}

const Ctx = createContext<InvitesCtx | null>(null);

export function LiveInvitesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InvitesState>(() => readState());

  useEffect(() => {
    writeState(state);
  }, [state]);

  // Synchronisation cross-tab : si l'onglet "viewer" lève la main et que
  // l'onglet "host" regarde la file, ce dernier doit voir la demande
  // apparaître immédiatement sans reload.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) {
        setState({});
        return;
      }
      try {
        const next = JSON.parse(event.newValue) as InvitesState;
        if (next && typeof next === "object") setState(next);
      } catch {
        // payload corrompu — on ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const requestInvite = useCallback<InvitesCtx["requestInvite"]>(
    (broadcasterId, viewer) => {
      if (!broadcasterId || !viewer.id) return;
      if (broadcasterId === viewer.id) return; // on ne s'invite pas soi-même
      setState((prev) => {
        const existing = prev[broadcasterId]?.[viewer.id];
        // Si on est déjà sur scène ou en attente, pas besoin de re-créer
        // une ligne (on veut que l'UI reste stable).
        if (
          existing &&
          (existing.status === "pending" || existing.status === "accepted")
        ) {
          return prev;
        }
        const request: InviteRequest = {
          userId: viewer.id,
          username: viewer.username,
          avatar: viewer.avatar,
          creatureId: viewer.creatureId ?? null,
          requestedAt: new Date().toISOString(),
          status: "pending",
        };
        return {
          ...prev,
          [broadcasterId]: {
            ...(prev[broadcasterId] ?? {}),
            [viewer.id]: request,
          },
        };
      });
    },
    [],
  );

  const cancelInvite = useCallback<InvitesCtx["cancelInvite"]>(
    (broadcasterId, userId) => {
      setState((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        const next = { ...reqs };
        delete next[userId];
        if (Object.keys(next).length === 0) {
          const copy = { ...prev };
          delete copy[broadcasterId];
          return copy;
        }
        return { ...prev, [broadcasterId]: next };
      });
    },
    [],
  );

  const acceptInvite = useCallback<InvitesCtx["acceptInvite"]>(
    (broadcasterId, userId) => {
      let accepted = false;
      setState((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        const onStage = Object.values(reqs).filter(
          (r) => r.status === "accepted",
        ).length;
        if (onStage >= MAX_GUESTS) return prev;
        accepted = true;
        return {
          ...prev,
          [broadcasterId]: {
            ...reqs,
            [userId]: {
              ...reqs[userId],
              status: "accepted",
              acceptedAt: new Date().toISOString(),
              refusedAt: undefined,
            },
          },
        };
      });
      return accepted;
    },
    [],
  );

  const refuseInvite = useCallback<InvitesCtx["refuseInvite"]>(
    (broadcasterId, userId) => {
      setState((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        return {
          ...prev,
          [broadcasterId]: {
            ...reqs,
            [userId]: {
              ...reqs[userId],
              status: "refused",
              refusedAt: new Date().toISOString(),
              acceptedAt: undefined,
            },
          },
        };
      });
    },
    [],
  );

  const revokeInvite = useCallback<InvitesCtx["revokeInvite"]>(
    (broadcasterId, userId) => {
      setState((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        const next = { ...reqs };
        delete next[userId];
        if (Object.keys(next).length === 0) {
          const copy = { ...prev };
          delete copy[broadcasterId];
          return copy;
        }
        return { ...prev, [broadcasterId]: next };
      });
    },
    [],
  );

  const resetBroadcast = useCallback<InvitesCtx["resetBroadcast"]>(
    (broadcasterId) => {
      setState((prev) => {
        if (!prev[broadcasterId]) return prev;
        const copy = { ...prev };
        delete copy[broadcasterId];
        return copy;
      });
    },
    [],
  );

  const value = useMemo<InvitesCtx>(
    () => ({
      state,
      requestInvite,
      cancelInvite,
      acceptInvite,
      refuseInvite,
      revokeInvite,
      resetBroadcast,
    }),
    [
      state,
      requestInvite,
      cancelInvite,
      acceptInvite,
      refuseInvite,
      revokeInvite,
      resetBroadcast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveInvites(): InvitesCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useLiveInvites doit être utilisé dans un LiveInvitesProvider",
    );
  }
  return ctx;
}

/**
 * Sélecteur pratique : retourne la liste ordonnée des demandes en attente
 * pour un broadcaster, plus anciennes en premier (FIFO — équitable).
 */
export function pendingRequestsFor(
  state: InvitesState,
  broadcasterId: string,
): InviteRequest[] {
  const reqs = state[broadcasterId];
  if (!reqs) return [];
  return Object.values(reqs)
    .filter((r) => r.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
    );
}

/**
 * Sélecteur pratique : liste des invités acceptés, dans leur ordre
 * d'acceptation (plus anciens = plus haut dans la bannière "invités").
 */
export function acceptedGuestsFor(
  state: InvitesState,
  broadcasterId: string,
): InviteRequest[] {
  const reqs = state[broadcasterId];
  if (!reqs) return [];
  return Object.values(reqs)
    .filter((r) => r.status === "accepted")
    .sort((a, b) => {
      const ta = new Date(a.acceptedAt ?? a.requestedAt).getTime();
      const tb = new Date(b.acceptedAt ?? b.requestedAt).getTime();
      return ta - tb;
    });
}

/** Retourne l'état courant d'un viewer pour un broadcaster donné. */
export function inviteStateOf(
  state: InvitesState,
  broadcasterId: string,
  userId: string,
): InviteRequest | null {
  return state[broadcasterId]?.[userId] ?? null;
}
