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
import { useStore } from "./StoreContext";

/**
 * Contexte dédié au "vrai" live de Dreyna.
 *
 * Deux modes disponibles :
 *  - "twitch" : la reine streame depuis OBS vers Twitch. Le site embed le
 *    lecteur Twitch officiel. La clé de stream OBS est stockée en local chez
 *    la reine uniquement (jamais envoyée nulle part).
 *  - "screen" : partage d'écran direct depuis le navigateur via WebRTC
 *    (peerjs + broker public gratuit). Pas d'OBS nécessaire, la reine clique
 *    "Partager mon écran" et les viewers reçoivent le flux en direct.
 */

export const LIVE_TITLE_MAX = 20;
export const LIVE_DESCRIPTION_MAX = 100;

export const LIVE_ROOM_PEER_ID = "dreyna-vaelyndra-royal-court-live";

export type LiveMode = "twitch" | "screen";

export interface LiveConfig {
  status: "idle" | "live";
  mode: LiveMode;
  title: string;
  description: string;
  twitchChannel: string;
  obsKey: string;
  startedAt: string | null;
}

const CONFIG_STORAGE_KEY = "vaelyndra_live_config_v1";

const DEFAULT_CONFIG: LiveConfig = {
  status: "idle",
  mode: "screen",
  title: "",
  description: "",
  twitchChannel: "",
  obsKey: "",
  startedAt: null,
};

function readConfig(): LiveConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LiveConfig>;
    // Un live WebRTC/Twitch ne survit pas à un rechargement de page
    // (le peer et le MediaStream sont détruits). On force donc toujours
    // `status = idle` au boot pour éviter qu'un crash ou une fermeture
    // d'onglet laisse un faux "En direct" sur tout le site.
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      status: "idle",
      startedAt: null,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface LiveCtx {
  config: LiveConfig;
  updateConfig: (patch: Partial<LiveConfig>) => void;
  /** Côté reine : démarrer le partage d'écran via WebRTC. */
  startScreenShare: () => Promise<void>;
  /** Côté reine : arrêter le live. */
  stopLive: () => void;
  /**
   * Côté viewer : tente de rejoindre un live en cours. Retourne une fonction
   * de cleanup à appeler au démontage. Idempotent.
   */
  joinAsViewer: () => () => void;
  /** Côté viewer : si un flux d'écran est en cours, on le reçoit ici. */
  remoteStream: MediaStream | null;
  /** Côté reine : le flux local en cours (pour s'auto-regarder). */
  localStream: MediaStream | null;
  /** Côté viewer : true pendant qu'on tente de joindre le live. */
  isConnecting: boolean;
  /** Dernière erreur éventuelle (à afficher en toast). */
  lastError: string | null;
}

const Ctx = createContext<LiveCtx | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { isLiveOn, setLiveOn } = useStore();
  const [config, setConfig] = useState<LiveConfig>(() => readConfig());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const hostPeerRef = useRef<Peer | null>(null);
  const viewerPeerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<Set<MediaConnection>>(new Set());
  // Ref miroir sur le flux local pour que `cleanup` puisse toujours couper
  // les tracks même quand il est appelé depuis un callback qui a capturé
  // l'ancienne valeur de state (ex. listener "ended" ou erreur peer).
  const localStreamRef = useRef<MediaStream | null>(null);
  // Ref miroir sur la config pour que les callbacks peerjs (call, connection,
  // error) lisent toujours la valeur à jour sans avoir à se réabonner.
  const configRef = useRef<LiveConfig>(config);
  configRef.current = config;

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // quota exceeded, on ignore
    }
  }, [config]);

  // Synchronisation cross-tab : si la reine ouvre le site dans deux onglets
  // (ex: un pour la Salle du Trône, un autre pour le rendu public),
  // l'onglet "viewer" récupère automatiquement les changements de titre /
  // description écrits par l'onglet "host".
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CONFIG_STORAGE_KEY || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as Partial<LiveConfig>;
        // Pour le mode WebRTC (screen), on NE recopie JAMAIS le
        // "status=live" de l'autre onglet : seul un tab avec un
        // hostPeer/viewerPeer réellement ouvert a le droit d'allumer le
        // live ici (cf. joinAsViewer + startScreenShare).
        // Pour le mode Twitch en revanche, le "live" est purement
        // déclaratif (aucune ressource WebRTC à maintenir côté client),
        // donc on propage le status pour que tous les onglets affichent
        // bien le lecteur Twitch embed.
        const nextMode =
          next.mode === "twitch" || next.mode === "screen"
            ? next.mode
            : undefined;
        const shouldSyncStatus =
          nextMode === "twitch" && next.status === "live";
        const shouldClearStatus =
          nextMode === "twitch" && next.status === "idle";
        setConfig((c) => ({
          ...c,
          title: typeof next.title === "string" ? next.title : c.title,
          description:
            typeof next.description === "string"
              ? next.description
              : c.description,
          mode: nextMode ?? c.mode,
          twitchChannel:
            typeof next.twitchChannel === "string"
              ? next.twitchChannel
              : c.twitchChannel,
          status: shouldSyncStatus
            ? "live"
            : shouldClearStatus
              ? "idle"
              : c.status,
          startedAt: shouldSyncStatus
            ? typeof next.startedAt === "string"
              ? next.startedAt
              : c.startedAt
            : shouldClearStatus
              ? null
              : c.startedAt,
        }));
      } catch {
        // payload invalide — on ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Synchronise l'ancien drapeau `isLiveOn` (Navbar/Home/Admin) avec le
  // nouveau statut `config.status`. Permet à l'ensemble du site de réagir
  // quand la reine lance/termine un vrai live depuis la Salle du Trône.
  useEffect(() => {
    const shouldBeOn = config.status === "live";
    if (shouldBeOn !== isLiveOn) setLiveOn(shouldBeOn);
  }, [config.status, isLiveOn, setLiveOn]);

  const updateConfig = useCallback((patch: Partial<LiveConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  /** Ferme proprement toutes les ressources WebRTC (reine ou viewer). */
  const cleanup = useCallback(() => {
    hostConnectionsRef.current.forEach((call) => {
      try {
        call.close();
      } catch {
        // ignore
      }
    });
    hostConnectionsRef.current.clear();

    if (hostPeerRef.current) {
      try {
        hostPeerRef.current.destroy();
      } catch {
        // ignore
      }
      hostPeerRef.current = null;
    }
    if (viewerPeerRef.current) {
      try {
        viewerPeerRef.current.destroy();
      } catch {
        // ignore
      }
      viewerPeerRef.current = null;
    }

    const activeStream = localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnecting(false);
  }, []);

  const stopLive = useCallback(() => {
    cleanup();
    setConfig((c) => ({ ...c, status: "idle", startedAt: null }));
  }, [cleanup]);

  const startScreenShare = useCallback(async () => {
    setLastError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setLastError("Ton navigateur ne supporte pas le partage d'écran.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setLastError(`Impossible d'accéder à l'écran : ${err.message}`);
      }
      return;
    }

    // Quand la reine arrête le partage depuis le prompt navigateur, on stoppe.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => stopLive());
    });

    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const { default: PeerCtor } = await import("peerjs");
      // Garde-fou anti race-condition : si la reine a stoppé le partage ou
      // quitté la page pendant l'import dynamique, `stopLive()` a déjà tourné
      // et `localStreamRef.current` ne pointe plus sur notre stream. On
      // annule proprement au lieu de créer un peer orphelin et de remettre
      // status=live par-dessus le idle fraîchement posé.
      if (localStreamRef.current !== stream) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const peer = new PeerCtor(LIVE_ROOM_PEER_ID, { debug: 1 });
      hostPeerRef.current = peer;
      // Tant que le peer n'a pas signalé "open", on est encore en phase de
      // négociation. Toute erreur durant cette phase (unavailable-id, network,
      // server-error, socket-error…) est fatale : on rembobine proprement et
      // on retombe en status=idle pour ne pas laisser le site en faux "live".
      let peerOpened = false;

      peer.on("open", () => {
        peerOpened = true;
        setConfig((c) => ({
          ...c,
          status: "live",
          mode: "screen",
          startedAt: new Date().toISOString(),
        }));
      });

      peer.on("error", (err: Error & { type?: string }) => {
        if (!peerOpened) {
          // Message dédié pour le cas "un autre live est déjà ouvert".
          const friendly =
            err.type === "unavailable-id"
              ? "Un live Vaelyndra est déjà actif ailleurs. Ferme l'autre onglet."
              : `Impossible de démarrer le relais live : ${err.message || err.type || "erreur inconnue"}`;
          setLastError(friendly);
          stopLive();
          return;
        }
        // Erreur après ouverture du peer : on log mais on ne tue pas le live,
        // peerjs se reconnecte souvent tout seul sur ces cas (ex: flux viewer
        // qui claque). Les vraies déconnexions fatales passent par
        // peer.on("disconnected") ci-dessous.
        console.warn("PeerJS host error after open", err);
      });

      peer.on("disconnected", () => {
        // Perte de connexion au broker peerjs après coup : on coupe le live.
        if (peerOpened) {
          setLastError(
            "La connexion au serveur de relais a été perdue. Relance un live quand tu es prête.",
          );
          stopLive();
        }
      });

      peer.on("call", (incoming) => {
        // Un viewer nous appelle — on lui envoie notre flux.
        incoming.answer(stream);
        hostConnectionsRef.current.add(incoming);
        incoming.on("close", () => {
          hostConnectionsRef.current.delete(incoming);
        });
      });

      peer.on("connection", (dataConn) => {
        // Le viewer ouvre une DataConnection juste pour réclamer les métas
        // (titre, description) afin d'afficher le cadre live côté public
        // même quand il est sur un autre navigateur que la reine.
        dataConn.on("open", () => {
          try {
            dataConn.send({
              type: "live-meta",
              title: configRef.current.title,
              description: configRef.current.description,
              mode: "screen",
            });
          } catch {
            // ignore
          }
        });
      });
    } catch (err) {
      setLastError(
        `Impossible de démarrer le relais WebRTC : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      return;
    }
  }, [stopLive]);

  /**
   * Côté viewer : tente activement de rejoindre un live en cours. Appelé
   * par la page `/live` au montage ET périodiquement (polling léger) pour
   * découvrir un live lancé depuis un autre navigateur, puisque le broker
   * peerjs public ne nous notifie pas quand un peer apparaît.
   *
   * Idempotent : si un viewerPeer existe déjà ou si on est l'hôte, on
   * ne refait rien. Retourne une fonction de nettoyage.
   */
  const joinAsViewer = useCallback(() => {
    // Déjà hôte : on regarde notre propre flux, pas besoin de se rejoindre.
    if (hostPeerRef.current) return () => {};
    // Déjà en train de se connecter / connecté.
    if (viewerPeerRef.current) return () => {};

    let cancelled = false;
    setIsConnecting(true);
    setLastError(null);

    (async () => {
      try {
        const { default: PeerCtor } = await import("peerjs");
        if (cancelled) return;
        // PeerJS accepte un id undefined pour qu'il en génère un, mais le
        // typage de la signature expose `string`. On contourne proprement.
        const viewerPeer = new (PeerCtor as unknown as {
          new (id?: string, options?: { debug?: number }): Peer;
        })(undefined, { debug: 1 });
        viewerPeerRef.current = viewerPeer;

        viewerPeer.on("open", () => {
          if (cancelled) return;
          // 1) Media call pour recevoir le flux d'écran.
          const call = viewerPeer.call(LIVE_ROOM_PEER_ID, new MediaStream());
          if (!call) {
            setIsConnecting(false);
            return;
          }
          call.on("stream", (stream) => {
            if (cancelled) return;
            setRemoteStream(stream);
            setIsConnecting(false);
            // On a bien rejoint un live : reflète-le dans la config
            // locale pour allumer les badges "EN DIRECT" partout sur le
            // site, même si on est sur un autre navigateur que la reine.
            setConfig((c) => ({ ...c, status: "live", mode: "screen" }));
          });
          call.on("close", () => {
            if (cancelled) return;
            setRemoteStream(null);
            // Le live vient de fermer côté reine : retour à idle.
            setConfig((c) => ({ ...c, status: "idle", startedAt: null }));
          });
          call.on("error", () => {
            if (cancelled) return;
            setRemoteStream(null);
            setIsConnecting(false);
          });

          // 2) DataConnection pour récupérer titre/description du live.
          const data = viewerPeer.connect(LIVE_ROOM_PEER_ID);
          data.on("data", (payload) => {
            if (cancelled) return;
            if (
              typeof payload === "object" &&
              payload !== null &&
              (payload as { type?: string }).type === "live-meta"
            ) {
              const meta = payload as {
                title?: string;
                description?: string;
                mode?: LiveMode;
              };
              setConfig((c) => ({
                ...c,
                title: typeof meta.title === "string" ? meta.title : c.title,
                description:
                  typeof meta.description === "string"
                    ? meta.description
                    : c.description,
                mode: meta.mode === "twitch" || meta.mode === "screen" ? meta.mode : c.mode,
              }));
            }
          });
        });

        viewerPeer.on("error", (err: Error & { type?: string }) => {
          if (err.type === "peer-unavailable") {
            // Pas de live actuellement : on reste silencieux et on libère
            // le peer pour autoriser une prochaine tentative.
            setIsConnecting(false);
            if (viewerPeerRef.current === viewerPeer) {
              try {
                viewerPeer.destroy();
              } catch {
                // ignore
              }
              viewerPeerRef.current = null;
            }
            return;
          }
          console.warn("PeerJS viewer error", err);
          setIsConnecting(false);
        });
      } catch (err) {
        if (!cancelled) {
          setIsConnecting(false);
          setLastError(
            `Impossible de rejoindre le live : ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerPeerRef.current) {
        try {
          viewerPeerRef.current.destroy();
        } catch {
          // ignore
        }
        viewerPeerRef.current = null;
      }
      setRemoteStream(null);
      setIsConnecting(false);
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LiveCtx>(
    () => ({
      config,
      updateConfig,
      startScreenShare,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
    }),
    [
      config,
      updateConfig,
      startScreenShare,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLive() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLive must be used in LiveProvider");
  return ctx;
}
