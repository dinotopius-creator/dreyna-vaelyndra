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
import type { DataConnection, MediaConnection } from "peerjs";
import { useStore } from "./StoreContext";
import { useAuth } from "./AuthContext";
import { getIceServers, getPeerOptions } from "../lib/peerConfig";
import {
  isNativeAndroidApp,
  stopNativeScreenShare,
} from "../lib/nativeScreenShare";
import type {
  ChatMessage,
  LiveGiftEvent,
  LiveViewerSummary,
} from "../types";
import { GIFT_CATALOGUE } from "../data/mock";
import {
  DEFAULT_LIVE_CATEGORY,
  normalizeLiveCategory,
  type LiveCategoryId,
} from "../data/liveCategories";
import {
  apiListLive,
  apiAddNativeViewerIce,
  apiCreateNativeLiveOffer,
  apiGetNativeLiveOffer,
  apiHeartbeatNativeViewer,
  apiLiveHeartbeat,
  apiStopLive,
  type LiveSessionOut,
  type NativeIceCandidate,
} from "../lib/liveApi";
import { publishCrossWindowLiveChat } from "../lib/liveChatBus";
import {
  createLiveAvatarStream,
  type LiveAvatarStreamHandle,
} from "../lib/liveAvatarStream";

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

export type LiveMode = "twitch" | "screen" | "android-screen" | "camera";

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
const RESUME_MARKER_KEY = "vaelyndra_live_resume_marker_v1";
/**
 * TTL du marker de reprise. Au-delà, on considère que le user a vraiment
 * fermé son live (pas juste rafraîchi la page). 5 minutes est un bon
 * compromis : assez long pour couvrir un refresh + reconfigure réseau
 * (4G → WiFi), assez court pour ne pas proposer de reprendre un live
 * abandonné 20 min plus tôt.
 */
const RESUME_MARKER_TTL_MS = 1000 * 60 * 5;

/**
 * Marker persisté quand un user est en train de broadcaster. Permet de
 * lui proposer une reprise de live après un rafraîchissement de page
 * (F5, pull-to-refresh mobile, crash onglet) plutôt que d'afficher
 * "Le rideau est tiré" alors qu'il était juste en train de streamer.
 *
 * ⚠️ Le MediaStream (getUserMedia / getDisplayMedia) ne survit PAS au
 * rechargement : une reprise re-prompte le navigateur pour la caméra /
 * l'écran. C'est une contrainte du modèle de sécurité WebRTC, pas un
 * bug de l'appli. Le marker sert juste à proposer un bouton
 * "Reprendre mon live" au lieu de laisser le user croire qu'il a été
 * déconnecté du réseau.
 */
interface LiveResumeMarker {
  userId: string;
  mode: LiveMode;
  facing: CameraFacing;
  title: string;
  description: string;
  category: LiveCategoryId;
  twitchChannel: string;
  savedAt: string;
}

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

async function captureDisplayStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      // Demande le son d'onglet/système quand le navigateur le permet.
      // Certains navigateurs rejettent toute la capture avec `audio:true`;
      // dans ce cas on retente en vidéo seule au lieu de laisser le live bloqué.
      audio: true,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "NotAllowedError") {
      throw err;
    }
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: false,
    });
  }
}

function isPermissionDeniedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
  );
}

function isMobileMediaBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser/i.test(ua);
}

function buildCameraConstraints(
  facingMode: CameraFacing,
  options?: {
    deviceId?: string | null;
    preferExactDevice?: boolean;
    allowExactFacing?: boolean;
  },
): MediaTrackConstraints {
  const deviceId = options?.deviceId?.trim() || "";
  const allowExactFacing = options?.allowExactFacing === true;
  const base: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };
  if (deviceId && options?.preferExactDevice) {
    return {
      ...base,
      deviceId: { exact: deviceId },
    };
  }
  if (deviceId) {
    return {
      ...base,
      deviceId: { ideal: deviceId },
      facingMode: { ideal: facingMode },
    };
  }
  return {
    ...base,
    facingMode: allowExactFacing ? { exact: facingMode } : { ideal: facingMode },
  };
}

function describeCameraAccessError(
  err: unknown,
  fallback: "start" | "switch",
): string {
  if (isPermissionDeniedError(err)) {
    return fallback === "switch"
      ? "Autorise à nouveau la caméra pour changer d'objectif."
      : "Autorise l'accès à la caméra et au micro pour lancer ton live.";
  }
  if (err instanceof Error) {
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return "Aucune caméra compatible n'a été détectée sur cet appareil.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "La caméra est déjà utilisée par une autre application. Ferme-la puis réessaie.";
    }
    if (
      err.name === "OverconstrainedError" ||
      err.name === "ConstraintNotSatisfiedError"
    ) {
      return fallback === "switch"
        ? "Cette caméra ne peut pas être ouverte avec les réglages demandés. Vaelyndra repasse sur un mode compatible."
        : "Cet appareil refuse les réglages vidéo demandés. Réessaie depuis un navigateur à jour.";
    }
    return `${
      fallback === "switch"
        ? "Impossible de changer de caméra"
        : "Impossible d'accéder à la caméra"
    } : ${err.message}`;
  }
  return fallback === "switch"
    ? "Impossible de changer de caméra."
    : "Impossible d'accéder à la caméra.";
}

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
 * 15-30 secondes. Sur mobile, Android peut geler le réseau pendant la
 * capture d'écran ; on garde l'entrée 4 min pour éviter les cycles
 * "live disparu puis revenu" côté viewers.
 * Les anciennes entrées sans champ heartbeat tombent sur un fallback TTL
 * de 2 minutes depuis `startedAt`.
 */
const REGISTRY_STALE_MS = 1000 * 240;
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
    s.mode === "twitch" ||
    s.mode === "screen" ||
    s.mode === "android-screen" ||
    s.mode === "camera"
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

function readResumeMarker(): LiveResumeMarker | null {
  try {
    const raw = localStorage.getItem(RESUME_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiveResumeMarker>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.savedAt !== "string"
    ) {
      return null;
    }
    const savedAt = new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > RESUME_MARKER_TTL_MS) {
      // Marker trop vieux : le user a vraiment fermé, pas juste refreshé.
      localStorage.removeItem(RESUME_MARKER_KEY);
      return null;
    }
    const mode: LiveMode =
      parsed.mode === "twitch" ||
      parsed.mode === "camera" ||
      parsed.mode === "android-screen"
        ? parsed.mode
        : "screen";
    const facing: CameraFacing =
      parsed.facing === "environment" ? "environment" : "user";
    return {
      userId: parsed.userId,
      mode,
      facing,
      title: typeof parsed.title === "string" ? parsed.title : "",
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      category: normalizeLiveCategory(parsed.category),
      twitchChannel:
        typeof parsed.twitchChannel === "string" ? parsed.twitchChannel : "",
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function writeResumeMarker(marker: LiveResumeMarker) {
  try {
    localStorage.setItem(RESUME_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // quota exceeded, on ignore
  }
}

function clearResumeMarker() {
  try {
    localStorage.removeItem(RESUME_MARKER_KEY);
  } catch {
    // ignore
  }
}

async function listVideoInputDevices() {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

function toNativeIceCandidate(candidate: RTCIceCandidate): NativeIceCandidate {
  const json = candidate.toJSON();
  return {
    candidate: json.candidate ?? "",
    sdpMid: json.sdpMid ?? null,
    sdpMLineIndex: json.sdpMLineIndex ?? null,
  };
}

interface LiveCtx {
  /** Config du live du user connecté (son propre broadcast). */
  config: LiveConfig;
  updateConfig: (patch: Partial<LiveConfig>) => void;
  saveLiveMetadata: (
    patch: Partial<Pick<LiveConfig, "title" | "description" | "category">>,
  ) => Promise<void>;
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
  /**
   * Côté host : true quand la caméra est volontairement coupée et qu'on
   * diffuse à la place un flux d'avatar (canvas captureStream).
   * Les viewers continuent à voir quelque chose (avatar + pseudo) sans
   * coupure ni reconnexion. L'audio n'est pas affecté.
   */
  cameraHidden: boolean;
  /**
   * Côté host : bascule entre "caméra ouverte" et "caméra masquée par
   * l'avatar". No-op hors du mode caméra.
   */
  toggleCameraHidden: () => Promise<void>;
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
  viewingMeta: {
    title: string;
    description: string;
    category: LiveCategoryId;
    mode: LiveMode;
  } | null;
  /**
   * Publie un message de chat sur le live courant.
   *
   *  - Côté host : le message est diffusé à tous les viewers connectés
   *    via leurs DataConnection respectives, puis livré localement à
   *    tous les subscribers (pour que le host voie aussi son propre
   *    message dans son chat).
   *  - Côté viewer : le message est envoyé au host via la
   *    DataConnection ouverte par `joinAsViewer`. Le host le re-diffuse
   *    ensuite à l'ensemble des viewers, y compris l'expéditeur (c'est
   *    cette rediffusion qui déclenche l'ajout local, pas l'envoi).
   *
   * Le transport est pur WebRTC (PeerJS DataChannel). Aucune
   * persistance serveur : les nouveaux viewers ne voient que les
   * messages postés *après* leur arrivée, c'est un chat volatile façon
   * Twitch.
   */
  publishChatMessage: (msg: ChatMessage) => void;
  /**
   * S'abonne aux messages de chat reçus du live courant. Appelé par la
   * page Live pour injecter les messages dans son state. Retourne un
   * cleanup à appeler au démontage.
   */
  subscribeChatMessages: (handler: (msg: ChatMessage) => void) => () => void;
  /**
   * Publie un événement de cadeau sur le live courant. Mêmes règles
   * que `publishChatMessage` : viewer → host → tous les viewers, avec
   * écho local pour le sender. Le host valide que `giftId` existe
   * dans `GIFT_CATALOGUE` avant de re-broadcaster (évite qu'un viewer
   * malveillant injecte un faux cadeau dans le top soutien).
   */
  publishGiftEvent: (event: LiveGiftEvent) => void;
  /**
   * S'abonne aux cadeaux reçus en temps réel sur le live courant.
   * Appelé par `Live.tsx` pour déclencher animations + son + maj du
   * leaderboard chez tous les viewers (pas seulement le sender).
   */
  subscribeGiftEvents: (
    handler: (event: LiveGiftEvent) => void,
  ) => () => void;
  /**
   * Si présent, le user a été broadcaster il y a moins de 5 min et sa
   * page a été rafraîchie (ou l'onglet rouvert) — on peut lui proposer
   * de reprendre son live en re-prompt getUserMedia / getDisplayMedia.
   * `null` sinon (nouveau visiteur, vraie fin de live, TTL expiré).
   */
  resumableLive: LiveResumeMarker | null;
  /**
   * Relance le broadcast en réutilisant la config du marker (mode,
   * facing, titre, description…). Re-prompte le navigateur pour l'accès
   * caméra / écran — c'est obligatoire côté sécurité WebRTC.
   */
  resumeLive: () => Promise<void>;
  /** Jette le marker : l'user veut démarrer un nouveau live, pas reprendre. */
  dismissResumableLive: () => void;
  /** Liste réelle des viewers humains actuellement connectés au live de ce host. */
  connectedViewers: LiveViewerSummary[];
}

const Ctx = createContext<LiveCtx | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { isLiveOn, setLiveOn } = useStore();
  const { user, users } = useAuth();
  const [config, setConfig] = useState<LiveConfig>(() => readConfig());
  const [liveRegistry, setLiveRegistry] = useState<
    Record<string, LiveRegistryEntry>
  >(() => readRegistry());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user");
  /**
   * Host : caméra volontairement coupée, on diffuse à la place le canvas
   * avatar. `cameraHiddenRef` est utilisé dans les callbacks asynchrones
   * pour éviter les valeurs périmées.
   */
  const [cameraHidden, setCameraHidden] = useState(false);
  const cameraHiddenRef = useRef(false);
  cameraHiddenRef.current = cameraHidden;
  /** Handle vers le flux canvas-avatar courant (pour le stopper). */
  const avatarStreamRef = useRef<LiveAvatarStreamHandle | null>(null);
  /**
   * Track vidéo "réelle" caméra mise en pause par le toggle. On la garde
   * stoppée (libère la caméra OS), et on en réacquiert une nouvelle quand
   * l'utilisateur ré-active la caméra.
   */
  const switchingCameraHiddenRef = useRef(false);
  const [viewingMeta, setViewingMeta] = useState<{
    title: string;
    description: string;
    category: LiveCategoryId;
    mode: LiveMode;
  } | null>(null);
  // Marker de reprise de live (post-refresh). Initialisé à partir de
  // localStorage : si un user a broadcasté il y a < 5 min et refreshé,
  // on récupère l'info pour lui proposer `resumeLive()`.
  const [resumableLive, setResumableLive] = useState<LiveResumeMarker | null>(
    () => readResumeMarker(),
  );
  const [connectedViewers, setConnectedViewers] = useState<LiveViewerSummary[]>(
    [],
  );

  const hostPeerRef = useRef<Peer | null>(null);
  const viewerPeerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<Set<MediaConnection>>(new Set());
  // Host : une MediaConnection sortante par viewer peer-id. Le flux est
  // initié par le host dès que la DataConnection du viewer s'ouvre, ce qui
  // évite l'offre SDP "vide" côté viewer qui bloquait certains navigateurs
  // sur "Connexion au flux..." sans jamais livrer de remote stream.
  const hostViewerCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  // Host : ensemble des DataConnection avec les viewers. Sert à la fois
  // au push "live-meta" initial (titre/description) et à la diffusion
  // des messages de chat en temps réel.
  const hostDataConnectionsRef = useRef<Set<DataConnection>>(new Set());
  const allowPageUnloadRef = useRef(true);
  // Viewer : sa DataConnection vers le host courant. Utilisée pour
  // envoyer ses propres messages de chat au host (qui les rediffuse).
  const viewerDataConnRef = useRef<DataConnection | null>(null);
  // Viewer : MediaConnection entrante ouverte par le host courant.
  const viewerMediaCallRef = useRef<MediaConnection | null>(null);
  // Dédoublonnage des messages de chat reçus (un message peut arriver
  // plusieurs fois côté viewer si la connexion est renégociée).
  const chatSeenIdsRef = useRef<Set<string>>(new Set());
  // Abonnés au flux des messages de chat (un seul dans la pratique,
  // la page Live, mais un Set permet de ne pas se soucier du nombre).
  const chatListenersRef = useRef<Set<(msg: ChatMessage) => void>>(new Set());
  // Mêmes patterns pour le canal `gift-event` : dédoublonnage + listeners.
  // Le canal cadeau partage la même DataConnection WebRTC que le chat
  // (pas de pipe séparé) ; ce sont juste des messages avec un autre
  // `type`.
  const giftSeenIdsRef = useRef<Set<string>>(new Set());
  const giftListenersRef = useRef<
    Set<(event: LiveGiftEvent) => void>
  >(new Set());
  const hostViewerPresenceRef = useRef<Map<string, LiveViewerSummary>>(new Map());
  // Rôle courant vis-à-vis de `publishChatMessage` : true si on est
  // host (on broadcast), false si on est viewer (on transmet au host).
  const isHostingChatRef = useRef(false);
  // Garde-fou anti double-clic sur `switchCamera` : `getUserMedia` prend
  // 100-500 ms sur mobile, sans ce verrou deux clics rapides créent deux
  // MediaStream concurrents et la première fuite (tracks jamais
  // `stop()`-ées → caméra/micro restent actifs en tâche de fond).
  const switchingCameraRef = useRef(false);
  // Verrou pour la recuperation silencieuse declenchee par un "ended"
  // (notamment iOS Safari quand l'user retourne son ecran : le track
  // camera est brievement coupe par le navigateur). On evite plusieurs
  // tentatives concurrentes qui creeraient des MediaStream fantomes.
  const silentRecoveryRef = useRef(false);
  const liveStartTokenRef = useRef(0);
  const cameraDeviceIdRef = useRef<string | null>(null);
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
  // Ref miroir sur la liste des utilisateurs connus, utilisée par le
  // host pour recalculer le `highlight` des messages de chat côté
  // serveur (cf. broadcastChatFromHost). On ne peut pas faire confiance
  // au `highlight` envoyé par un viewer : n'importe qui pourrait
  // usurper le badge « reine ». On le re-dérive donc depuis le rôle
  // réel de l'auteur tel que connu localement.
  const usersRef = useRef(users);
  usersRef.current = users;
  const liveRegistryRef = useRef(liveRegistry);
  liveRegistryRef.current = liveRegistry;

  const bumpLiveStartToken = useCallback(() => {
    liveStartTokenRef.current += 1;
    return liveStartTokenRef.current;
  }, []);

  const isLiveStartTokenCurrent = useCallback((token: number) => {
    return liveStartTokenRef.current === token;
  }, []);

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

  const saveLiveMetadata = useCallback(
    async (
      patch: Partial<Pick<LiveConfig, "title" | "description" | "category">>,
    ) => {
      const me = userRef.current;
      const nextTitle =
        patch.title !== undefined ? patch.title : configRef.current.title;
      const nextDescription =
        patch.description !== undefined
          ? patch.description
          : configRef.current.description;
      const nextCategory =
        patch.category !== undefined
          ? normalizeLiveCategory(patch.category)
          : configRef.current.category;

      setConfig((current) => ({
        ...current,
        ...patch,
        category: nextCategory,
      }));

      hostDataConnectionsRef.current.forEach((dataConn) => {
        if (!dataConn.open) return;
        try {
          dataConn.send({
            type: "live-meta",
            title: nextTitle,
            description: nextDescription,
            category: nextCategory,
            mode: configRef.current.mode,
          });
        } catch {
          // ignore
        }
      });

      if (!me || configRef.current.status !== "live") return;

      const now = new Date().toISOString();
      updateRegistry((registry) => {
        const existing = registry[me.id];
        if (!existing) return registry;
        return {
          ...registry,
          [me.id]: {
            ...existing,
            title: nextTitle.trim() || `${me.username} en direct`,
            description: nextDescription.trim(),
            category: nextCategory,
            lastHeartbeat: now,
          },
        };
      });

      const marker = readResumeMarker();
      if (marker && marker.userId === me.id) {
        writeResumeMarker({
          ...marker,
          title: nextTitle,
          description: nextDescription,
          category: nextCategory,
          savedAt: now,
        });
      }

      try {
        await apiLiveHeartbeat({
          title: nextTitle,
          description: nextDescription,
          category: nextCategory,
          mode: configRef.current.mode,
          twitchChannel: configRef.current.twitchChannel,
        });
      } catch (err) {
        console.warn("live metadata sync failed", err);
      }
    },
    [updateRegistry],
  );

  /**
   * Pose / rafraîchit le marker de reprise. Appelé à chaque démarrage de
   * live ET périodiquement via le heartbeat, pour garder `savedAt` frais
   * tant que la diffusion est active. Un refresh / crash laisse donc
   * toujours un marker récent à disposition de la page Live au boot.
   */
  const persistResumeMarker = useCallback(() => {
    const me = userRef.current;
    if (!me) return;
    const c = configRef.current;
    if (c.status !== "live") return;
    const marker: LiveResumeMarker = {
      userId: me.id,
      mode: c.mode,
      facing: cameraFacing,
      title: c.title,
      description: c.description,
      category: c.category,
      twitchChannel: c.twitchChannel,
      savedAt: new Date().toISOString(),
    };
    writeResumeMarker(marker);
    setResumableLive(marker);
  }, [cameraFacing]);

  /** Supprime le marker (fin volontaire de live ou dismiss utilisateur). */
  const dismissResumableLive = useCallback(() => {
    clearResumeMarker();
    setResumableLive(null);
  }, []);

  // Expire le marker de reprise côté state quand son TTL localStorage
  // est dépassé. `readResumeMarker()` applique déjà le TTL à la lecture,
  // mais le state React est lu une fois au mount et conservé ensuite :
  // sans ce tick, un user qui ouvrirait /live puis laisserait l'onglet
  // ouvert > 5 min verrait le bouton "Reprendre" rester affiché à vie
  // (clic silencieusement inopérant) et `imBroadcastingNow` resterait
  // verrouillé sur son user.id, bloquant l'auto-redirect vers un autre
  // live. On re-vérifie donc périodiquement tant qu'on n'est pas soi-
  // même en train de diffuser (le heartbeat rafraîchit déjà savedAt).
  useEffect(() => {
    if (!resumableLive) return;
    if (config.status === "live") return;
    const check = () => {
      const fresh = readResumeMarker();
      if (!fresh) setResumableLive(null);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [resumableLive, config.status]);

  /**
   * Valide et normalise un message de chat reçu par le canal WebRTC.
   * Retourne null si la payload est mal formée (pour se protéger d'un
   * pair malveillant ou d'une version cliente incompatible).
   *
   * `trustHighlight` :
   *  - `false` côté host en réception d'un viewer : on ignore ce que
   *    l'émetteur a mis dans `highlight` (sinon un viewer malveillant
   *    pourrait usurper le badge 👑 reine). Le host recalculera la
   *    bonne valeur dans `broadcastChatFromHost` en résolvant
   *    `authorId` contre la liste des utilisateurs connus.
   *  - `true` côté viewer en réception du host : le host a déjà fait
   *    la validation, son `highlight` est la source de vérité et doit
   *    être conservé sinon le badge reine ne s'affichera jamais chez
   *    les autres viewers.
   */
  const sanitizeIncomingChat = useCallback(
    (payload: unknown, trustHighlight: boolean): ChatMessage | null => {
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as Record<string, unknown>;
      if (p.type !== "chat-message") return null;
      const id = typeof p.id === "string" ? p.id : null;
      const authorId = typeof p.authorId === "string" ? p.authorId : null;
      const authorName = typeof p.authorName === "string" ? p.authorName : null;
      const authorAvatar =
        typeof p.authorAvatar === "string" ? p.authorAvatar : null;
      const content = typeof p.content === "string" ? p.content : null;
      const createdAt =
        typeof p.createdAt === "string"
          ? p.createdAt
          : new Date().toISOString();
      if (!id || !authorId || !authorName || !authorAvatar || !content) {
        return null;
      }
      // Diminutif de grade fourni par l'émetteur (ex. "BRM", "LEG").
      //
      // Même logique de trust que `highlight` : on ne fait confiance à la
      // valeur entrante QUE si elle vient du host (qui est notre source
      // de vérité, il connaît les grades via son propre state et pour
      // lui-même via `/auth/me`). Un message qui arrive d'un viewer vers
      // le host (`trustHighlight=false`) a un `gradeShort` potentiellement
      // trafiqué — un viewer malveillant pourrait envoyer `gradeShort:
      // "LEG"` pour se faire passer pour Légende chez les autres viewers.
      // Côté host on strip donc le champ systématiquement pour les
      // messages non fiables. Si on veut un jour afficher le vrai grade
      // des viewers sur leurs messages, il faudra que le host maintienne
      // un cache `viewerId → grade` alimenté par un appel API (out of
      // scope de ce sanitize).
      let gradeShort: string | null = null;
      if (trustHighlight && typeof p.gradeShort === "string") {
        const raw = p.gradeShort.trim().toUpperCase();
        if (/^[A-Z]{1,4}$/.test(raw)) gradeShort = raw;
      }
      return {
        id,
        authorId,
        authorName,
        authorAvatar,
        content: content.slice(0, 500), // anti-flood / anti-troll-wall-of-text
        createdAt,
        highlight: trustHighlight ? p.highlight === true : false,
        gradeShort,
      };
    },
    [],
  );

  /**
   * Livre un message de chat aux subscribers locaux (la page Live), en
   * évitant les doublons (un même `id` peut arriver plusieurs fois si le
   * DataChannel est renégocié).
   */
  const deliverChatLocally = useCallback((msg: ChatMessage) => {
    if (chatSeenIdsRef.current.has(msg.id)) return;
    chatSeenIdsRef.current.add(msg.id);
    // Borne la mémoire : on ne garde que les 500 derniers ids vus pour
    // le dédoublonnage. Au-delà c'est toujours plus que le buffer UI
    // (CHAT_BUFFER_MAX = 200 côté Live.tsx).
    if (chatSeenIdsRef.current.size > 500) {
      const first = chatSeenIdsRef.current.values().next().value;
      if (first) chatSeenIdsRef.current.delete(first);
    }
    chatListenersRef.current.forEach((h) => {
      try {
        h(msg);
      } catch (err) {
        console.warn("chat listener threw", err);
      }
    });
    if (
      isHostingChatRef.current &&
      configRef.current.status === "live" &&
      userRef.current?.id
    ) {
      publishCrossWindowLiveChat({
        broadcasterId: userRef.current.id,
        message: msg,
      });
    }
  }, []);

  /**
   * Côté host uniquement : diffuse un message de chat à toutes les
   * DataConnection viewer ouvertes, ET le livre localement (pour que
   * le broadcaster voie aussi son propre chat et celui de ses viewers).
   *
   * Le flag `highlight` est recalculé ici à partir du rôle réel de
   * l'auteur (`users[authorId].role === "queen"`). On ignore donc ce
   * que le viewer a pu mettre dans son payload : sans ça, n'importe
   * quel viewer pourrait usurper le badge 👑 reine en mettant
   * `highlight: true` dans son envoi WebRTC.
   */
  const broadcastChatFromHost = useCallback(
    (msg: ChatMessage) => {
      const author = usersRef.current.find((u) => u.id === msg.authorId);
      const highlight = author?.role === "queen";
      const safeMsg: ChatMessage = { ...msg, highlight };
      hostDataConnectionsRef.current.forEach((dc) => {
        if (!dc.open) return;
        try {
          dc.send({ type: "chat-message", ...safeMsg });
        } catch {
          // ignore — la DataConnection a peut-être été fermée entre
          // le test `open` et le send, pas grave.
        }
      });
      deliverChatLocally(safeMsg);
    },
    [deliverChatLocally],
  );

  /**
   * Sanitise un payload `gift-event` reçu du WebRTC. Comme pour le
   * chat, on ne fait jamais confiance aveuglément aux champs envoyés
   * par un viewer — un viewer malveillant pourrait passer un `giftId`
   * qui n'existe pas pour spammer un faux cadeau "mythique" et
   * polluer le top soutien chez tous les autres viewers.
   *
   * On vérifie systématiquement que `giftId` existe dans
   * `GIFT_CATALOGUE`. Sinon on drop le message.
   */
  const sanitizeIncomingGift = useCallback(
    (payload: unknown): LiveGiftEvent | null => {
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as Record<string, unknown>;
      if (p.type !== "gift-event") return null;
      const id = typeof p.id === "string" ? p.id : null;
      const giftId = typeof p.giftId === "string" ? p.giftId : null;
      const senderId = typeof p.senderId === "string" ? p.senderId : null;
      const senderName =
        typeof p.senderName === "string" ? p.senderName.slice(0, 40) : null;
      const senderAvatar =
        typeof p.senderAvatar === "string" ? p.senderAvatar : undefined;
      const createdAt =
        typeof p.createdAt === "string"
          ? p.createdAt
          : new Date().toISOString();
      if (!id || !giftId || !senderId || !senderName) return null;
      if (!GIFT_CATALOGUE.some((g) => g.id === giftId)) return null;
      return {
        id,
        giftId,
        senderId,
        senderName,
        senderAvatar,
        createdAt,
      };
    },
    [],
  );

  /**
   * Livre un événement de cadeau aux subscribers locaux (la page Live),
   * en évitant les doublons (le même `id` peut arriver plusieurs fois
   * si la DataConnection est renégociée).
   */
  const deliverGiftLocally = useCallback((event: LiveGiftEvent) => {
    if (giftSeenIdsRef.current.has(event.id)) return;
    giftSeenIdsRef.current.add(event.id);
    if (giftSeenIdsRef.current.size > 500) {
      const first = giftSeenIdsRef.current.values().next().value;
      if (first) giftSeenIdsRef.current.delete(first);
    }
    giftListenersRef.current.forEach((h) => {
      try {
        h(event);
      } catch (err) {
        console.warn("gift listener threw", err);
      }
    });
  }, []);

  const sanitizeIncomingViewerPresence = useCallback(
    (payload: unknown): LiveViewerSummary | null => {
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as Record<string, unknown>;
      if (p.type !== "viewer-presence") return null;
      const userId = typeof p.userId === "string" ? p.userId : null;
      const username =
        typeof p.username === "string" ? p.username.slice(0, 40) : null;
      const avatar = typeof p.avatar === "string" ? p.avatar : null;
      const joinedAt =
        typeof p.joinedAt === "string" ? p.joinedAt : new Date().toISOString();
      if (!userId || !username || !avatar) return null;
      return { userId, username, avatar, joinedAt };
    },
    [],
  );

  const sanitizeIncomingViewerList = useCallback(
    (payload: unknown): LiveViewerSummary[] | null => {
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as Record<string, unknown>;
      if (p.type !== "viewer-list") return null;
      if (!Array.isArray(p.viewers)) return null;
      const next: LiveViewerSummary[] = [];
      for (const item of p.viewers) {
        if (typeof item !== "object" || item === null) continue;
        const viewer = item as Record<string, unknown>;
        const userId =
          typeof viewer.userId === "string" ? viewer.userId : null;
        const username =
          typeof viewer.username === "string"
            ? viewer.username.slice(0, 40)
            : null;
        const avatar =
          typeof viewer.avatar === "string" ? viewer.avatar : null;
        const joinedAt =
          typeof viewer.joinedAt === "string"
            ? viewer.joinedAt
            : new Date().toISOString();
        if (!userId || !username || !avatar) continue;
        next.push({ userId, username, avatar, joinedAt });
      }
      return next;
    },
    [],
  );
  const syncConnectedViewers = useCallback(() => {
    const deduped = new Map<string, LiveViewerSummary>();
    hostViewerPresenceRef.current.forEach((viewer) => {
      const existing = deduped.get(viewer.userId);
      if (!existing || existing.joinedAt > viewer.joinedAt) {
        deduped.set(viewer.userId, viewer);
      }
    });
    const next = Array.from(deduped.values()).sort((a, b) =>
      a.username.localeCompare(b.username, "fr", { sensitivity: "base" }),
    );
    setConnectedViewers(next);
    hostDataConnectionsRef.current.forEach((dc) => {
      if (!dc.open) return;
      try {
        dc.send({ type: "viewer-list", viewers: next });
      } catch {
        // ignore
      }
    });
  }, []);

  /**
   * Côté host uniquement : diffuse un cadeau à toutes les
   * DataConnection viewer ouvertes ET le livre localement (pour que
   * le streamer voie aussi l'effet des cadeaux qu'il reçoit / envoie
   * lui-même à un autre streamer s'il bascule en visionnage).
   */
  const broadcastGiftFromHost = useCallback(
    (event: LiveGiftEvent) => {
      hostDataConnectionsRef.current.forEach((dc) => {
        if (!dc.open) return;
        try {
          dc.send({ type: "gift-event", ...event });
        } catch {
          // ignore — DataConnection peut-être fermée entre-temps
        }
      });
      deliverGiftLocally(event);
    },
    [deliverGiftLocally],
  );

  const restartOutboundCallForViewer = useCallback((viewerPeerId: string) => {
    const peer = hostPeerRef.current;
    const active = localStreamRef.current;
    if (!peer || !active) return null;
    const previous = hostViewerCallsRef.current.get(viewerPeerId);
    if (previous) {
      try {
        previous.close();
      } catch {
        // ignore
      }
      hostViewerCallsRef.current.delete(viewerPeerId);
      hostConnectionsRef.current.delete(previous);
    }
    const outbound = peer.call(viewerPeerId, active);
    if (!outbound) return null;
    hostViewerCallsRef.current.set(viewerPeerId, outbound);
    hostConnectionsRef.current.add(outbound);
    const release = () => {
      if (hostViewerCallsRef.current.get(viewerPeerId) === outbound) {
        hostViewerCallsRef.current.delete(viewerPeerId);
      }
      hostConnectionsRef.current.delete(outbound);
    };
    outbound.on("close", release);
    outbound.on("error", release);
    return outbound;
  }, []);

  /** Ferme UNIQUEMENT les ressources côté host (peer hôte + stream local). */
  const stopHosting = useCallback((options?: { stopNative?: boolean }) => {
    bumpLiveStartToken();
    switchingCameraRef.current = false;
    if (options?.stopNative) {
      stopNativeScreenShare();
    }
    hostConnectionsRef.current.forEach((call) => {
      try {
        call.close();
      } catch {
        // ignore
      }
    });
    hostConnectionsRef.current.clear();
    hostViewerCallsRef.current.clear();
    hostDataConnectionsRef.current.forEach((dc) => {
      try {
        dc.close();
      } catch {
        // ignore
      }
    });
    hostDataConnectionsRef.current.clear();
    hostViewerPresenceRef.current.clear();
    setConnectedViewers([]);
    isHostingChatRef.current = false;

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
    cameraDeviceIdRef.current = null;
    setLocalStream(null);
    // Si un flux avatar tournait encore (caméra masquée), on le libère.
    if (avatarStreamRef.current) {
      try {
        avatarStreamRef.current.stop();
      } catch {
        // ignore
      }
      avatarStreamRef.current = null;
    }
    setCameraHidden(false);
    cameraHiddenRef.current = false;
  }, [bumpLiveStartToken]);

  /** Ferme UNIQUEMENT les ressources côté viewer (peer + remoteStream). */
  const stopViewing = useCallback(() => {
    if (viewerMediaCallRef.current) {
      try {
        viewerMediaCallRef.current.close();
      } catch {
        // ignore
      }
      viewerMediaCallRef.current = null;
    }
    if (viewerDataConnRef.current) {
      try {
        viewerDataConnRef.current.close();
      } catch {
        // ignore
      }
      viewerDataConnRef.current = null;
    }
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
    stopHosting({ stopNative: false });
    stopViewing();
  }, [stopHosting, stopViewing]);

  const stopLive = useCallback(() => {
    const me = userRef.current;
    allowPageUnloadRef.current = true;
    // IMPORTANT : ne ferme QUE le côté host, pour ne pas casser le stream
    // qu'on est en train de regarder sur un autre user (viewerPeerRef).
    stopHosting({ stopNative: true });
    setConfig((c) => ({ ...c, status: "idle", startedAt: null }));
    // Clic volontaire sur "stopper le live" → plus de reprise possible.
    clearResumeMarker();
    setResumableLive(null);
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

  const pauseLiveForRecovery = useCallback(
    (
      mode: Extract<LiveMode, "screen" | "camera">,
      message = "Le flux a été interrompu. Ton live reste annoncé : relance le partage pour reprendre.",
    ) => {
      const me = userRef.current;
      if (!me) return;
      const now = new Date().toISOString();
      const startedAt = configRef.current.startedAt ?? now;
      stopHosting({ stopNative: false });
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
          title: configRef.current.title.trim() || `${me.username} en direct`,
          description: configRef.current.description.trim(),
          mode,
          category: configRef.current.category,
          twitchChannel: "",
          startedAt,
          lastHeartbeat: now,
        },
      }));
      const marker: LiveResumeMarker = {
        userId: me.id,
        mode,
        facing: cameraFacing,
        title: configRef.current.title,
        description: configRef.current.description,
        category: configRef.current.category,
        twitchChannel: "",
        savedAt: now,
      };
      writeResumeMarker(marker);
      setResumableLive(marker);
      setLastError(message);
    },
    [cameraFacing, stopHosting, updateRegistry],
  );

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
      // Marker de reprise posé immédiatement : un F5 juste après le
      // lancement du live doit proposer la reprise, même si le
      // heartbeat n'a pas encore eu le temps de tourner.
      const marker: LiveResumeMarker = {
        userId: me.id,
        mode: "twitch",
        facing: cameraFacing,
        title: c.title,
        description: c.description,
        category: c.category,
        twitchChannel: channel,
        savedAt: startedAt,
      };
      writeResumeMarker(marker);
      setResumableLive(marker);
    },
    [updateRegistry, cameraFacing],
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
      startToken: number,
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
        if (
          localStreamRef.current !== stream ||
          !isLiveStartTokenCurrent(startToken)
        ) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const peerId = getLivePeerId(me.id);
        const peer = new PeerCtor(peerId, getPeerOptions());
        hostPeerRef.current = peer;
        isHostingChatRef.current = true;
        let peerOpened = false;

        peer.on("open", () => {
          if (!isLiveStartTokenCurrent(startToken)) {
            try {
              peer.destroy();
            } catch {
              // ignore
            }
            return;
          }
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
          // Marker de reprise posé ici : dès que le peer est ouvert,
          // on considère le broadcast comme actif et on persiste
          // l'info pour qu'un éventuel F5 puisse proposer la reprise.
          const marker: LiveResumeMarker = {
            userId: me.id,
            mode,
            facing: cameraFacing,
            title: configRef.current.title,
            description: configRef.current.description,
            category: configRef.current.category,
            twitchChannel: "",
            savedAt: startedAt,
          };
          writeResumeMarker(marker);
          setResumableLive(marker);
        });

        peer.on("error", (err: Error & { type?: string }) => {
          if (!isLiveStartTokenCurrent(startToken)) return;
          if (!peerOpened) {
            const friendly =
              err.type === "unavailable-id"
                ? "Un live Vaelyndra est déjà actif à ton nom ailleurs. Ferme l'autre onglet."
                : `Impossible de démarrer le relais live : ${err.message || err.type || "erreur inconnue"}`;
            pauseLiveForRecovery(mode, friendly);
            return;
          }
          console.warn("PeerJS host error after open", err);
        });

        peer.on("disconnected", () => {
          if (!isLiveStartTokenCurrent(startToken)) return;
          if (peerOpened) {
            setLastError(
              "La connexion au serveur de relais a été perdue. Relance un live quand tu es prêt.",
            );
            try {
              peer.reconnect();
            } catch {
              pauseLiveForRecovery(
                mode,
                "Le relais live a décroché. Ton live reste annoncé : relance le partage pour reprendre.",
              );
            }
          }
        });

        peer.on("call", (incoming) => {
          if (!isLiveStartTokenCurrent(startToken)) {
            try {
              incoming.close();
            } catch {
              // ignore
            }
            return;
          }
          // Un viewer nous appelle — on lui envoie toujours le flux actif
          // (`localStreamRef.current`, pas la capture locale `stream`). Ça
          // garantit qu'un `switchCamera` qui recrée le stream sert la
          // nouvelle source aux nouveaux viewers (les anciens gardent leur
          // track remplacée via `RTCRtpSender.replaceTrack`).
          const active = localStreamRef.current ?? stream;
          // Le `config.iceServers` est propagé par PeerJS depuis
          // `new Peer(..., getPeerOptions())` vers chaque
          // `RTCPeerConnection` créée pour une MediaConnection, donc
          // pas besoin de le redupliquer ici.
          incoming.answer(active);
          hostConnectionsRef.current.add(incoming);
          incoming.on("close", () => {
            hostConnectionsRef.current.delete(incoming);
          });
        });

        peer.on("connection", (dataConn) => {
          if (!isLiveStartTokenCurrent(startToken)) {
            try {
              dataConn.close();
            } catch {
              // ignore
            }
            return;
          }

          // Chaque viewer ouvre une DataConnection vers le host.
          //
          // Deux usages :
          //  1. Le host lui pousse les métas du live (titre, description,
          //     mode) dès l'ouverture.
          //  2. Le host s'en sert comme canal de chat temps réel : il
          //     re-diffuse à tous les viewers les messages qu'il reçoit
          //     (ou qu'il émet lui-même).
          hostDataConnectionsRef.current.add(dataConn);
          dataConn.on("open", () => {
            try {
              dataConn.send({
                type: "live-meta",
                title: configRef.current.title,
                description: configRef.current.description,
                category: configRef.current.category,
                mode,
              });
              dataConn.send({
                type: "viewer-list",
                viewers: connectedViewers,
              });
            } catch {
              // ignore
            }
            restartOutboundCallForViewer(dataConn.peer);
          });
          dataConn.on("data", (payload) => {
            // Réception d'un message de chat venant d'un viewer : on le
            // redistribue à l'ensemble des viewers (y compris
            // l'émetteur, pour qu'il voie son message s'afficher une
            // fois validé par le host), et on le livre localement au
            // chat du host.
            if (
              typeof payload === "object" &&
              payload !== null &&
              (payload as { type?: string }).type === "chat-message"
            ) {
              // Côté host : le message vient d'un viewer non fiable,
              // on IGNORE son `highlight` — c'est `broadcastChatFromHost`
              // qui recalculera la bonne valeur à partir du vrai rôle.
              const msg = sanitizeIncomingChat(payload, false);
              if (msg) broadcastChatFromHost(msg);
            } else if (
              typeof payload === "object" &&
              payload !== null &&
              (payload as { type?: string }).type === "gift-event"
            ) {
              // Côté host : un viewer vient d'envoyer un cadeau, on le
              // re-broadcast à l'ensemble des viewers (y compris
              // l'émetteur, qui dédoublonne par id) pour que tout le
              // monde voie le même effet visuel + son.
              const event = sanitizeIncomingGift(payload);
              if (event) broadcastGiftFromHost(event);
            } else if (
              typeof payload === "object" &&
              payload !== null &&
              (payload as { type?: string }).type === "viewer-presence"
            ) {
              const viewer = sanitizeIncomingViewerPresence(payload);
              if (viewer) {
                hostViewerPresenceRef.current.set(dataConn.peer, viewer);
                syncConnectedViewers();
              }
            }
          });
          dataConn.on("close", () => {
            const outbound = hostViewerCallsRef.current.get(dataConn.peer);
            if (outbound) {
              try {
                outbound.close();
              } catch {
                // ignore
              }
              hostViewerCallsRef.current.delete(dataConn.peer);
              hostConnectionsRef.current.delete(outbound);
            }
            hostDataConnectionsRef.current.delete(dataConn);
            hostViewerPresenceRef.current.delete(dataConn.peer);
            syncConnectedViewers();
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
    [
      pauseLiveForRecovery,
      updateRegistry,
      cameraFacing,
      isLiveStartTokenCurrent,
      restartOutboundCallForViewer,
    ],
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
    const startToken = bumpLiveStartToken();
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== "function"
    ) {
      if (isNativeAndroidApp()) {
        setLastError(
          "Le partage d'écran mobile est désactivé pour cette version Play Store. Utilise le mode caméra pour lancer ton live Android.",
        );
        return;
      }
      // iOS Safari (<= 18) et la plupart des navigateurs Android n'exposent
      // pas `getDisplayMedia`. On le signale explicitement pour que l'UI
      // oriente vers le mode "camera" au lieu d'un échec silencieux.
      setLastError(
        "Ton navigateur ne supporte pas le partage d'écran. Utilise le mode caméra (dispo sur mobile).",
      );
      return;
    }
    let displayStream: MediaStream;
    try {
      displayStream = await captureDisplayStream();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setLastError(
          "Partage d'écran annulé. Si tu es sur Android ou iPhone, utilise le mode caméra quand le navigateur ne prend pas en charge cette fonction.",
        );
      } else if (err instanceof Error) {
        setLastError(`Impossible d'accéder à l'écran : ${err.message}`);
      }
      return;
    }
    if (!isLiveStartTokenCurrent(startToken)) {
      displayStream.getTracks().forEach((track) => track.stop());
      return;
    }

    // On référence IMMÉDIATEMENT le stream dans `localStreamRef` + on pose
    // les listeners "ended" avant toute nouvelle `await`. Raison : la
    // demande de micro ci-dessous ouvre un prompt natif qui peut rester
    // plusieurs secondes à l'écran. Pendant ce temps, si l'utilisateur
    // ferme l'onglet ou déclenche `stopLive()` autrement, la cleanup doit
    // pouvoir retrouver ce stream pour stopper les tracks (sinon l'indicateur
    // navigateur "en train de partager l'écran" reste bloqué sans bouton
    // pour arrêter). Ça bloque aussi un double-clic involontaire sur le
    // bouton "live" via le guard au début de la fonction.
    const stream = displayStream;
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (localStreamRef.current === stream) {
          pauseLiveForRecovery(
            "screen",
            "Le partage d'écran a été interrompu. Ton live reste annoncé : relance le partage pour reprendre.",
          );
        }
      });
    });
    localStreamRef.current = stream;
    setLocalStream(stream);

    // En partage d'écran, `getDisplayMedia` ne capte quasiment jamais le
    // micro du streamer — il propose uniquement l'audio système/onglet et
    // même ça dépend du navigateur. Sans fallback dédié, le flux diffusé
    // aux viewers n'a aucune piste audio → les spectateurs voient l'image
    // mais n'entendent ni le streamer ni les invités audio.
    //
    // On demande donc explicitement le micro via `getUserMedia` et on
    // ajoute la piste au stream principal avant de l'envoyer aux peers.
    // Si l'utilisateur refuse le micro, on laisse le live démarrer sans
    // voix (c'est un choix de son côté).
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // Le stream de référence peut avoir été nettoyé pendant que le prompt
      // micro était ouvert (stopLive, unmount…). Dans ce cas on range
      // proprement les tracks micro qu'on vient d'obtenir.
      if (
        localStreamRef.current !== stream ||
        !isLiveStartTokenCurrent(startToken)
      ) {
        micStream.getTracks().forEach((track) => track.stop());
      } else {
        micStream.getAudioTracks().forEach((track) => {
          stream.addTrack(track);
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setLastError(
          "Micro refusé : les spectateurs ne t'entendront pas. Autorise le micro pour être audible.",
        );
      } else if (err instanceof Error) {
        console.warn("mic fallback pour screen share indisponible", err);
      }
    }

    // Si le stream a été nettoyé pendant la demande micro, on n'attache
    // rien aux peers.
    if (
      localStreamRef.current !== stream ||
      !isLiveStartTokenCurrent(startToken)
    ) {
      return;
    }
    await attachStreamToPeer(stream, "screen", startToken);
  }, [
    attachStreamToPeer,
    pauseLiveForRecovery,
    updateRegistry,
    cameraFacing,
    bumpLiveStartToken,
    isLiveStartTokenCurrent,
  ]);

  /**
   * Recuperation silencieuse de la camera apres un evenement "ended"
   * inattendu. Cas typique : iOS Safari coupe brievement le track camera
   * quand l'user retourne son ecran (changement d'orientation) ou bascule
   * une autre app au premier plan puis revient. Avant cette fonction le
   * live etait force en mode pause/reprise manuelle, ce qui est tres
   * brutal pour un simple flip d'ecran. On tente d'abord de re-acquerir
   * silencieusement la camera (meme facingMode) et de remplacer les
   * tracks sur les viewers en cours via `replaceTrack` — sans nouvelle
   * offre SDP, donc invisible pour les viewers. On ne retombe sur le
   * mode pause/reprise que si la re-acquisition echoue (autorisation
   * revoquee, materiel deconnecte, etc.).
   *
   * Renvoie true si la reprise silencieuse a reussi, false sinon.
   */
  const attemptSilentCameraRecovery = useCallback(async (): Promise<boolean> => {
    const previous = localStreamRef.current;
    if (!previous) return false;
    if (configRef.current.mode !== "camera") return false;
    if (silentRecoveryRef.current) return false;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      return false;
    }
    silentRecoveryRef.current = true;
    let nextStreamRaw: MediaStream | null = null;
    try {
      const facing: CameraFacing = cameraFacing;
      try {
        const videoDevices = await listVideoInputDevices();
        const preferredDevice = videoDevices.find((device) =>
          facing === "environment"
            ? /back|rear|environment|triple|ultra/i.test(device.label)
            : /front|user|facetime/i.test(device.label),
        );
        nextStreamRaw = await navigator.mediaDevices.getUserMedia({
          video: buildCameraConstraints(facing, {
            deviceId: preferredDevice?.deviceId ?? null,
          }),
          // Sur iOS Safari, redemander un track audio briefly volerait le
          // micro a la session en cours. On garde l'audio existant et on
          // ne reacquiert que la video.
          audio: false,
        });
      } catch (err) {
        console.warn("silent camera recovery: getUserMedia failed", err);
        return false;
      }

      // Le live a pu etre arrete (stopLive) pendant le `await`. Si oui on
      // jette le nouveau stream sans rien recoller.
      if (localStreamRef.current !== previous) {
        nextStreamRaw.getTracks().forEach((t) => t.stop());
        return false;
      }

      const newVideoTrack = nextStreamRaw.getVideoTracks()[0];
      if (!newVideoTrack) {
        nextStreamRaw.getTracks().forEach((t) => t.stop());
        return false;
      }

      const previousAudioTrack = previous.getAudioTracks()[0];
      const viewersToRestart = new Set<string>();
      await Promise.all(
        Array.from(hostConnectionsRef.current).map(async (call) => {
          const senders = call.peerConnection?.getSenders() ?? [];
          let replacedVideo = false;
          for (const sender of senders) {
            if (sender.track?.kind === "video") {
              try {
                await sender.replaceTrack(newVideoTrack);
                replacedVideo = true;
              } catch {
                viewersToRestart.add(call.peer);
              }
            }
          }
          if (!replacedVideo && senders.length > 0) {
            viewersToRestart.add(call.peer);
          }
        }),
      );

      const merged = new MediaStream([
        newVideoTrack,
        ...(previousAudioTrack ? [previousAudioTrack] : []),
      ]);

      cameraDeviceIdRef.current =
        newVideoTrack.getSettings().deviceId ?? null;
      localStreamRef.current = merged;
      setLocalStream(merged);

      // Sur la prochaine "ended" inattendue on retentera la meme procedure
      // (avec plusieurs tentatives + attente de la visibilite du document).
      newVideoTrack.addEventListener("ended", () => {
        if (localStreamRef.current !== merged) return;
        void (async () => {
          const recovered = await attemptSilentCameraRecoveryResilient();
          if (!recovered) {
            pauseLiveForRecovery(
              "camera",
              "La caméra a été interrompue. Ton live reste annoncé : relance la caméra pour reprendre.",
            );
          }
        })();
      });

      viewersToRestart.forEach((viewerPeerId) => {
        restartOutboundCallForViewer(viewerPeerId);
      });

      // Stoppe l'ancien track video apres avoir bascule, pour eviter de
      // declencher un "ended" sur l'ancien stream qui re-rentrerait dans
      // ce meme code path.
      previous.getVideoTracks().forEach((track) => track.stop());

      return true;
    } finally {
      // Jette les tracks audio inutilises du nouveau stream brut (on a
      // garde l'audio existant). Sans ca le micro reste alloue cote OS.
      if (nextStreamRaw) {
        nextStreamRaw.getAudioTracks().forEach((track) => track.stop());
      }
      silentRecoveryRef.current = false;
    }
  }, [cameraFacing, pauseLiveForRecovery, restartOutboundCallForViewer]);

  /**
   * Wrapper resilient autour de `attemptSilentCameraRecovery` :
   *
   * - Attend que le document soit visible avant la 1ere tentative
   *   (sur iOS Safari la page passe brievement en hidden pendant une
   *   rotation ou un retour d'arriere-plan, et getUserMedia echoue dans
   *   cet etat).
   * - Boucle jusqu'a 8 tentatives espacees de 500 ms (~4 s au total).
   *   Cela suffit largement a couvrir la duree d'une rotation iOS Safari
   *   ou d'un retour d'arriere-plan, sans coller un spinner visible.
   * - Stoppe immediatement si le live a ete arrete (localStream parti) ou
   *   si une autre recuperation a deja reussi.
   *
   * Objectif fonctionnel : sur iPhone/iPad Safari, un changement
   * d'orientation NE doit PAS faire apparaitre la banniere
   * "Reprendre ton live ?". On reussit la reprise silencieuse meme si
   * elle prend quelques secondes.
   */
  const attemptSilentCameraRecoveryResilient = useCallback(async (): Promise<boolean> => {
    const stillHostingCamera = () =>
      configRef.current.mode === "camera" && !!localStreamRef.current;

    // Attend la visibilite du document (avec timeout safety).
    if (typeof document !== "undefined" && document.hidden) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          document.removeEventListener("visibilitychange", onChange);
          resolve();
        };
        const onChange = () => {
          if (!document.hidden) finish();
        };
        document.addEventListener("visibilitychange", onChange);
        // Filet de securite : meme si la visibilite ne revient pas (cas
        // tres rare), on debloquera la suite apres 3 secondes.
        setTimeout(finish, 3000);
      });
    }

    const MAX_ATTEMPTS = 8;
    const DELAY_MS = 500;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!stillHostingCamera()) return false;
      // Si une track video est encore "live", inutile de tenter (le live
      // a deja recupere via un autre chemin, par ex. un autre listener).
      const currentVideo = localStreamRef.current?.getVideoTracks()[0];
      if (currentVideo && currentVideo.readyState === "live") {
        return true;
      }
      const ok = await attemptSilentCameraRecovery();
      if (ok) return true;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return false;
  }, [attemptSilentCameraRecovery]);

  const startCameraShare = useCallback(
    async (facingMode: CameraFacing = "user") => {
      const me = userRef.current;
      if (!me) {
        setLastError("Connecte-toi pour lancer un live.");
        return;
      }
      if (hostPeerRef.current || localStreamRef.current) return;
      setLastError(null);
      const startToken = bumpLiveStartToken();
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
        const videoDevices = await listVideoInputDevices();
        const preferredDevice = videoDevices.find((device) =>
          facingMode === "environment"
            ? /back|rear|environment|triple|ultra/i.test(device.label)
            : /front|user|facetime/i.test(device.label),
        );
        stream = await navigator.mediaDevices.getUserMedia({
          video: buildCameraConstraints(facingMode, {
            deviceId: preferredDevice?.deviceId ?? null,
          }),
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        setLastError(describeCameraAccessError(err, "start"));
        return;
      }
      if (!isLiveStartTokenCurrent(startToken)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setCameraFacing(facingMode);
      cameraDeviceIdRef.current =
        stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (localStreamRef.current !== stream) return;
          // Cas typique iOS Safari : rotation/orientation, retour
          // d'arriere-plan, etc. On tente d'abord une reprise silencieuse
          // (re-getUserMedia + replaceTrack) avant de degrader vers la
          // banniere "Le flux a ete interrompu" qui force l'user a
          // recliquer pour reprendre.
          void (async () => {
            const recovered = await attemptSilentCameraRecoveryResilient();
            if (!recovered) {
              pauseLiveForRecovery(
                "camera",
                "La caméra a été interrompue. Ton live reste annoncé : relance la caméra pour reprendre.",
              );
            }
          })();
        });
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      await attachStreamToPeer(stream, "camera", startToken);
    },
    [
      attachStreamToPeer,
      pauseLiveForRecovery,
      bumpLiveStartToken,
      isLiveStartTokenCurrent,
      attemptSilentCameraRecoveryResilient,
    ],
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
    let next: MediaStream | null = null;
    try {
      const nextFacing: CameraFacing =
        cameraFacing === "user" ? "environment" : "user";
      try {
        const videoDevices = await listVideoInputDevices();
        const currentDeviceId =
          current.getVideoTracks()[0]?.getSettings().deviceId ??
          cameraDeviceIdRef.current;
        const alternateDevice =
          videoDevices.find((device) => device.deviceId !== currentDeviceId) ??
          null;
        next = await navigator.mediaDevices.getUserMedia({
          video: buildCameraConstraints(nextFacing, {
            deviceId: alternateDevice?.deviceId ?? null,
            preferExactDevice: !isMobileMediaBrowser(),
            allowExactFacing: !isMobileMediaBrowser(),
          }),
          audio: false,
        });
      } catch (err) {
        setLastError(describeCameraAccessError(err, "switch"));
        return;
      }

      // Si le live a été stoppé pendant le `await` (stopLive l'a nettoyé),
      // on jette le nouveau stream au lieu de le raccrocher à un peer mort.
      if (localStreamRef.current !== current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      const newVideoTrack = next.getVideoTracks()[0];
      const currentAudioTrack = current.getAudioTracks()[0];
      if (!newVideoTrack) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }

      // Remplace les tracks sur toutes les MediaConnection viewers en cours.
      // `replaceTrack` est préféré à la renégociation complète : pas de
      // re-offer SDP, pas de coupure visible côté viewers.
      const viewersToRestart = new Set<string>();
      await Promise.all(
        Array.from(hostConnectionsRef.current).map(async (call) => {
          const senders = call.peerConnection?.getSenders() ?? [];
          let replacedVideo = false;
          for (const sender of senders) {
            if (sender.track?.kind === "video") {
              try {
                await sender.replaceTrack(newVideoTrack);
                replacedVideo = true;
              } catch {
                viewersToRestart.add(call.peer);
              }
            } else if (sender.track?.kind === "audio" && currentAudioTrack) {
              try {
                await sender.replaceTrack(currentAudioTrack);
              } catch {
                // on garde l'audio existant si le sender est en cours de fermeture
              }
            }
          }
          if (!replacedVideo && senders.length > 0) {
            viewersToRestart.add(call.peer);
          }
        }),
      );

      const nextStream = new MediaStream([
        newVideoTrack,
        ...current.getAudioTracks(),
      ]);
      viewersToRestart.forEach((viewerPeerId) => {
        restartOutboundCallForViewer(viewerPeerId);
      });
      newVideoTrack.addEventListener("ended", () => {
        if (localStreamRef.current !== nextStream) return;
        void (async () => {
          const recovered = await attemptSilentCameraRecoveryResilient();
          if (!recovered) {
            pauseLiveForRecovery(
              "camera",
              "La caméra a été interrompue. Ton live reste annoncé : relance la caméra pour reprendre.",
            );
          }
        })();
      });
      // Bascule le flux actif AVANT de stopper l'ancienne camera. Sinon le
      // listener `ended` de l'ancienne track croit a une vraie interruption
      // et force a tort le live en mode reprise.
      cameraDeviceIdRef.current = newVideoTrack.getSettings().deviceId ?? null;
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setCameraFacing(nextFacing);
      current.getVideoTracks().forEach((track) => track.stop());
    } finally {
      next?.getAudioTracks().forEach((track) => track.stop());
      switchingCameraRef.current = false;
    }
  }, [
    cameraFacing,
    pauseLiveForRecovery,
    restartOutboundCallForViewer,
    attemptSilentCameraRecoveryResilient,
  ]);

  /**
   * Côté host (mode caméra) : bascule entre caméra ouverte et caméra
   * masquée par l'avatar.
   *
   * - Quand on masque : on stoppe la track caméra OS, on génère un flux
   *   vidéo à partir du canvas avatar (`createLiveAvatarStream`), et on
   *   `replaceTrack` sur tous les viewers. L'audio reste branché.
   * - Quand on ré-affiche : on stoppe le flux canvas et on rouvre la
   *   caméra (`getUserMedia` avec le même facing). Si l'utilisateur a
   *   révoqué l'accès caméra entre temps, on retombe sur la bannière
   *   pause/reprise classique.
   *
   * Côté viewer c'est invisible : pas de re-offer SDP, juste un swap
   * de track. Le live reste annoncé pendant toute l'opération.
   */
  const toggleCameraHidden = useCallback(async (): Promise<void> => {
    if (configRef.current.mode !== "camera") return;
    const current = localStreamRef.current;
    if (!current) return;
    if (switchingCameraHiddenRef.current) return;
    switchingCameraHiddenRef.current = true;

    const swapVideoTrackOnPeers = async (
      newVideoTrack: MediaStreamTrack,
    ): Promise<Set<string>> => {
      const viewersToRestart = new Set<string>();
      await Promise.all(
        Array.from(hostConnectionsRef.current).map(async (call) => {
          const senders = call.peerConnection?.getSenders() ?? [];
          let replaced = false;
          for (const sender of senders) {
            if (sender.track?.kind === "video") {
              try {
                await sender.replaceTrack(newVideoTrack);
                replaced = true;
              } catch {
                viewersToRestart.add(call.peer);
              }
            }
          }
          if (!replaced && senders.length > 0) {
            viewersToRestart.add(call.peer);
          }
        }),
      );
      return viewersToRestart;
    };

    try {
      if (!cameraHiddenRef.current) {
        // === Masquer la caméra → bascule sur l'avatar ===
        const me = userRef.current;
        let avatarHandle: LiveAvatarStreamHandle;
        try {
          avatarHandle = await createLiveAvatarStream({
            avatarUrl: me?.avatar ?? null,
            username: me?.username ?? "Vaelyndra",
          });
        } catch {
          setLastError(
            "Impossible de générer le flux d'avatar pour masquer la caméra.",
          );
          return;
        }
        // Le live a pu être arrêté pendant l'await — on ne touche à rien.
        if (localStreamRef.current !== current) {
          avatarHandle.stop();
          return;
        }
        const avatarVideoTrack = avatarHandle.stream.getVideoTracks()[0];
        if (!avatarVideoTrack) {
          avatarHandle.stop();
          return;
        }
        const viewersToRestart = await swapVideoTrackOnPeers(avatarVideoTrack);
        // Si le live a été stoppé pendant la swap, on jette tout.
        if (localStreamRef.current !== current) {
          avatarHandle.stop();
          return;
        }
        const nextStream = new MediaStream([
          avatarVideoTrack,
          ...current.getAudioTracks(),
        ]);
        viewersToRestart.forEach((viewerPeerId) => {
          restartOutboundCallForViewer(viewerPeerId);
        });
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        avatarStreamRef.current = avatarHandle;
        setCameraHidden(true);
        cameraHiddenRef.current = true;
        // On stoppe la vraie track caméra : libère la LED + permet à iOS
        // Safari de ne pas montrer l'indicateur "caméra utilisée".
        current.getVideoTracks().forEach((track) => track.stop());
      } else {
        // === Ré-afficher la caméra → re-getUserMedia ===
        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
          return;
        }
        let next: MediaStream;
        try {
          next = await navigator.mediaDevices.getUserMedia({
            video: buildCameraConstraints(cameraFacing, {
              deviceId: cameraDeviceIdRef.current,
              preferExactDevice: !isMobileMediaBrowser(),
              allowExactFacing: !isMobileMediaBrowser(),
            }),
            audio: false,
          });
        } catch (err) {
          setLastError(describeCameraAccessError(err, "start"));
          return;
        }
        // Live arrêté pendant l'await → on jette tout.
        if (localStreamRef.current !== current) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        const newVideoTrack = next.getVideoTracks()[0];
        if (!newVideoTrack) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        const viewersToRestart = await swapVideoTrackOnPeers(newVideoTrack);
        if (localStreamRef.current !== current) {
          newVideoTrack.stop();
          return;
        }
        const nextStream = new MediaStream([
          newVideoTrack,
          ...current.getAudioTracks(),
        ]);
        viewersToRestart.forEach((viewerPeerId) => {
          restartOutboundCallForViewer(viewerPeerId);
        });
        // Listener `ended` standard : si la nouvelle caméra est coupée
        // inopinément, on tente la reprise silencieuse résiliente.
        newVideoTrack.addEventListener("ended", () => {
          if (localStreamRef.current !== nextStream) return;
          if (cameraHiddenRef.current) return;
          void (async () => {
            const recovered = await attemptSilentCameraRecoveryResilient();
            if (!recovered) {
              pauseLiveForRecovery(
                "camera",
                "La caméra a été interrompue. Ton live reste annoncé : relance la caméra pour reprendre.",
              );
            }
          })();
        });
        cameraDeviceIdRef.current =
          newVideoTrack.getSettings().deviceId ?? cameraDeviceIdRef.current;
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
        // Coupe le canvas avatar.
        if (avatarStreamRef.current) {
          try {
            avatarStreamRef.current.stop();
          } catch {
            // ignore
          }
          avatarStreamRef.current = null;
        }
        setCameraHidden(false);
        cameraHiddenRef.current = false;
      }
    } finally {
      switchingCameraHiddenRef.current = false;
    }
  }, [
    cameraFacing,
    pauseLiveForRecovery,
    restartOutboundCallForViewer,
    attemptSilentCameraRecoveryResilient,
  ]);

  /**
   * Côté viewer : tente activement de rejoindre le live d'un broadcaster
   * donné. Idempotent : si un viewerPeer existe déjà ou si on est le host
   * du broadcasterId ciblé, on ne refait rien.
   */
  const joinAsViewer = useCallback(
    (broadcasterId: string) => {
      if (!broadcasterId) return () => {};
      // Déjà hôte de ce broadcast : on regarde notre propre flux.
      if (hostPeerRef.current && userRef.current?.id === broadcasterId)
        return () => {};
      // Déjà en train de se connecter / connecté.
      if (viewerPeerRef.current) return () => {};

      if (liveRegistryRef.current[broadcasterId]?.mode === "android-screen") {
        let cancelled = false;
        let pollId: number | null = null;
        const pc = new RTCPeerConnection({
          iceServers: getIceServers(),
          iceTransportPolicy: "all",
        });
        const remote = new MediaStream();
        const pendingIce: NativeIceCandidate[] = [];
        const appliedBroadcasterIce = new Set<string>();
        const remoteTrackIds = new Set<string>();
        let sessionId: string | null = null;
        let lastViewerHeartbeatAt = 0;

        setIsConnecting(true);
        setLastError(null);

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            if (remoteTrackIds.has(track.id)) return;
            remoteTrackIds.add(track.id);
            remote.addTrack(track);
          });
          if (!cancelled) {
            setRemoteStream(remote);
            setIsConnecting(false);
          }
        };
        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          if (pc.connectionState === "connected") {
            setIsConnecting(false);
            return;
          }
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "closed"
          ) {
            setRemoteStream(null);
            setIsConnecting(false);
          }
        };
        pc.onicecandidate = (event) => {
          if (!event.candidate) return;
          const candidate = toNativeIceCandidate(event.candidate);
          if (!candidate.candidate) return;
          if (!sessionId) {
            pendingIce.push(candidate);
            return;
          }
          apiAddNativeViewerIce({ sessionId, candidate }).catch(() => {});
        };

        (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (!offer.sdp || cancelled) return;
            const signal = await apiCreateNativeLiveOffer({
              broadcasterId,
              offerSdp: offer.sdp,
            });
            sessionId = signal.session_id;
            for (const candidate of pendingIce.splice(0)) {
              await apiAddNativeViewerIce({ sessionId, candidate }).catch(
                () => {},
              );
            }
            pollId = window.setInterval(() => {
              if (!sessionId || cancelled) return;
              const now = Date.now();
              if (now - lastViewerHeartbeatAt > 10_000) {
                apiHeartbeatNativeViewer(sessionId)
                  .then(() => {
                    lastViewerHeartbeatAt = now;
                  })
                  .catch(() => {});
              }
              apiGetNativeLiveOffer(sessionId)
                .then(async (latest) => {
                  if (latest.answer_sdp && !pc.currentRemoteDescription) {
                    await pc.setRemoteDescription({
                      type: "answer",
                      sdp: latest.answer_sdp,
                    });
                  }
                  for (const candidate of latest.broadcaster_ice) {
                    if (!candidate.candidate) continue;
                    const key = `${candidate.sdpMid ?? ""}:${candidate.sdpMLineIndex ?? ""}:${candidate.candidate}`;
                    if (appliedBroadcasterIce.has(key)) continue;
                    appliedBroadcasterIce.add(key);
                    await pc.addIceCandidate(candidate).catch(() => {});
                  }
                })
                .catch(() => {});
            }, 1500);
          } catch (err) {
            if (!cancelled) {
              setIsConnecting(false);
              setLastError(
                `Impossible de rejoindre le live Android : ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }
        })();

        return () => {
          cancelled = true;
          if (pollId !== null) window.clearInterval(pollId);
          pc.close();
          remote.getTracks().forEach((track) => track.stop());
          setRemoteStream(null);
          setIsConnecting(false);
          setViewingMeta(null);
        };
      }

      let cancelled = false;
      setIsConnecting(true);
      setLastError(null);

      (async () => {
        try {
          const { default: PeerCtor } = await import("peerjs");
          if (cancelled) return;
          // Sans id → PeerJS génère un id via son broker. PeerJS expose
          // deux signatures (`new Peer(options)` et `new Peer(id,
          // options?)`) ; seule la version nommée est typée publiquement,
          // donc on passe par un cast léger pour garder la version
          // anonyme utilisée ici.
          const viewerPeer = new (PeerCtor as unknown as {
            new (options: ReturnType<typeof getPeerOptions>): Peer;
          })(getPeerOptions());
          viewerPeerRef.current = viewerPeer;

          viewerPeer.on("call", (call) => {
            if (cancelled) {
              try {
                call.close();
              } catch {
                // ignore
              }
              return;
            }
            if (
              viewerMediaCallRef.current &&
              viewerMediaCallRef.current !== call
            ) {
              try {
                viewerMediaCallRef.current.close();
              } catch {
                // ignore
              }
            }
            viewerMediaCallRef.current = call;
            call.on("stream", (stream) => {
              if (cancelled) return;
              setRemoteStream(stream);
              setIsConnecting(false);
            });
            call.on("close", () => {
              if (viewerMediaCallRef.current === call) {
                viewerMediaCallRef.current = null;
              }
              if (cancelled) return;
              setRemoteStream(null);
            });
            call.on("error", () => {
              if (viewerMediaCallRef.current === call) {
                viewerMediaCallRef.current = null;
              }
              if (cancelled) return;
              setRemoteStream(null);
              setIsConnecting(false);
            });
            try {
              // Réponse receive-only : l'offre provient désormais du host, qui
              // porte déjà les m-lines audio/vidéo réelles. Répondre avec un
              // stream local vide reste valide sans forcer le viewer à partager
              // micro/caméra, et évite l'offre initiale vide qui cassait la
              // négociation sur certains browsers.
              call.answer(new MediaStream());
            } catch {
              setIsConnecting(false);
            }
          });

          viewerPeer.on("open", () => {
            if (cancelled) return;
            const targetPeerId = getLivePeerId(broadcasterId);
            // DataConnection bidirectionnelle avec le host :
            //  - réception : métadonnées du live + messages de chat
            //    redistribués par le host.
            //  - émission : messages de chat tapés par ce viewer (le host
            //    les re-diffuse à tous les autres viewers).
            const data = viewerPeer.connect(targetPeerId);
            viewerDataConnRef.current = data;
            // On ne touche volontairement PAS à `isHostingChatRef` ici :
            // le flag appartient au cycle de vie "hosting" (set à `true`
            // dans `attachStreamToPeer` quand on commence à broadcaster,
            // `false` dans `stopHosting` quand on arrête). Si un broadcaster
            // actif va regarder un autre live (navigation vers
            // `/live/@someone`), il RESTE hôte de son propre live — flipper
            // le ref ici déviait son `publishChatMessage` vers la
            // DataConnection du host visité (ses viewers ne voyaient plus
            // ses messages, et au retour sur sa propre page le flag
            // restait faussement à false → chat silencieusement cassé
            // pour le reste de la session).
            data.on("open", () => {
              const me = userRef.current;
              if (!me) return;
              try {
                data.send({
                  type: "viewer-presence",
                  userId: me.id,
                  username: me.username,
                  avatar: me.avatar,
                  joinedAt: new Date().toISOString(),
                });
              } catch {
                // ignore
              }
            });
            data.on("data", (payload) => {
              if (cancelled) return;
              if (typeof payload !== "object" || payload === null) return;
              const type = (payload as { type?: string }).type;
              if (type === "live-meta") {
                const meta = payload as {
                  title?: string;
                  description?: string;
                  category?: string;
                  mode?: LiveMode;
                };
                setViewingMeta({
                  title: typeof meta.title === "string" ? meta.title : "",
                  description:
                    typeof meta.description === "string"
                      ? meta.description
                      : "",
                  category: normalizeLiveCategory(meta.category),
                  mode:
                    meta.mode === "twitch" ||
                    meta.mode === "screen" ||
                    meta.mode === "camera" ||
                    meta.mode === "android-screen"
                      ? meta.mode
                      : "screen",
                });
              } else if (type === "chat-message") {
                // Côté viewer : le message vient du host, qui a déjà
                // validé et recalculé `highlight` (cf. broadcastChat
                // FromHost). On fait confiance à sa valeur, sans quoi
                // le badge 👑 reine ne s'affichera jamais chez les
                // autres viewers.
                const msg = sanitizeIncomingChat(payload, true);
                if (msg) deliverChatLocally(msg);
              } else if (type === "gift-event") {
                // Côté viewer : un cadeau a été envoyé sur le live
                // (par n'importe quel viewer ou par le streamer
                // lui-même). Le host a déjà validé l'event.
                const event = sanitizeIncomingGift(payload);
                if (event) deliverGiftLocally(event);
              } else if (type === "viewer-list") {
                const next = sanitizeIncomingViewerList(payload);
                if (next) setConnectedViewers(next);
              }
            });
            data.on("close", () => {
              if (viewerDataConnRef.current === data) {
                viewerDataConnRef.current = null;
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
        if (viewerDataConnRef.current) {
          try {
            viewerDataConnRef.current.close();
          } catch {
            // ignore
          }
          viewerDataConnRef.current = null;
        }
        if (viewerMediaCallRef.current) {
          try {
            viewerMediaCallRef.current.close();
          } catch {
            // ignore
          }
          viewerMediaCallRef.current = null;
        }
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
    },
    [deliverChatLocally, sanitizeIncomingChat],
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On empêche désormais le refresh / la fermeture involontaires tant que
  // le live est actif. Sans ce garde-fou navigateur, certains contextes
  // mobile/desktop peuvent déclencher un reload non désiré et forcer une
  // reprise du live. Ici, seul un arrêt volontaire du live ré-autorise
  // l'unload silencieux de la page.
  useEffect(() => {
    allowPageUnloadRef.current = config.status !== "live";
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowPageUnloadRef.current) return undefined;
      if (configRef.current.status !== "live") return undefined;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [config.status]);

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
    persistResumeMarker();
    const id = setInterval(() => {
      tickLocal();
      tickServer();
      // Rafraîchit `savedAt` du marker de reprise — tant qu'on diffuse,
      // le marker reste "jeune" et la reprise post-F5 reste proposée.
      persistResumeMarker();
    }, 30_000);
    return () => clearInterval(id);
  }, [config.status, persistResumeMarker]);

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
        const localHostIsLive = !!me && configRef.current.status === "live";
        setLiveRegistry((prev) => {
          const next: Record<string, LiveRegistryEntry> = {};
          // 1. Toutes les entrées serveur (tous broadcasters).
          for (const s of remote) {
            // Si CE tab diffuse vraiment, son entrée locale reste prioritaire.
            // Sinon, on garde aussi mon entrée serveur pour le hub public et
            // les retours post-refresh.
            if (localHostIsLive && me && s.broadcaster_id === me.id) continue;
            next[s.broadcaster_id] = remoteToRegistry(s);
          }
          // 1b. Si un live Android disparaît brièvement de `/live` pendant
          // un trou réseau mobile, on garde l'entrée locale jusqu'au TTL
          // heartbeat. Sans cette grâce, les viewers voient "connexion",
          // puis retour du live, puis re-connexion en boucle.
          const now = Date.now();
          for (const [id, entry] of Object.entries(prev)) {
            if (next[id] || entry.mode !== "android-screen") continue;
            const heartbeat = entry.lastHeartbeat ?? entry.startedAt;
            const heartbeatAt = new Date(heartbeat).getTime();
            if (!Number.isFinite(heartbeatAt)) continue;
            if (now - heartbeatAt <= REGISTRY_STALE_MS) {
              next[id] = entry;
            }
          }
          // 2. Ma propre entrée conservée uniquement si je suis EFFECTIVEMENT
          //    en live sur CE tab. Sans cette garde, un rafraîchissement
          //    de la page broadcaster laissait son ancienne entrée
          //    persister dans le registre local (status=idle au mount →
          //    plus de heartbeat → plus de refresh serveur → le serveur
          //    la purge à 90 s, mais ce bloc la ré-injectait à chaque
          //    poll depuis `prev`, la figeant pour toujours côté tab).
          if (localHostIsLive && me && prev[me.id]) {
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
    const id = setInterval(sync, 5_000);
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

  /**
   * Publie un message de chat sur le live courant.
   *
   * Si on est host, on broadcast directement à tous les viewers
   * connectés via leurs DataConnection, puis on livre localement.
   *
   * Si on est viewer, on envoie au host via la DataConnection ouverte
   * par `joinAsViewer`. Le host le rediffusera à tout le monde (y
   * compris nous-même), c'est ce retour qui alimente le chat local —
   * garantit que tout le monde voit les mêmes messages dans le même
   * ordre (ordre d'arrivée chez le host).
   */
  const publishChatMessage = useCallback(
    (msg: ChatMessage) => {
      if (isHostingChatRef.current) {
        broadcastChatFromHost(msg);
        return;
      }
      const dc = viewerDataConnRef.current;
      if (dc && dc.open) {
        try {
          dc.send({ type: "chat-message", ...msg });
        } catch {
          // ignore — la connexion a peut-être été coupée.
        }
        // Écho optimiste local : on affiche tout de suite au sender
        // pour qu'il voie son message partir, sans attendre la
        // rediffusion du host. La dédup par id empêchera le doublon
        // quand le host renverra le même message.
        deliverChatLocally(msg);
      } else {
        // Pas de connexion host ouverte (Twitch, offline, host
        // injoignable) : on tombe en mode purement local — l'émetteur
        // voit son message, les autres non. C'est aussi le
        // comportement attendu quand le mode est `twitch` (pas de
        // peer WebRTC à joindre).
        deliverChatLocally(msg);
      }
    },
    [broadcastChatFromHost, deliverChatLocally],
  );

  const subscribeChatMessages = useCallback(
    (handler: (msg: ChatMessage) => void) => {
      chatListenersRef.current.add(handler);
      return () => {
        chatListenersRef.current.delete(handler);
      };
    },
    [],
  );

  /**
   * Publie un événement de cadeau sur le live courant. Mêmes règles
   * de transport que `publishChatMessage` :
   *   - host : broadcast direct + livraison locale.
   *   - viewer : envoi au host (qui rediffuse) + écho local optimiste.
   *   - mode Twitch / pas de DataConnection : livraison locale uniquement
   *     (l'effet est visible chez l'émetteur, pas chez les autres).
   */
  const publishGiftEvent = useCallback(
    (event: LiveGiftEvent) => {
      if (isHostingChatRef.current) {
        broadcastGiftFromHost(event);
        return;
      }
      const dc = viewerDataConnRef.current;
      if (dc && dc.open) {
        try {
          dc.send({ type: "gift-event", ...event });
        } catch {
          // ignore — la connexion a peut-être été coupée.
        }
        deliverGiftLocally(event);
      } else {
        deliverGiftLocally(event);
      }
    },
    [broadcastGiftFromHost, deliverGiftLocally],
  );

  const subscribeGiftEvents = useCallback(
    (handler: (event: LiveGiftEvent) => void) => {
      giftListenersRef.current.add(handler);
      return () => {
        giftListenersRef.current.delete(handler);
      };
    },
    [],
  );

  /**
   * Reprend un live post-refresh : réinjecte la config (titre,
   * description, catégorie, chaîne Twitch, mode) dans le state et
   * relance la bonne source (Twitch announce, partage d'écran, ou
   * caméra avec le bon `facingMode`). Le navigateur re-prompte pour
   * la caméra / l'écran (c'est obligatoire côté sécurité WebRTC).
   */
  const resumeLive = useCallback(async () => {
    const me = userRef.current;
    if (!me) {
      setLastError("Connecte-toi pour reprendre ton live.");
      return;
    }
    const marker = readResumeMarker();
    if (!marker || marker.userId !== me.id) {
      setResumableLive(null);
      return;
    }
    setLastError(null);
    // Restaure la config avant de relancer le stream, pour que
    // announceTwitchLive / attachStreamToPeer retrouvent les bons
    // champs (titre, description, catégorie…).
    setConfig((c) => ({
      ...c,
      mode: marker.mode,
      title: marker.title,
      description: marker.description,
      category: marker.category,
      twitchChannel: marker.twitchChannel,
    }));
    if (marker.mode === "twitch") {
      announceTwitchLive(marker.twitchChannel);
      return;
    }
    if (marker.mode === "screen") {
      await startScreenShare();
      return;
    }
    if (marker.mode === "android-screen") {
      setConfig((c) => ({
        ...c,
        mode: "camera",
      }));
      setResumableLive({
        ...marker,
        mode: "camera",
      });
      setLastError(
        "Le partage d'écran mobile reste désactivé pour cette version. Vaelyndra repasse sur la caméra pour garder ton live stable.",
      );
      setCameraFacing(marker.facing);
      await startCameraShare(marker.facing);
      return;
    }
    // camera
    setCameraFacing(marker.facing);
    await startCameraShare(marker.facing);
  }, [announceTwitchLive, startScreenShare, startCameraShare, updateRegistry]);

  const value = useMemo<LiveCtx>(
    () => ({
      config,
      updateConfig,
      saveLiveMetadata,
      liveRegistry,
      announceTwitchLive,
      startScreenShare,
      startCameraShare,
      switchCamera,
      cameraFacing,
      cameraHidden,
      toggleCameraHidden,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
      viewingMeta,
      publishChatMessage,
      subscribeChatMessages,
      publishGiftEvent,
      subscribeGiftEvents,
      resumableLive,
      resumeLive,
      dismissResumableLive,
      connectedViewers,
    }),
    [
      config,
      updateConfig,
      saveLiveMetadata,
      liveRegistry,
      announceTwitchLive,
      startScreenShare,
      startCameraShare,
      switchCamera,
      cameraFacing,
      cameraHidden,
      toggleCameraHidden,
      stopLive,
      joinAsViewer,
      remoteStream,
      localStream,
      isConnecting,
      lastError,
      viewingMeta,
      publishChatMessage,
      subscribeChatMessages,
      publishGiftEvent,
      subscribeGiftEvents,
      resumableLive,
      resumeLive,
      dismissResumableLive,
      connectedViewers,
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
