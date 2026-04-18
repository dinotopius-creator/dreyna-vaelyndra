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
    return { ...DEFAULT_CONFIG, ...parsed };
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

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // quota exceeded, on ignore
    }
  }, [config]);

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
      const peer = new PeerCtor(LIVE_ROOM_PEER_ID, { debug: 1 });

      peer.on("error", (err: Error & { type?: string }) => {
        // unavailable-id : un live est déjà ouvert ailleurs.
        if (err.type === "unavailable-id") {
          setLastError(
            "Un live Vaelyndra est déjà actif ailleurs. Ferme l'autre onglet.",
          );
          stopLive();
        } else {
          console.warn("PeerJS host error", err);
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

      hostPeerRef.current = peer;
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

    setConfig((c) => ({
      ...c,
      status: "live",
      mode: "screen",
      startedAt: new Date().toISOString(),
    }));
  }, [stopLive]);

  /**
   * Côté viewer : on tente de joindre le flux d'écran quand la config dit
   * status=live + mode=screen. Si la reine n'a pas démarré, peerjs renvoie
   * `peer-unavailable` et on reste en "pas de flux".
   */
  useEffect(() => {
    if (config.mode !== "screen" || config.status !== "live") {
      return;
    }
    // Si on est l'hôte (on a un hostPeer), on ne doit pas jouer les viewers.
    if (hostPeerRef.current) return;

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

        viewerPeer.on("open", () => {
          if (cancelled) return;
          const call = viewerPeer.call(
            LIVE_ROOM_PEER_ID,
            new MediaStream(),
          );
          if (!call) {
            setIsConnecting(false);
            return;
          }
          call.on("stream", (stream) => {
            if (cancelled) return;
            setRemoteStream(stream);
            setIsConnecting(false);
          });
          call.on("close", () => {
            if (cancelled) return;
            setRemoteStream(null);
          });
          call.on("error", () => {
            if (cancelled) return;
            setRemoteStream(null);
            setIsConnecting(false);
          });
        });

        viewerPeer.on("error", (err: Error & { type?: string }) => {
          if (err.type === "peer-unavailable") {
            // Pas de live actuellement : silencieux.
            setIsConnecting(false);
            return;
          }
          console.warn("PeerJS viewer error", err);
          setIsConnecting(false);
        });

        viewerPeerRef.current = viewerPeer;
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
  }, [config.mode, config.status]);

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
