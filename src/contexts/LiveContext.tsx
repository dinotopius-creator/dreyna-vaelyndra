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
import { getPeerOptions } from "../lib/peerConfig";
import type { ChatMessage } from "../types";
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
      parsed.mode === "twitch" || parsed.mode === "camera" ? parsed.mode : "screen";
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
  const [viewingMeta, setViewingMeta] = useState<
    { title: string; description: string; mode: LiveMode } | null
  >(null);
  // Marker de reprise de live (post-refresh). Initialisé à partir de
  // localStorage : si un user a broadcasté il y a < 5 min et refreshé,
  // on récupère l'info pour lui proposer `resumeLive()`.
  const [resumableLive, setResumableLive] = useState<LiveResumeMarker | null>(
    () => readResumeMarker(),
  );

  const hostPeerRef = useRef<Peer | null>(null);
  const viewerPeerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<Set<MediaConnection>>(new Set());
  // Host : ensemble des DataConnection avec les viewers. Sert à la fois
  // au push "live-meta" initial (titre/description) et à la diffusion
  // des messages de chat en temps réel.
  const hostDataConnectionsRef = useRef<Set<DataConnection>>(new Set());
  // Viewer : sa DataConnection vers le host courant. Utilisée pour
  // envoyer ses propres messages de chat au host (qui les rediffuse).
  const viewerDataConnRef = useRef<DataConnection | null>(null);
  // Dédoublonnage des messages de chat reçus (un message peut arriver
  // plusieurs fois côté viewer si la connexion est renégociée).
  const chatSeenIdsRef = useRef<Set<string>>(new Set());
  // Abonnés au flux des messages de chat (un seul dans la pratique,
  // la page Live, mais un Set permet de ne pas se soucier du nombre).
  const chatListenersRef = useRef<Set<(msg: ChatMessage) => void>>(new Set());
  // Rôle courant vis-à-vis de `publishChatMessage` : true si on est
  // host (on broadcast), false si on est viewer (on transmet au host).
  const isHostingChatRef = useRef(false);
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
  // Ref miroir sur la liste des utilisateurs connus, utilisée par le
  // host pour recalculer le `highlight` des messages de chat côté
  // serveur (cf. broadcastChatFromHost). On ne peut pas faire confiance
  // au `highlight` envoyé par un viewer : n'importe qui pourrait
  // usurper le badge « reine ». On le re-dérive donc depuis le rôle
  // réel de l'auteur tel que connu localement.
  const usersRef = useRef(users);
  usersRef.current = users;

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
        typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
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
    hostDataConnectionsRef.current.forEach((dc) => {
      try {
        dc.close();
      } catch {
        // ignore
      }
    });
    hostDataConnectionsRef.current.clear();
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
    setLocalStream(null);
  }, []);

  /** Ferme UNIQUEMENT les ressources côté viewer (peer + remoteStream). */
  const stopViewing = useCallback(() => {
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
    stopHosting();
    stopViewing();
  }, [stopHosting, stopViewing]);

  const stopLive = useCallback(() => {
    const me = userRef.current;
    // IMPORTANT : ne ferme QUE le côté host, pour ne pas casser le stream
    // qu'on est en train de regarder sur un autre user (viewerPeerRef).
    stopHosting();
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
        const peer = new PeerCtor(peerId, getPeerOptions());
        hostPeerRef.current = peer;
        isHostingChatRef.current = true;
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
                mode,
              });
            } catch {
              // ignore
            }
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
            }
          });
          dataConn.on("close", () => {
            hostDataConnectionsRef.current.delete(dataConn);
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
    [stopLive, updateRegistry, cameraFacing],
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
        // `audio: true` tente de capter le son du système/onglet. Dans les
        // faits, Chrome Windows est le seul navigateur qui le fait vraiment
        // (et uniquement sur "l'onglet" ou "la fenêtre" pas "tout l'écran").
        // Safari / Firefox / Chrome mac&linux l'ignorent silencieusement →
        // la piste système peut manquer, mais on veut au moins le micro,
        // donc on capture le micro séparément juste après.
        audio: true,
      });
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setLastError(`Impossible d'accéder à l'écran : ${err.message}`);
      }
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
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (localStreamRef.current === stream) stopLive();
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
      if (localStreamRef.current !== stream) {
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
    if (localStreamRef.current !== stream) return;
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
        // Sans id → PeerJS génère un id via son broker. PeerJS expose
        // deux signatures (`new Peer(options)` et `new Peer(id,
        // options?)`) ; seule la version nommée est typée publiquement,
        // donc on passe par un cast léger pour garder la version
        // anonyme utilisée ici.
        const viewerPeer = new (PeerCtor as unknown as {
          new (options: ReturnType<typeof getPeerOptions>): Peer;
        })(getPeerOptions());
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
          data.on("data", (payload) => {
            if (cancelled) return;
            if (typeof payload !== "object" || payload === null) return;
            const type = (payload as { type?: string }).type;
            if (type === "live-meta") {
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
            } else if (type === "chat-message") {
              // Côté viewer : le message vient du host, qui a déjà
              // validé et recalculé `highlight` (cf. broadcastChat
              // FromHost). On fait confiance à sa valeur, sans quoi
              // le badge 👑 reine ne s'affichera jamais chez les
              // autres viewers.
              const msg = sanitizeIncomingChat(payload, true);
              if (msg) deliverChatLocally(msg);
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
          // 2. Ma propre entrée conservée uniquement si je suis EFFECTIVEMENT
          //    en live sur CE tab. Sans cette garde, un rafraîchissement
          //    de la page broadcaster laissait son ancienne entrée
          //    persister dans le registre local (status=idle au mount →
          //    plus de heartbeat → plus de refresh serveur → le serveur
          //    la purge à 90 s, mais ce bloc la ré-injectait à chaque
          //    poll depuis `prev`, la figeant pour toujours côté tab).
          if (
            me &&
            prev[me.id] &&
            configRef.current.status === "live"
          ) {
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
    // camera
    setCameraFacing(marker.facing);
    await startCameraShare(marker.facing);
  }, [announceTwitchLive, startScreenShare, startCameraShare]);

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
      publishChatMessage,
      subscribeChatMessages,
      resumableLive,
      resumeLive,
      dismissResumableLive,
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
      publishChatMessage,
      subscribeChatMessages,
      resumableLive,
      resumeLive,
      dismissResumableLive,
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
