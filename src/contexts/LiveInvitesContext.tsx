import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiCancelJoin,
  apiDecideJoinRequest,
  apiListJoinRequests,
  apiMyJoinRequest,
  apiRequestJoin,
  type JoinRequestOut,
} from "../lib/liveApi";
import { useAuth } from "./AuthContext";
import { useLive } from "./LiveContext";
import { useToast } from "./ToastContext";

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
  /**
   * ID serveur de la demande. Rempli quand la ligne vient du backend
   * (PR #55 : polling /live/join-requests), sinon indéfini. Utilisé
   * pour les PATCH d'acceptation / de refus côté broadcaster.
   */
  serverId?: number;
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
  const { user } = useAuth();
  const { liveRegistry } = useLive();
  const { notify } = useToast();
  // Broadcaster actif = l'utilisateur courant a une entrée dans le registre
  // des lives en cours. Sans ça, chaque user connecté pollerait inutilement
  // /live/join-requests toutes les 5 s (charge serveur × N users × 12/min).
  const isActivelyBroadcasting = !!(user && liveRegistry[user.id]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // `knownPendingIdsRef` permet de détecter les NOUVELLES demandes lors
  // du polling broadcaster (pour ne toaster qu'une seule fois par
  // demande, même si le poll revient toutes les 5 s).
  const knownPendingIdsRef = useRef<Set<number>>(new Set());

  // Verrou optimiste pour les décisions broadcaster (accept/refuse/revoke).
  // Sans ça, quand on accepte un viewer, le PATCH part en fire-and-forget
  // et si le prochain poll (toutes les 5 s) arrive avant que le backend
  // ait committé, on récupère encore `status=pending` → on écraserait la
  // bascule optimiste `accepted` côté UI. À chaque décision locale, on
  // note dans ce map `{ serverId → { expectedStatus, ts } }`. Dans le
  // merge, on ignore les mises à jour serveur qui ne correspondent pas
  // encore à l'attente pendant `OPTIMISTIC_TTL_MS`.
  const optimisticPatchesRef = useRef<
    Map<number, { expected: "accepted" | "refused"; ts: number }>
  >(new Map());
  const OPTIMISTIC_TTL_MS = 15_000;
  const markOptimisticPatch = useCallback(
    (serverId: number, expected: "accepted" | "refused") => {
      optimisticPatchesRef.current.set(serverId, {
        expected,
        ts: Date.now(),
      });
    },
    [],
  );

  // Miroir **synchrone** de `state`. Indispensable pour que deux mutations
  // consécutives (ex. un `revokeInvite` suivi d'un `acceptInvite` dans le
  // même tick) voient chacune le résultat de la précédente. Tous les
  // mutators passent par `commit()` qui met à jour le ref **avant** de
  // notifier React — impossible alors qu'un `acceptInvite` lise un état
  // pré-revoke et écrase la révocation en committant l'ancien état.
  const stateRef = useRef<InvitesState>(state);

  /**
   * Applique une transformation pure au dernier état connu (ref), met à
   * jour le ref de façon synchrone puis pousse la valeur dans React.
   * Si l'updater renvoie la même référence, on court-circuite `setState`
   * pour éviter un render inutile.
   */
  const commit = useCallback(
    (updater: (prev: InvitesState) => InvitesState): InvitesState => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return prev;
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    // `state` peut diverger de `stateRef.current` uniquement dans le cas
    // marginal où un `setState` externe serait intercepté par React
    // (ex. StrictMode double-invoke du provider). On garde ce garde-fou.
    if (stateRef.current !== state) {
      stateRef.current = state;
    }
    writeState(state);
  }, [state]);

  // Synchronisation cross-tab : si l'onglet "viewer" lève la main et que
  // l'onglet "host" regarde la file, ce dernier doit voir la demande
  // apparaître immédiatement sans reload.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) {
        stateRef.current = {};
        setState({});
        return;
      }
      try {
        const next = JSON.parse(event.newValue) as InvitesState;
        if (next && typeof next === "object") {
          stateRef.current = next;
          setState(next);
        }
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
      let shouldNotifyBackend = false;
      commit((prev) => {
        const existing = prev[broadcasterId]?.[viewer.id];
        // Si on est déjà sur scène ou en attente, pas besoin de re-créer
        // une ligne (on veut que l'UI reste stable — et surtout ne PAS
        // re-pousser un POST /join qui, côté serveur, est un upsert qui
        // reset le status à "pending" → ça kickerait un invité déjà
        // accepté à chaque re-render qui déclenche cette fonction).
        if (
          existing &&
          (existing.status === "pending" || existing.status === "accepted")
        ) {
          return prev;
        }
        shouldNotifyBackend = true;
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
      // Side-effect : si c'est l'utilisateur connecté qui demande (cas
      // normal) ET qu'on vient EFFECTIVEMENT de créer une nouvelle
      // ligne locale, on informe le backend pour que le broadcaster
      // reçoive la notif temps réel cross-device. Échec silencieux.
      if (
        shouldNotifyBackend &&
        userRef.current &&
        userRef.current.id === viewer.id
      ) {
        apiRequestJoin(broadcasterId).catch(() => {
          /* ignore */
        });
      }
    },
    [commit],
  );

  const cancelInvite = useCallback<InvitesCtx["cancelInvite"]>(
    (broadcasterId, userId) => {
      let shouldNotifyBackend = false;
      commit((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        shouldNotifyBackend = true;
        const next = { ...reqs };
        delete next[userId];
        if (Object.keys(next).length === 0) {
          const copy = { ...prev };
          delete copy[broadcasterId];
          return copy;
        }
        return { ...prev, [broadcasterId]: next };
      });
      // Side-effect : si c'est l'utilisateur connecté qui annule SA
      // propre demande, on informe le backend pour purger la ligne
      // serveur (sinon elle resterait visible côté broadcaster).
      if (
        shouldNotifyBackend &&
        userRef.current &&
        userRef.current.id === userId
      ) {
        apiCancelJoin(broadcasterId).catch(() => {
          /* ignore */
        });
      }
    },
    [commit],
  );

  const acceptInvite = useCallback<InvitesCtx["acceptInvite"]>(
    (broadcasterId, userId) => {
      // Pré-check sur `stateRef.current` pour pouvoir retourner un verdict
      // synchrone au caller (annonce chat / toast). Le `commit()` réapplique
      // la même logique sur le ref à jour — en pratique les deux voient la
      // même valeur car `commit` est synchrone et tous les autres mutators
      // passent également par `commit`, qui met à jour le ref avant setState.
      const snapshot = stateRef.current;
      const reqsSnap = snapshot[broadcasterId];
      if (!reqsSnap || !reqsSnap[userId]) return false;
      if (reqsSnap[userId].status === "accepted") return true; // idempotent
      const onStageSnap = Object.values(reqsSnap).filter(
        (r) => r.status === "accepted",
      ).length;
      if (onStageSnap >= MAX_GUESTS) return false;

      let committed = false;
      let serverIdToPatch: number | undefined;
      commit((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        if (reqs[userId].status === "accepted") {
          committed = true;
          return prev;
        }
        const onStage = Object.values(reqs).filter(
          (r) => r.status === "accepted",
        ).length;
        if (onStage >= MAX_GUESTS) return prev;
        committed = true;
        serverIdToPatch = reqs[userId].serverId;
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
      // Side-effect : si la demande vient du registre serveur (elle a un
      // `serverId`) et que c'est bien le broadcaster qui décide, on
      // pousse la décision au backend pour que le viewer (peut-être
      // sur un autre device) voie son statut basculer à "accepted".
      if (
        committed &&
        serverIdToPatch &&
        userRef.current &&
        userRef.current.id === broadcasterId
      ) {
        markOptimisticPatch(serverIdToPatch, "accepted");
        apiDecideJoinRequest(serverIdToPatch, "accepted").catch(() => {
          /* ignore */
        });
      }
      return committed;
    },
    [commit, markOptimisticPatch],
  );

  const refuseInvite = useCallback<InvitesCtx["refuseInvite"]>(
    (broadcasterId, userId) => {
      let serverIdToPatch: number | undefined;
      commit((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        serverIdToPatch = reqs[userId].serverId;
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
      if (
        serverIdToPatch &&
        userRef.current &&
        userRef.current.id === broadcasterId
      ) {
        markOptimisticPatch(serverIdToPatch, "refused");
        apiDecideJoinRequest(serverIdToPatch, "refused").catch(() => {
          /* ignore */
        });
      }
    },
    [commit, markOptimisticPatch],
  );

  const revokeInvite = useCallback<InvitesCtx["revokeInvite"]>(
    (broadcasterId, userId) => {
      let serverIdToPatch: number | undefined;
      commit((prev) => {
        const reqs = prev[broadcasterId];
        if (!reqs || !reqs[userId]) return prev;
        serverIdToPatch = reqs[userId].serverId;
        const next = { ...reqs };
        delete next[userId];
        if (Object.keys(next).length === 0) {
          const copy = { ...prev };
          delete copy[broadcasterId];
          return copy;
        }
        return { ...prev, [broadcasterId]: next };
      });
      // Sans ce PATCH, la ligne serveur reste `accepted` et le prochain
      // poll broadcaster (toutes les 5 s) ré-injecte l'invité sur scène
      // — la révocation serait donc annulée côté UI au tick suivant.
      // On bascule la ligne serveur en `refused` pour purge naturelle
      // (même chemin que `refuseInvite`, avec la grace window 3 min).
      if (
        serverIdToPatch &&
        userRef.current &&
        userRef.current.id === broadcasterId
      ) {
        markOptimisticPatch(serverIdToPatch, "refused");
        apiDecideJoinRequest(serverIdToPatch, "refused").catch(() => {
          /* ignore */
        });
      }
    },
    [commit, markOptimisticPatch],
  );

  const resetBroadcast = useCallback<InvitesCtx["resetBroadcast"]>(
    (broadcasterId) => {
      commit((prev) => {
        if (!prev[broadcasterId]) return prev;
        const copy = { ...prev };
        delete copy[broadcasterId];
        return copy;
      });
    },
    [commit],
  );

  // -------------------------------------------------------------------------
  // Polling serveur (PR #55) — notifications temps réel cross-device.
  //
  // Broadcaster : toutes les 5 s, interroge `/live/join-requests` pour voir
  // les demandes en attente sur SON live. Les nouvelles déclenchent un toast.
  // Viewer : quand il a une demande en attente quelque part, il polle
  // `/live/{b}/join/me` pour voir si elle bascule à "accepted" / "refused".
  // -------------------------------------------------------------------------

  const mergeRemoteForBroadcaster = useCallback(
    (rows: JoinRequestOut[], broadcasterId: string) => {
      const prevSnap = stateRef.current[broadcasterId] || {};
      const newPending: JoinRequestOut[] = [];
      for (const r of rows) {
        if (r.status !== "pending") {
          // On purge l'ID dès qu'il quitte l'état pending : si le viewer
          // refusé re-demande dans la grace window, le backend réutilise
          // la même ligne (même `id`). Sans ce delete, le broadcaster
          // ne verrait plus jamais le toast pour les re-demandes.
          knownPendingIdsRef.current.delete(r.id);
          continue;
        }
        if (!knownPendingIdsRef.current.has(r.id)) {
          newPending.push(r);
          knownPendingIdsRef.current.add(r.id);
        }
      }
      // Toast sur la première détection d'une nouvelle demande.
      for (const r of newPending) {
        notify(`✋ ${r.username} demande à monter sur scène`, "info");
      }
      // On purge au passage les verrous optimistes expirés (> TTL) pour
      // éviter de faire grossir la Map indéfiniment.
      const nowTs = Date.now();
      for (const [id, entry] of optimisticPatchesRef.current) {
        if (nowTs - entry.ts > OPTIMISTIC_TTL_MS) {
          optimisticPatchesRef.current.delete(id);
        }
      }
      commit((prev) => {
        const currentBroadcaster = prev[broadcasterId] || {};
        const next: Record<string, InviteRequest> = {};
        // 1. On ré-importe TOUTES les lignes serveur (source de vérité pour
        //    les demandes cross-device).
        for (const r of rows) {
          const existing = currentBroadcaster[r.user_id];
          // Verrou optimiste : si on a décidé localement (accept/refuse)
          // juste avant ce poll mais que le backend n'a pas encore committé
          // le PATCH, on garde la valeur locale plutôt que d'écraser avec
          // l'ancien statut serveur. Sans ça, on pourrait :
          //  - voir l'invité accepté revenir en "pending" quelques secondes
          //  - dépasser MAX_GUESTS en cas de race (accept viewer1 → flicker
          //    pending → re-accept viewer2 → PATCH1 arrive → 5 accepted)
          const pending = optimisticPatchesRef.current.get(r.id);
          if (
            pending &&
            r.status !== pending.expected &&
            nowTs - pending.ts <= OPTIMISTIC_TTL_MS &&
            existing
          ) {
            // On garde l'entrée locale (décision optimiste) telle quelle.
            next[r.user_id] = existing;
            continue;
          }
          // Le serveur a rattrapé (ou TTL expiré) : on peut clear le verrou.
          if (pending && r.status === pending.expected) {
            optimisticPatchesRef.current.delete(r.id);
          }
          next[r.user_id] = {
            userId: r.user_id,
            username: r.username,
            avatar: r.avatar,
            creatureId: r.creature_id || null,
            requestedAt: r.requested_at,
            acceptedAt:
              r.status === "accepted"
                ? r.decided_at ?? existing?.acceptedAt
                : undefined,
            refusedAt:
              r.status === "refused"
                ? r.decided_at ?? existing?.refusedAt
                : undefined,
            status: r.status,
            serverId: r.id,
          };
        }
        // 2. Les demandes purement locales (non synchro serveur, ex. depuis
        //    un autre tab de broadcast) — on les préserve telles quelles.
        for (const [uId, req] of Object.entries(currentBroadcaster)) {
          if (!next[uId] && !req.serverId) {
            next[uId] = req;
          }
        }
        const sameCount =
          Object.keys(next).length === Object.keys(prevSnap).length;
        if (
          sameCount &&
          Object.keys(next).every((k) => {
            const a = next[k];
            const b = prevSnap[k];
            return (
              b &&
              a.status === b.status &&
              a.serverId === b.serverId &&
              a.acceptedAt === b.acceptedAt &&
              a.refusedAt === b.refusedAt
            );
          })
        ) {
          return prev;
        }
        return { ...prev, [broadcasterId]: next };
      });
    },
    [commit, notify],
  );

  // Polling broadcaster : uniquement quand l'utilisateur est EFFECTIVEMENT
  // en train de streamer (entrée dans le liveRegistry). Sinon on économise
  // ~12 requêtes / minute / user connecté (la plupart ne streament pas).
  useEffect(() => {
    if (!user || !isActivelyBroadcasting) return;
    let cancelled = false;
    const broadcasterId = user.id;
    const poll = async () => {
      try {
        const rows = await apiListJoinRequests();
        if (cancelled) return;
        mergeRemoteForBroadcaster(rows, broadcasterId);
      } catch {
        // Backend indispo : on garde l'état local.
      }
    };
    // Kick-off : premier poll immédiat pour que la file soit à jour au
    // premier affichage du panneau.
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, isActivelyBroadcasting, mergeRemoteForBroadcaster]);

  // Polling viewer : pour chaque broadcaster auprès duquel CE user a
  // actuellement une demande en attente (ou acceptée récemment), on
  // vérifie le statut serveur toutes les 5 s afin d'informer le viewer
  // s'il a été accepté / refusé depuis un autre device du broadcaster.
  useEffect(() => {
    if (!user) return;
    const myId = user.id;
    let cancelled = false;
    const poll = async () => {
      const snap = stateRef.current;
      const targets: string[] = [];
      for (const [bId, reqs] of Object.entries(snap)) {
        if (bId === myId) continue;
        const mine = reqs[myId];
        if (!mine) continue;
        if (mine.status === "pending" || mine.status === "accepted") {
          targets.push(bId);
        }
      }
      for (const bId of targets) {
        try {
          const row = await apiMyJoinRequest(bId);
          if (cancelled) return;
          commit((prev) => {
            const reqs = prev[bId];
            if (!reqs || !reqs[myId]) return prev;
            if (row === null) {
              // Le broadcaster a supprimé (ex. live terminé) — on purge.
              const copy = { ...reqs };
              delete copy[myId];
              if (Object.keys(copy).length === 0) {
                const next = { ...prev };
                delete next[bId];
                return next;
              }
              return { ...prev, [bId]: copy };
            }
            const current = reqs[myId];
            if (
              current.status === row.status &&
              current.serverId === row.id
            ) {
              return prev;
            }
            return {
              ...prev,
              [bId]: {
                ...reqs,
                [myId]: {
                  ...current,
                  status: row.status,
                  serverId: row.id,
                  acceptedAt:
                    row.status === "accepted"
                      ? row.decided_at ?? current.acceptedAt
                      : undefined,
                  refusedAt:
                    row.status === "refused"
                      ? row.decided_at ?? current.refusedAt
                      : undefined,
                },
              },
            };
          });
        } catch {
          // ignore
        }
      }
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, commit]);

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
