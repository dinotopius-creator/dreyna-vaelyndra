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
import { useAuth } from "./AuthContext";

/**
 * Contexte dédié aux lives (queen + cour). Multi-utilisateur.
 *
 * Deux modes disponibles :
 *  - "twitch" : le broadcaster streame depuis OBS vers Twitch. Le site embed le
 *    lecteur Twitch officiel. La clé de stream OBS est stockée en local chez
 *    le broadcaster uniquement (jamais envoyée nulle part).
 *  - "screen" : partage d'écran direct depuis le navigateur via WebRTC
 *    (peerjs + broker public gratuit). Pas d'OBS nécessaire, le broadcaster
 *    clique "Partager mon écran" et les viewers reçoivent le flux en direct.
 *
 * Chaque broadcaster possède son propre peer-ID déterministe
 * `vaelyndra-live-<userId>`, ce qui permet à plusieurs membres de la cour
 * d'être en direct en même temps sans collision.
 */

export const LIVE_TITLE_MAX = 20;
export const LIVE_DESCRIPTION_MAX = 100;

/**
 * Peer-ID déterministe d'un broadcaster donné. Utilisé côté host comme
 * côté viewer pour ouvrir la MediaConnection WebRTC.
 */
export function getLivePeerId(userId: string): string {
  // Format conservé compatible avec l'historique dreyna-vaelyndra-royal-court-live
  return `vaelyndra-live-v2-${userId}`;
}

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

/**
 * Entrée du registre public des lives en cours. Stocké dans localStorage
 * sous `vaelyndra_live_registry_v1` et propagé cross-tab pour que le fil
 * communautaire voie apparaître un live lancé depuis un autre onglet ou
 * un autre membre.
 */
export interface LiveRegistryEntry {
  userId: string;
  username: string;
  avatar: string;
  title: string;
  description: string;
  mode: LiveMode;
  twitchChannel: string;
  startedAt: string;
  /**
   * Horodatage ISO mis à jour toutes les 30s par l'onglet qui diffuse.
   * Permet d'évincer les entrées orphelines (crash / fermeture brutale)
   * sans dépendre d'un TTL long (12h) et sans race cross-tab.
   */
  lastHeartbeat?: string;
}

const CONFIG_STORAGE_KEY = "vaelyndra_live_config_v1";
const REGISTRY_STORAGE_KEY = "vaelyndra_live_registry_v1";

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

/**
 * Heartbeat : l'onglet qui diffuse met à jour `lastHeartbeat` toutes les
 * 30 secondes. Toute entrée sans heartbeat récent (> 90s) est considérée
 * comme orpheline (crash, kill -9, coupure réseau) et éludée.
 * Les anciennes entrées sans champ heartbeat tombent sur un fallback TTL
 * de 2 minutes depuis `startedAt`.
 */
const REGISTRY_STALE_MS = 1000 * 90;
const REGISTRY_FALLBACK_TTL_MS = 1000 * 60 * 2;

function readRegistry(): Record<string, LiveRegistryEntry> {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LiveRegistryEntry>;
    const now = Date.now();
    const cleaned: Record<string, LiveRegistryEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object") continue;
      const started = new Date(v.startedAt).getTime();
      if (!Number.isFinite(started)) continue;
      if (v.lastHeartbeat) {
        const hb = new Date(v.lastHeartbeat).getTime();
        if (!Number.isFinite(hb)) continue;
        if (now - hb > REGISTRY_STALE_MS) continue;
      } else {
        // entrée legacy (pas de heartbeat) : on applique un TTL court
        if (now - started > REGISTRY_FALLBACK_TTL_MS) continue;
      }
      cleaned[k] = v;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeRegistry(registry: Record<string, LiveRegistryEntry>) {
  try {
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // quota exceeded, on ignore
  }
}

interface LiveCtx {
  /** Config du live du user connecté (son propre broadcast). */
  config: LiveConfig;
  updateConfig: (patch: Partial<LiveConfig>) => void;
  /** Registre public des lives en cours (tous users). */
  liveRegistry: Record<string, LiveRegistryEntry>;
  /** Annoncer un live Twitch (mode déclaratif, pas de WebRTC). */
  announceTwitchLive: () => void;
  /** Côté host : démarrer le partage d'écran via WebRTC. */
  startScreenShare: () => Promise<void>;
  /** Côté host : arrêter mon live. */
  stopLive: () => void;
  /**
   * Côté viewer : tente de rejoindre un live en cours pour un broadcaster
   * donné. Retourne une fonction de cleanup à appeler au démontage.
   * Idempotent.
   */
  joinAsViewer: (broadcasterId: string) => () => void;
  /** Côté viewer : si un flux d'écran est en cours, on le reçoit ici. */
  remoteStream: MediaStream | null;
  /** Côté host : le flux local en cours (pour s'auto-regarder). */
  localStream: MediaStream | null;
  /** Côté viewer : true pendant qu'on tente de joindre le live. */
  isConnecting: boolean;
  /** Dernière erreur éventuelle (à afficher en toast). */
  lastError: string | null;
  /** Métadonnées du live actuellement regardé (titre/description/etc). */
  viewingMeta: { title: string; description: string; mode: LiveMode } | null;
}

const Ctx = createContext<LiveCtx | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { isLiveOn, setLiveOn } = useStore();
  const { user } = useAuth();
  const [config, setConfig] = useState<LiveConfig>(() => readConfig());
  const [liveRegistry, setLiveRegistry] = useState<
    Record<string, LiveRegistryEntry>
  >(() => readRegistry());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [viewingMeta, setViewingMeta] = useState<
    { title: string; description: string; mode: LiveMode } | null
  >(null);

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
  // Ref miroir sur l'utilisateur courant pour les callbacks asynchrones.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // quota exceeded, on ignore
    }
  }, [config]);

  // Synchronisation cross-tab : titre / description écrits par l'onglet
  // "host" se propagent aux autres onglets (pour préview / admin).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONFIG_STORAGE_KEY && event.newValue) {
        try {
          const next = JSON.parse(event.newValue) as Partial<LiveConfig>;
          const nextMode =
            next.mode === "twitch" || next.mode === "screen"
              ? next.mode
              : undefined;
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
          }));
        } catch {
          // payload invalide — on ignore
        }
      }
      if (event.key === REGISTRY_STORAGE_KEY) {
        setLiveRegistry(readRegistry());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Synchronise l'ancien drapeau `isLiveOn` (Navbar/Home/Admin) avec le
  // nouveau statut : on allume le drapeau "live actif" dès qu'un membre
  // (quel qu'il soit) est en direct, pour que les badges globaux du site
  // s'allument.
  useEffect(() => {
    const shouldBeOn = Object.keys(liveRegistry).length > 0;
    if (shouldBeOn !== isLiveOn) setLiveOn(shouldBeOn);
  }, [liveRegistry, isLiveOn, setLiveOn]);

  const updateConfig = useCallback((patch: Partial<LiveConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  /** Écrit le registre public des lives (état + persistance + cross-tab). */
  const updateRegistry = useCallback(
    (
      updater: (
        r: Record<string, LiveRegistryEntry>,
      ) => Record<string, LiveRegistryEntry>,
    ) => {
      setLiveRegistry((prev) => {
        const next = updater(prev);
        writeRegistry(next);
        return next;
      });
    },
    [],
  );

  /** Ferme proprement toutes les ressources WebRTC (host ou viewer). */
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
    setViewingMeta(null);
  }, []);

  const stopLive = useCallback(() => {
    const me = userRef.current;
    cleanup();
    setConfig((c) => ({ ...c, status: "idle", startedAt: null }));
    if (me) {
      updateRegistry((r) => {
        if (!(me.id in r)) return r;
        const next = { ...r };
        delete next[me.id];
        return next;
      });
    }
  }, [cleanup, updateRegistry]);

  const announceTwitchLive = useCallback(() => {
    const me = userRef.current;
    if (!me) {
      setLastError("Connecte-toi pour lancer un live.");
      return;
    }
    const c = configRef.current;
    if (!c.twitchChannel.trim()) {
      setLastError("Renseigne ton nom de chaîne Twitch.");
      return;
    }
    const startedAt = new Date().toISOString();
    setConfig((cc) => ({
      ...cc,
      mode: "twitch",
      status: "live",
      startedAt,
    }));
    updateRegistry((r) => ({
      ...r,
      [me.id]: {
        userId: me.id,
        username: me.username,
        avatar: me.avatar,
        title: c.title.trim() || `${me.username} en direct`,
        description: c.description.trim(),
        mode: "twitch",
        twitchChannel: c.twitchChannel.trim(),
        startedAt,
        lastHeartbeat: startedAt,
      },
    }));
  }, [updateRegistry]);

  const startScreenShare = useCallback(async () => {
    const me = userRef.current;
    if (!me) {
      setLastError("Connecte-toi pour lancer un live.");
      return;
    }
    // Garde-fou anti-double-clic : si un peer hôte existe déjà (en cours
    // de connexion au broker OU déjà ouvert), on refuse une seconde
    // invocation. Sans ça, un double-clic pendant la phase asynchrone
    // (prompt getDisplayMedia + import peerjs) orphelinerait le premier
    // peer/stream et laisserait l'indicateur de partage d'écran du
    // navigateur actif sans moyen de le couper depuis l'app.
    if (hostPeerRef.current || localStreamRef.current) return;
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

    // Quand on arrête le partage depuis le prompt navigateur, on stoppe.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (localStreamRef.current === stream) stopLive();
      });
    });

    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const { default: PeerCtor } = await import("peerjs");
      // Garde-fou anti race-condition : si le host a stoppé le partage ou
      // quitté la page pendant l'import dynamique, `stopLive()` a déjà tourné
      // et `localStreamRef.current` ne pointe plus sur notre stream.
      if (localStreamRef.current !== stream) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const peerId = getLivePeerId(me.id);
      const peer = new PeerCtor(peerId, { debug: 1 });
      hostPeerRef.current = peer;
      let peerOpened = false;

      peer.on("open", () => {
        peerOpened = true;
        const startedAt = new Date().toISOString();
        setConfig((c) => ({
          ...c,
          status: "live",
          mode: "screen",
          startedAt,
        }));
        // Enregistre dans le registre public pour que le fil
        // communautaire et les autres onglets voient le live.
        updateRegistry((r) => ({
          ...r,
          [me.id]: {
            userId: me.id,
            username: me.username,
            avatar: me.avatar,
            title: configRef.current.title.trim() || `${me.username} en direct`,
            description: configRef.current.description.trim(),
            mode: "screen",
            twitchChannel: "",
            startedAt,
            lastHeartbeat: startedAt,
          },
        }));
      });

      peer.on("error", (err: Error & { type?: string }) => {
        if (!peerOpened) {
          const friendly =
            err.type === "unavailable-id"
              ? "Un live Vaelyndra est déjà actif à ton nom ailleurs. Ferme l'autre onglet."
              : `Impossible de démarrer le relais live : ${err.message || err.type || "erreur inconnue"}`;
          setLastError(friendly);
          stopLive();
          return;
        }
        console.warn("PeerJS host error after open", err);
      });

      peer.on("disconnected", () => {
        if (peerOpened) {
          setLastError(
            "La connexion au serveur de relais a été perdue. Relance un live quand tu es prêt.",
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
        // Le viewer ouvre une DataConnection juste pour réclamer les métas.
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
  }, [stopLive, updateRegistry]);

  /**
   * Côté viewer : tente activement de rejoindre le live d'un broadcaster
   * donné. Idempotent : si un viewerPeer existe déjà ou si on est le host
   * du broadcasterId ciblé, on ne refait rien.
   */
  const joinAsViewer = useCallback((broadcasterId: string) => {
    if (!broadcasterId) return () => {};
    // Déjà hôte de ce broadcast : on regarde notre propre flux.
    if (hostPeerRef.current && userRef.current?.id === broadcasterId)
      return () => {};
    // Déjà en train de se connecter / connecté.
    if (viewerPeerRef.current) return () => {};

    let cancelled = false;
    setIsConnecting(true);
    setLastError(null);

    (async () => {
      try {
        const { default: PeerCtor } = await import("peerjs");
        if (cancelled) return;
        const viewerPeer = new (PeerCtor as unknown as {
          new (id?: string, options?: { debug?: number }): Peer;
        })(undefined, { debug: 1 });
        viewerPeerRef.current = viewerPeer;

        viewerPeer.on("open", () => {
          if (cancelled) return;
          const targetPeerId = getLivePeerId(broadcasterId);
          const call = viewerPeer.call(targetPeerId, new MediaStream());
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

          // DataConnection pour récupérer titre/description du live.
          const data = viewerPeer.connect(targetPeerId);
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
              setViewingMeta({
                title: typeof meta.title === "string" ? meta.title : "",
                description:
                  typeof meta.description === "string"
                    ? meta.description
                    : "",
                mode:
                  meta.mode === "twitch" || meta.mode === "screen"
                    ? meta.mode
                    : "screen",
              });
            }
          });
        });

        viewerPeer.on("error", (err: Error & { type?: string }) => {
          if (err.type === "peer-unavailable") {
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
      setViewingMeta(null);
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nettoyage de l'entrée registry à la fermeture / au reload de l'onglet.
  // CRUCIAL : on ne retire QUE si CE tab est celui qui diffuse (status=live
  // ET hostPeerRef actif). Sans ces deux gardes, fermer n'importe quel
  // onglet non-broadcaster tuerait le live d'un autre onglet du même user
  // via le listener `storage`.
  useEffect(() => {
    const removeMyEntry = () => {
      const me = userRef.current;
      if (!me) return;
      // Tab non-diffuseur : on ne touche à rien (évite les races cross-tab).
      if (configRef.current.status !== "live") return;
      if (!hostPeerRef.current && configRef.current.mode !== "twitch") return;
      try {
        const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, LiveRegistryEntry>;
        if (!(me.id in parsed)) return;
        delete parsed[me.id];
        localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", removeMyEntry);
    window.addEventListener("pagehide", removeMyEntry);
    return () => {
      window.removeEventListener("beforeunload", removeMyEntry);
      window.removeEventListener("pagehide", removeMyEntry);
    };
  }, []);

  // Heartbeat : l'onglet qui diffuse rafraîchit `lastHeartbeat` toutes les
  // 30s. Combiné au filtrage dans `readRegistry` (seuil 90s), ça élimine
  // les entrées orphelines d'une fermeture brutale/crash en ~1-2 minutes,
  // sans risque de race cross-tab (seul le tab diffuseur écrit).
  useEffect(() => {
    if (config.status !== "live") return;
    const me = userRef.current;
    if (!me) return;
    const tick = () => {
      try {
        // On passe par readRegistry() pour filtrer au passage les entrées
        // orphelines des autres broadcasters (crash, heartbeat > 90s). Sans
        // ce filtrage, un tick recopierait les fantômes à chaque passage.
        const filtered = readRegistry();
        const mine = filtered[me.id];
        if (!mine) return;
        filtered[me.id] = { ...mine, lastHeartbeat: new Date().toISOString() };
        writeRegistry(filtered);
        setLiveRegistry(filtered);
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [config.status]);

  const value = useMemo<LiveCtx>(
    () => ({
      config,
      updateConfig,
      liveRegistry,
      announceTwitchLive,
      startScreenShare,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
      viewingMeta,
    }),
    [
      config,
      updateConfig,
      liveRegistry,
      announceTwitchLive,
      startScreenShare,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
      viewingMeta,
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
