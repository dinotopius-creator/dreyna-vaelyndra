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
import {
  DEFAULT_LIVE_CATEGORY,
  normalizeLiveCategory,
  type LiveCategoryId,
} from "../data/liveCategories";
import {
  apiListLive,
  apiLiveHeartbeat,
  apiStopLive,
  type LiveSessionOut,
} from "../lib/liveApi";

/**
 * Contexte dédié aux lives (queen + cour). Multi-utilisateur.
 *
 * Trois modes disponibles :
 *  - "twitch" : le broadcaster streame depuis OBS vers Twitch. Le site embed le
 *    lecteur Twitch officiel. La clé de stream OBS est stockée en local chez
 *    le broadcaster uniquement (jamais envoyée nulle part).
 *  - "screen" : partage d'écran direct depuis le navigateur via WebRTC
 *    (peerjs + broker public gratuit). Pas d'OBS nécessaire, le broadcaster
 *    clique "Partager mon écran" et les viewers reçoivent le flux en direct.
 *    ⚠️ `getDisplayMedia` n'est pas supporté sur iOS Safari ni sur la plupart
 *    des navigateurs mobiles Android. Pour le mobile, utiliser le mode
 *    "camera" qui s'appuie sur `getUserMedia` (caméra frontale ou arrière).
 *  - "camera" : live caméra natif du navigateur via `getUserMedia`. Marche
 *    sur desktop (webcam) ET sur mobile (caméra frontale/arrière
 *    sélectionnables). Même pipeline WebRTC que "screen" côté viewers.
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

export type LiveMode = "twitch" | "screen" | "camera";

export type CameraFacing = "user" | "environment";

export interface LiveConfig {
  status: "idle" | "live";
  mode: LiveMode;
  title: string;
  description: string;
  /**
   * Catégorie sélectionnée au lancement du live (obligatoire côté UI, on
   * tolère ici un défaut pour que les configs legacy en localStorage
   * restent lisibles sans migration).
   */
  category: LiveCategoryId;
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
  /** Catégorie du live (affichée en badge dans le fil et sur /live). */
  category: LiveCategoryId;
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
  category: DEFAULT_LIVE_CATEGORY,
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
      // Normalise la catégorie : protège contre un localStorage corrompu
      // et force un défaut reconnu si l'ancien schéma (pré-PR E) n'avait
      // pas encore ce champ.
      category: normalizeLiveCategory(parsed.category),
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
      // Normalise la catégorie : une entrée pré-PR E pourra être
      // re-publiée sans faire planter le rendu, et une catégorie
      // inconnue (évolution future + downgrade du client) est
      // remplacée par le défaut.
      cleaned[k] = { ...v, category: normalizeLiveCategory(v.category) };
    }
    return cleaned;
  } catch {
    return {};
  }
}

/** Convertit une ligne LiveSession du backend en entrée de registre local. */
function remoteToRegistry(s: LiveSessionOut): LiveRegistryEntry {
  const mode: LiveMode =
    s.mode === "twitch" || s.mode === "screen" || s.mode === "camera"
      ? s.mode
      : "screen";
  return {
    userId: s.broadcaster_id,
    username: s.broadcaster_name,
    avatar: s.broadcaster_avatar,
    title: s.title,
    description: s.description,
    mode,
    category: normalizeLiveCategory(s.category),
    twitchChannel: s.twitch_channel,
    startedAt: s.started_at,
    lastHeartbeat: s.last_heartbeat_at,
  };
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
  /**
   * Annoncer un live Twitch (mode déclaratif, pas de WebRTC).
   * `channelOverride` permet au caller de passer le handle déjà normalisé
   * sans attendre que `updateConfig({ twitchChannel })` soit re-rendu
   * (sinon `configRef.current` lit encore la valeur pré-normalisation).
   */
  announceTwitchLive: (channelOverride?: string) => void;
  /** Côté host : démarrer le partage d'écran via WebRTC. */
  startScreenShare: () => Promise<void>;
  /**
   * Côté host : démarrer un live caméra (`getUserMedia`). Marche sur
   * desktop (webcam) et sur mobile (caméra frontale ou arrière selon
   * `facingMode`). Même pipeline peerjs que `startScreenShare`.
   */
  startCameraShare: (facingMode?: CameraFacing) => Promise<void>;
  /**
   * Côté host : bascule entre caméra frontale et arrière sans couper le
   * peer (on replace la vidéo track sur toutes les connexions actives).
   * No-op hors du mode caméra.
   */
  switchCamera: () => Promise<void>;
  /** Côté host : orientation actuelle de la caméra (user = frontale). */
  cameraFacing: CameraFacing;
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
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user");
  const [viewingMeta, setViewingMeta] = useState<
    { title: string; description: string; mode: LiveMode } | null
  >(null);

  const hostPeerRef = useRef<Peer | null>(null);
  const viewerPeerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<Set<MediaConnection>>(new Set());
  // Garde-fou anti double-clic sur `switchCamera` : `getUserMedia` prend
  // 100-500 ms sur mobile, sans ce verrou deux clics rapides créent deux
  // MediaStream concurrents et la première fuite (tracks jamais
  // `stop()`-ées → caméra/micro restent actifs en tâche de fond).
  const switchingCameraRef = useRef(false);
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
            next.mode === "twitch" ||
            next.mode === "screen" ||
            next.mode === "camera"
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
            category:
              next.category !== undefined
                ? normalizeLiveCategory(next.category)
                : c.category,
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

  /** Ferme UNIQUEMENT les ressources côté host (peer hôte + stream local). */
  const stopHosting = useCallback(() => {
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

    const activeStream = localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  /** Ferme UNIQUEMENT les ressources côté viewer (peer + remoteStream). */
  const stopViewing = useCallback(() => {
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
  }, []);

  /** Ferme tout (utilisé au démontage du provider). */
  const cleanup = useCallback(() => {
    stopHosting();
    stopViewing();
  }, [stopHosting, stopViewing]);

  const stopLive = useCallback(() => {
    const me = userRef.current;
    // IMPORTANT : ne ferme QUE le côté host, pour ne pas casser le stream
    // qu'on est en train de regarder sur un autre user (viewerPeerRef).
    stopHosting();
    setConfig((c) => ({ ...c, status: "idle", startedAt: null }));
    if (me) {
      updateRegistry((r) => {
        if (!(me.id in r)) return r;
        const next = { ...r };
        delete next[me.id];
        return next;
      });
      // Notifie le backend pour que les autres users voient disparaître
      // ce live immédiatement (sans attendre le TTL heartbeat 90 s).
      apiStopLive().catch(() => {
        // Si l'appel échoue, le serveur finira par supprimer l'entrée
        // une fois que le heartbeat expirera côté backend (90 s).
      });
    }
  }, [stopHosting, updateRegistry]);

  const announceTwitchLive = useCallback(
    (channelOverride?: string) => {
      const me = userRef.current;
      if (!me) {
        setLastError("Connecte-toi pour lancer un live.");
        return;
      }
      const c = configRef.current;
      const channel = (channelOverride ?? c.twitchChannel).trim();
      if (!channel) {
        setLastError("Renseigne ton nom de chaîne Twitch.");
        return;
      }
      const startedAt = new Date().toISOString();
      setConfig((cc) => ({
        ...cc,
        mode: "twitch",
        status: "live",
        twitchChannel: channel,
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
          category: c.category,
          twitchChannel: channel,
          startedAt,
          lastHeartbeat: startedAt,
        },
      }));
    },
    [updateRegistry],
  );

  /**
   * Attache un `MediaStream` (écran ou caméra) à un peer hôte et démarre
   * le broadcast. Partagé entre `startScreenShare` et `startCameraShare`
   * pour éviter la duplication de toute la mécanique peerjs.
   */
  const attachStreamToPeer = useCallback(
    async (
      stream: MediaStream,
      mode: Extract<LiveMode, "screen" | "camera">,
    ) => {
      const me = userRef.current;
      if (!me) {
        stream.getTracks().forEach((t) => t.stop());
        setLastError("Connecte-toi pour lancer un live.");
        return;
      }
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
            mode,
            startedAt,
          }));
          updateRegistry((r) => ({
            ...r,
            [me.id]: {
              userId: me.id,
              username: me.username,
              avatar: me.avatar,
              title:
                configRef.current.title.trim() || `${me.username} en direct`,
              description: configRef.current.description.trim(),
              mode,
              category: configRef.current.category,
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
          // Un viewer nous appelle — on lui envoie toujours le flux actif
          // (`localStreamRef.current`, pas la capture locale `stream`). Ça
          // garantit qu'un `switchCamera` qui recrée le stream sert la
          // nouvelle source aux nouveaux viewers (les anciens gardent leur
          // track remplacée via `RTCRtpSender.replaceTrack`).
          const active = localStreamRef.current ?? stream;
          incoming.answer(active);
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
                mode,
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
    },
    [stopLive, updateRegistry],
  );

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
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== "function"
    ) {
      // iOS Safari (<= 18) et la plupart des navigateurs Android n'exposent
      // pas `getDisplayMedia`. On le signale explicitement pour que l'UI
      // oriente vers le mode "camera" au lieu d'un échec silencieux.
      setLastError(
        "Ton navigateur ne supporte pas le partage d'écran. Utilise le mode caméra (dispo sur mobile).",
      );
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
    await attachStreamToPeer(stream, "screen");
  }, [attachStreamToPeer, stopLive]);

  const startCameraShare = useCallback(
    async (facingMode: CameraFacing = "user") => {
      const me = userRef.current;
      if (!me) {
        setLastError("Connecte-toi pour lancer un live.");
        return;
      }
      if (hostPeerRef.current || localStreamRef.current) return;
      setLastError(null);
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setLastError("Ton navigateur ne supporte pas l'accès caméra.");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // `facingMode` est un hint : sur desktop (webcam unique), le
          // navigateur ignore et prend la seule caméra dispo.
          video: {
            facingMode: { ideal: facingMode },
            frameRate: { ideal: 30 },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (err) {
        if (err instanceof Error && err.name !== "NotAllowedError") {
          setLastError(`Impossible d'accéder à la caméra : ${err.message}`);
        } else if (err instanceof Error) {
          setLastError(
            "Autorise l'accès à la caméra et au micro pour lancer ton live.",
          );
        }
        return;
      }
      setCameraFacing(facingMode);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (localStreamRef.current === stream) stopLive();
        });
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      await attachStreamToPeer(stream, "camera");
    },
    [attachStreamToPeer, stopLive],
  );

  /**
   * Bascule entre caméra frontale et arrière sans couper le peer. On
   * ouvre un nouveau flux avec l'autre `facingMode`, on remplace la
   * track vidéo sur tous les `RTCRtpSender` existants (viewers en cours),
   * et on stoppe l'ancienne track.
   */
  const switchCamera = useCallback(async () => {
    if (configRef.current.mode !== "camera") return;
    // Verrou re-entrant : tant que le swap précédent n'est pas fini, on
    // ignore les nouveaux appels. Sans ça un double-tap rapide ouvre deux
    // MediaStream, le premier n'est jamais stoppé (fuite caméra/micro).
    if (switchingCameraRef.current) return;
    const current = localStreamRef.current;
    if (!current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      return;
    }
    switchingCameraRef.current = true;
    try {
      const nextFacing: CameraFacing =
        cameraFacing === "user" ? "environment" : "user";
      let next: MediaStream;
      try {
        next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: nextFacing },
            frameRate: { ideal: 30 },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (err) {
        if (err instanceof Error) {
          setLastError(`Impossible de changer de caméra : ${err.message}`);
        }
        return;
      }

      // Si le live a été stoppé pendant le `await` (stopLive l'a nettoyé),
      // on jette le nouveau stream au lieu de le raccrocher à un peer mort.
      if (localStreamRef.current !== current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      const newVideoTrack = next.getVideoTracks()[0];
      const newAudioTrack = next.getAudioTracks()[0];
      if (!newVideoTrack) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      // Remplace les tracks sur toutes les MediaConnection viewers en cours.
      // `replaceTrack` est préféré à la renégociation complète : pas de
      // re-offer SDP, pas de coupure visible côté viewers.
      hostConnectionsRef.current.forEach((call) => {
        const senders = call.peerConnection?.getSenders() ?? [];
        for (const sender of senders) {
          if (sender.track?.kind === "video") {
            sender.replaceTrack(newVideoTrack).catch(() => {
              /* ignore — la connexion peut être en cours de fermeture */
            });
          } else if (sender.track?.kind === "audio" && newAudioTrack) {
            sender.replaceTrack(newAudioTrack).catch(() => {
              /* ignore */
            });
          }
        }
      });

      // Stoppe l'ancien stream (tracks) puis publie le nouveau côté host.
      current.getTracks().forEach((t) => t.stop());
      newVideoTrack.addEventListener("ended", () => {
        if (localStreamRef.current === next) stopLive();
      });
      localStreamRef.current = next;
      setLocalStream(next);
      setCameraFacing(nextFacing);
    } finally {
      switchingCameraRef.current = false;
    }
  }, [cameraFacing, stopLive]);

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
                  meta.mode === "twitch" ||
                  meta.mode === "screen" ||
                  meta.mode === "camera"
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

  // Volontairement aucun handler `beforeunload` / `pagehide` : un simple
  // refresh de la page (F5, pull-to-refresh mobile) ne doit PAS tuer le
  // live du broadcaster, c'était le bug #54 signalé. Le backend purge
  // automatiquement les entrées orphelines via le TTL heartbeat (90 s
  // côté serveur), ce qui couvre la fermeture définitive d'onglet sans
  // pénaliser les refresh volontaires. Le broadcaster peut restaurer
  // son live en relançant le partage d'écran après refresh — l'entrée
  // serveur reste vivante entre-temps, donc les viewers voient
  // "Reconnexion…" au lieu de "Live terminé".

  // Heartbeat : l'onglet qui diffuse rafraîchit `lastHeartbeat` toutes les
  // 30s. Combiné au filtrage dans `readRegistry` (seuil 90s), ça élimine
  // les entrées orphelines d'une fermeture brutale/crash en ~1-2 minutes,
  // sans risque de race cross-tab (seul le tab diffuseur écrit).
  //
  // Depuis le registre serveur (LiveSession), on POSTe aussi /live/heartbeat
  // pour que les autres users (sur d'autres browsers/devices) voient
  // apparaître ce live dans leur `/communaute`. Sans ce POST, le live
  // reste cantonné au localStorage du broadcaster.
  useEffect(() => {
    if (config.status !== "live") return;
    const me = userRef.current;
    if (!me) return;
    const tickLocal = () => {
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
    const tickServer = () => {
      const c = configRef.current;
      apiLiveHeartbeat({
        title: c.title,
        description: c.description,
        category: c.category,
        mode: c.mode,
        twitchChannel: c.twitchChannel,
      }).catch(() => {
        // Silencieux : un 401/403 (non connecté) ou un 5xx temporaire ne
        // doit pas interrompre le live local. Les viewers fallback-eront
        // sur le peerjs direct si le registre serveur n'est pas dispo.
      });
    };
    // Premier POST immédiat pour que les viewers voient le live tout de
    // suite (sans attendre 30 s), puis tick régulier.
    tickServer();
    const id = setInterval(() => {
      tickLocal();
      tickServer();
    }, 30_000);
    return () => clearInterval(id);
  }, [config.status]);

  // Sync registre serveur → registre local. Toutes les 10 s, on récupère
  // la liste publique des lives actifs depuis le backend et on la
  // fusionne dans `liveRegistry`. Résultat : Dreyna (ou n'importe quel
  // autre user) voit apparaître le live d'Alexandre sans avoir à
  // refresh la page ni à partager un localStorage.
  //
  // Stratégie de fusion :
  //  - entrées du serveur → on les ajoute / remplace (source de vérité)
  //  - entrée locale du broadcaster en cours → on la conserve telle
  //    quelle (le tick local est plus fréquent et garde les champs riches
  //    comme `lastHeartbeat`)
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const remote = await apiListLive();
        if (cancelled) return;
        const me = userRef.current;
        setLiveRegistry((prev) => {
          const next: Record<string, LiveRegistryEntry> = {};
          // 1. Toutes les entrées serveur (tous broadcasters).
          for (const s of remote) {
            // On ne touche pas à la sienne — l'entrée locale est la
            // source de vérité pour son propre live (titre modifié en
            // direct, heartbeat frais).
            if (me && s.broadcaster_id === me.id) continue;
            next[s.broadcaster_id] = remoteToRegistry(s);
          }
          // 2. Ma propre entrée conservée (si je suis en live sur ce tab).
          if (me && prev[me.id]) {
            next[me.id] = prev[me.id];
          }
          writeRegistry(next);
          return next;
        });
      } catch {
        // Backend indispo : on garde ce qu'on a en local, pas de reset.
      }
    };
    sync();
    const id = setInterval(sync, 10_000);
    // Re-sync au retour d'onglet (user mobile qui bascule d'app → revient).
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo<LiveCtx>(
    () => ({
      config,
      updateConfig,
      liveRegistry,
      announceTwitchLive,
      startScreenShare,
      startCameraShare,
      switchCamera,
      cameraFacing,
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
      startCameraShare,
      switchCamera,
      cameraFacing,
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
