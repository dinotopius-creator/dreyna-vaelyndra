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
import type Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { useAuth } from "./AuthContext";
import { useLive } from "./LiveContext";
import { getPeerOptions } from "../lib/peerConfig";
import {
  acceptedGuestsFor,
  inviteStateOf,
  useLiveInvites,
} from "./LiveInvitesContext";

/**
 * Contexte dédié au **mesh audio P2P des invités** (PR I).
 *
 * Stratégie :
 *  - Dès que l'utilisateur courant fait partie d'une scène (broadcaster
 *    d'un live actif *avec au moins un invité accepté*, OU viewer accepté
 *    comme invité par un broadcaster), on allume son micro et on démarre
 *    un peer WebRTC dédié à l'audio (peer-ID `vaelyndra-live-audio-v1-…`).
 *  - Pour chaque autre participant de la scène, on ouvre **exactement une**
 *    MediaConnection par paire, grâce à un tie-breaker lexicographique :
 *    le peer dont le userId est le plus petit est celui qui lance l'appel,
 *    l'autre répond. Les deux côtés maintiennent la connexion ouverte tant
 *    que la scène est active.
 *  - Quand la scène se vide (0 autre participant), on éteint le micro et
 *    on ferme le peer pour libérer les ressources + l'indicateur micro du
 *    navigateur (important pour l'UX : pas de micro allumé "pour rien").
 *
 * Volontairement séparé de `LiveContext` :
 *  - `LiveContext` gère la vidéo 1→N (broadcaster pousse, viewers reçoivent).
 *  - Ce contexte-ci gère l'audio N↔N uniquement entre participants acceptés.
 *  - Les deux peuvent coexister (un broadcaster streame son écran *et* parle
 *    à ses invités) car ils utilisent deux `Peer` distincts sur le même
 *    broker PeerJS.
 *
 * Pas de serveur, pas de SFU — mesh complet. Le dimensionnement (`MAX_GUESTS
 * = 4` dans `LiveInvitesContext`) assure que chaque participant ouvre au
 * plus 4 connexions simultanées : fibre → ~200 kbit/s upload, tenable sur
 * un réseau grand public.
 */

/** Peer-ID déterministe pour le mesh audio d'un user donné. */
export function getMeshAudioPeerId(userId: string): string {
  return `vaelyndra-live-audio-v1-${userId}`;
}

interface RemoteAudio {
  /** userId distant. */
  userId: string;
  /** Flux MediaStream reçu (au moins 1 piste audio). */
  stream: MediaStream;
}

interface MeshCtx {
  /** true quand le mesh est effectivement actif (micro demandé + peer ouvert). */
  meshActive: boolean;
  /** true si l'utilisateur a autorisé l'accès au micro. */
  hasMic: boolean;
  /** Etat d'activation (muet / actif) du micro local. */
  micEnabled: boolean;
  /** Activer / désactiver le micro local. */
  toggleMic: () => void;
  /** Erreur à afficher (permission refusée, peer ko, …). */
  error: string | null;
  /** Liste des flux audio distants, un par participant de la scène. */
  remoteAudios: RemoteAudio[];
  /** userIds que l'utilisateur courant a muetés localement (côté écoute). */
  mutedPeers: Set<string>;
  /** Mute / unmute local d'un peer spécifique (n'affecte que notre oreille). */
  togglePeerMute: (userId: string) => void;
}

const Ctx = createContext<MeshCtx | null>(null);

export function LiveMeshAudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { liveRegistry } = useLive();
  const { state: invitesState } = useLiveInvites();

  // --- Identifie la "scène" à laquelle l'utilisateur participe ----------
  // On la déduit entièrement de l'état invite + registre public des lives.
  // Si l'utilisateur n'est ni broadcaster actif avec invités, ni invité
  // accepté, `meshBroadcasterId` est null et on reste éteint.
  const scene = useMemo<{
    broadcasterId: string;
    participants: string[]; // userIds de TOUS les membres de la scène (sauf moi)
  } | null>(() => {
    if (!user) return null;

    // Cas 1 — je suis broadcaster : ma scène = mes invités acceptés.
    const imBroadcasting =
      !!liveRegistry[user.id] && !!invitesState[user.id];
    if (imBroadcasting) {
      const guests = acceptedGuestsFor(invitesState, user.id).map(
        (g) => g.userId,
      );
      if (guests.length === 0) return null; // pas de mesh seul
      return { broadcasterId: user.id, participants: guests };
    }

    // Cas 2 — je suis invité accepté par un broadcaster actif.
    for (const bId of Object.keys(liveRegistry)) {
      const myStatus = inviteStateOf(invitesState, bId, user.id);
      if (myStatus?.status === "accepted") {
        const others = acceptedGuestsFor(invitesState, bId)
          .map((g) => g.userId)
          .filter((uid) => uid !== user.id);
        // La scène inclut aussi le broadcaster.
        return { broadcasterId: bId, participants: [bId, ...others] };
      }
    }
    return null;
  }, [user, liveRegistry, invitesState]);

  // --- State UI ----------------------------------------------------------
  const [meshActive, setMeshActive] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteAudios, setRemoteAudios] = useState<RemoteAudio[]>([]);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());

  // --- Refs pour les objets WebRTC (non sérialisables) ------------------
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  // Map userId -> MediaConnection, pour dédup + cleanup.
  const connsRef = useRef<Map<string, MediaConnection>>(new Map());
  // Queue des appels à tenter (retry si peer pas encore en ligne).
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  // Garde-fou anti race : incrémenté à chaque (re)démarrage du mesh,
  // pour ignorer les callbacks asynchrones d'une génération précédente.
  const generationRef = useRef(0);

  // Refs miroirs de `scene` et de la logique "dois-je appeler ?" pour que
  // les callbacks asynchrones (on "close" d'une conn, retry sur timeout)
  // ne capturent pas de valeurs stales au moment de leur définition.
  // Déclarés tôt pour que les helpers `registerConnection` / `scheduleRetry`
  // puissent y accéder sans no-use-before-define.
  const sceneRef = useRef<typeof scene>(null);
  sceneRef.current = scene;
  const shouldInitiateCallRef = useRef<(remoteUserId: string) => boolean>(
    () => false,
  );
  shouldInitiateCallRef.current = (remoteUserId: string) =>
    user ? shouldInitiateCall(user.id, remoteUserId) : false;

  // --- Mute / unmute local ----------------------------------------------
  const togglePeerMute = useCallback((userId: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      // Le micro n'est pas encore initialisé — on reflète juste l'intention.
      setMicEnabled((v) => !v);
      return;
    }
    setMicEnabled((v) => {
      const nextEnabled = !v;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = nextEnabled;
      });
      return nextEnabled;
    });
  }, []);

  // --- Boot / shutdown ---------------------------------------------------
  //
  // ⚠️ Dépendances : uniquement `scene?.broadcasterId` (stable tant qu'on
  // reste dans la même scène) et `user?.id`. L'objet `scene` lui-même est
  // recalculé à chaque changement d'`invitesState` (ex. un viewer lève la
  // main → scene.participants change de référence même si le broadcaster
  // est le même). Si on dépendait de `scene`, l'effet re-fire, le cleanup
  // ne libère pas le mesh existant, et on se retrouve avec un second
  // `getUserMedia` (leak mic) + collision `unavailable-id` sur le peer.
  // Les changements de participants sont gérés par l'effet suivant.
  useEffect(() => {
    const bId = scene?.broadcasterId;
    if (!bId || !user) {
      // Scène terminée → on coupe tout proprement.
      shutdownMesh();
      setMeshActive(false);
      setHasMic(false);
      setError(null);
      setRemoteAudios([]);
      return;
    }

    let cancelled = false;
    const gen = ++generationRef.current;
    setError(null);

    (async () => {
      try {
        // 1) Demande de micro
        if (typeof navigator === "undefined" || !navigator.mediaDevices) {
          setError("Audio non supporté par ce navigateur.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (cancelled || gen !== generationRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        // Applique l'état "micEnabled" initial (respect un mute pré-existant).
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micEnabled;
        });
        setHasMic(true);

        // 2) Peer audio dédié
        const { default: PeerCtor } = await import("peerjs");
        if (cancelled || gen !== generationRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          return;
        }
        const peer = new PeerCtor(getMeshAudioPeerId(user.id), getPeerOptions());
        peerRef.current = peer;

        peer.on("open", () => {
          if (cancelled || gen !== generationRef.current) return;
          setMeshActive(true);
        });

        peer.on("error", (err: Error & { type?: string }) => {
          if (cancelled || gen !== generationRef.current) return;
          // `peer-unavailable` est normal (le peer distant n'est pas
          // encore en ligne) — on laisse le retry s'en occuper.
          if (err.type === "peer-unavailable") return;
          if (err.type === "unavailable-id") {
            setError(
              "Un mesh audio existe déjà à ton nom ailleurs. Ferme l'autre onglet.",
            );
            return;
          }
          console.warn("mesh audio peer error", err);
        });

        // 3) Répondeur : quand un autre participant nous appelle, on répond
        //    avec notre flux audio local.
        peer.on("call", (incoming) => {
          if (cancelled || gen !== generationRef.current) {
            try {
              incoming.close();
            } catch {
              // ignore
            }
            return;
          }
          const remoteUserId = resolveUserIdFromPeerId(incoming.peer);
          if (!remoteUserId) return;
          registerConnection(remoteUserId, incoming, stream, gen);
          // Le `config.iceServers` est propagé depuis le Peer parent,
          // donc pas besoin de le redupliquer sur chaque answer().
          incoming.answer(stream);
        });
      } catch (err) {
        if (cancelled || gen !== generationRef.current) return;
        if (err instanceof Error && err.name === "NotAllowedError") {
          setError(
            "Accès au micro refusé — impossible de rejoindre la scène en audio.",
          );
        } else {
          setError(
            `Impossible d'initialiser l'audio : ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      // Libère mic + peer + conns AVANT que le prochain run (cas de
      // changement de broadcaster ou de user) ne tente un nouveau
      // `getUserMedia` / `new Peer(sameId)`. `shutdownMesh` est
      // idempotent donc cohabiter avec la branche `!scene` ci-dessus
      // ne pose pas de problème.
      shutdownMesh();
    };
    // On volontairement ignore `micEnabled` et `scene.participants` dans
    // les deps : modifier le mute ne doit PAS reboot le mesh, et les
    // changements de liste de participants sont gérés par l'effet
    // suivant (diff des connexions, sans démonter le peer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.broadcasterId, user?.id]);

  // --- Quand la liste des participants change, on ouvre les nouvelles
  //     connexions et on ferme celles qui ne sont plus pertinentes.
  useEffect(() => {
    if (!scene || !user || !meshActive) return;
    const gen = generationRef.current;
    const stream = localStreamRef.current;
    if (!stream) return;

    const wanted = new Set(scene.participants);

    // Fermer les connexions vers des peers qui ne sont plus dans la scène.
    for (const [uid, conn] of connsRef.current.entries()) {
      if (!wanted.has(uid)) {
        try {
          conn.close();
        } catch {
          // ignore
        }
        connsRef.current.delete(uid);
      }
    }
    // Clean remote streams orphelins.
    setRemoteAudios((prev) => prev.filter((r) => wanted.has(r.userId)));

    // Pour chaque peer manquant, on tente un appel *si* on est le "caller"
    // selon le tie-breaker (userId lexicographiquement inférieur appelle).
    for (const peerUserId of scene.participants) {
      if (connsRef.current.has(peerUserId)) continue;
      if (shouldInitiateCall(user.id, peerUserId)) {
        tryCall(peerUserId, stream, gen);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, meshActive, user?.id]);

  // Cleanup au démontage du provider (logout, navigation dure, …).
  useEffect(() => {
    return () => {
      shutdownMesh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------------------
  // Helpers internes (dans la closure du provider pour accéder aux refs).
  // ----------------------------------------------------------------------

  function shutdownMesh() {
    generationRef.current++;
    for (const timer of retryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    retryTimersRef.current.clear();
    for (const conn of connsRef.current.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    connsRef.current.clear();
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // ignore
      }
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }

  function tryCall(remoteUserId: string, stream: MediaStream, gen: number) {
    const peer = peerRef.current;
    if (!peer || peer.destroyed) return;
    if (gen !== generationRef.current) return;
    const call = peer.call(getMeshAudioPeerId(remoteUserId), stream);
    if (!call) return;
    registerConnection(remoteUserId, call, stream, gen);
  }

  function scheduleRetry(
    remoteUserId: string,
    stream: MediaStream,
    gen: number,
  ) {
    const existing = retryTimersRef.current.get(remoteUserId);
    if (existing) window.clearTimeout(existing);
    const t = window.setTimeout(() => {
      retryTimersRef.current.delete(remoteUserId);
      if (gen !== generationRef.current) return;
      if (connsRef.current.has(remoteUserId)) return;
      // Re-check que le peer est toujours attendu dans la scène.
      const stillWanted = sceneRef.current?.participants.includes(remoteUserId);
      if (!stillWanted) return;
      tryCall(remoteUserId, stream, gen);
    }, 2000);
    retryTimersRef.current.set(remoteUserId, t);
  }

  function registerConnection(
    remoteUserId: string,
    conn: MediaConnection,
    stream: MediaStream,
    gen: number,
  ) {
    // Tie-breaker : si deux conns co-existent pour le même peer (race), on
    // garde celle dont l'initiator a le plus petit userId (déterministe).
    const existing = connsRef.current.get(remoteUserId);
    if (existing && existing !== conn) {
      try {
        existing.close();
      } catch {
        // ignore
      }
    }
    connsRef.current.set(remoteUserId, conn);

    conn.on("stream", (remote) => {
      if (gen !== generationRef.current) return;
      setRemoteAudios((prev) => {
        const without = prev.filter((r) => r.userId !== remoteUserId);
        return [...without, { userId: remoteUserId, stream: remote }];
      });
    });

    conn.on("close", () => {
      if (connsRef.current.get(remoteUserId) === conn) {
        connsRef.current.delete(remoteUserId);
      }
      setRemoteAudios((prev) => prev.filter((r) => r.userId !== remoteUserId));
      // Retry si le peer est toujours attendu (il a peut-être juste
      // rechargé son onglet).
      if (gen === generationRef.current) {
        const stillWanted =
          sceneRef.current?.participants.includes(remoteUserId);
        if (stillWanted && shouldInitiateCallRef.current(remoteUserId)) {
          scheduleRetry(remoteUserId, stream, gen);
        }
      }
    });

    conn.on("error", () => {
      if (connsRef.current.get(remoteUserId) === conn) {
        connsRef.current.delete(remoteUserId);
      }
      if (gen === generationRef.current) {
        const stillWanted =
          sceneRef.current?.participants.includes(remoteUserId);
        if (stillWanted && shouldInitiateCallRef.current(remoteUserId)) {
          scheduleRetry(remoteUserId, stream, gen);
        }
      }
    });
  }

  const value = useMemo<MeshCtx>(
    () => ({
      meshActive,
      hasMic,
      micEnabled,
      toggleMic,
      error,
      remoteAudios,
      mutedPeers,
      togglePeerMute,
    }),
    [
      meshActive,
      hasMic,
      micEnabled,
      toggleMic,
      error,
      remoteAudios,
      mutedPeers,
      togglePeerMute,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Sink audio invisible : monte un <audio> par peer distant pour que
          le navigateur joue le flux sans qu'on ait à exposer d'élément
          UI dédié. Le `muted` suit `mutedPeers` (côté écoute uniquement,
          ça n'affecte pas ce que les autres entendent de nous). */}
      <div
        aria-hidden
        style={{ position: "fixed", width: 0, height: 0, overflow: "hidden" }}
      >
        {remoteAudios.map((r) => (
          <RemoteAudioSink
            key={r.userId}
            stream={r.stream}
            muted={mutedPeers.has(r.userId)}
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Monte un `<audio>` autoPlay bindé à un MediaStream.
 * Utile parce que React ne peut pas passer un MediaStream via `src=` —
 * il faut passer par `.srcObject` en effet.
 */
function RemoteAudioSink({
  stream,
  muted,
}: {
  stream: MediaStream;
  muted: boolean;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    // `play()` peut être bloqué tant que la page n'a pas été touchée par
    // l'utilisateur. Un `catch()` silencieux suffit : dès le premier clic
    // sur n'importe quel bouton de l'UI, le navigateur autorisera la
    // lecture et le flux audio deviendra audible.
    el.play().catch(() => {
      // ignore — autoplay policy
    });
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline muted={muted} />;
}

/**
 * Tie-breaker lexicographique : pour chaque paire (me, other), exactement
 * un des deux initie l'appel (celui avec le userId "le plus petit"). Sans
 * ça, les deux côtés s'appelleraient et on se retrouverait avec 2
 * MediaConnection par paire.
 */
function shouldInitiateCall(myUserId: string, otherUserId: string): boolean {
  return myUserId < otherUserId;
}

/**
 * Récupère un userId depuis un peer-ID audio mesh (l'inverse de
 * `getMeshAudioPeerId`). Retourne null si le préfixe ne matche pas.
 */
function resolveUserIdFromPeerId(peerId: string): string | null {
  const prefix = "vaelyndra-live-audio-v1-";
  if (!peerId.startsWith(prefix)) return null;
  return peerId.slice(prefix.length) || null;
}

export function useLiveMeshAudio(): MeshCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useLiveMeshAudio doit être utilisé dans un LiveMeshAudioProvider",
    );
  }
  return ctx;
}
