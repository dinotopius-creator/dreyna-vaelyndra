import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  Users,
  Play,
  Archive,
  Heart,
  Monitor,
  Gamepad2,
  StopCircle,
  Copy,
  Eye,
  EyeOff,
  Video,
  Camera,
  RefreshCw,
  Maximize,
  Minimize,
  MessageSquare,
  MessageSquareOff,
  SkipForward,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  LIVE_DESCRIPTION_MAX,
  LIVE_TITLE_MAX,
  useLive,
} from "../contexts/LiveContext";
import { useLiveInvites } from "../contexts/LiveInvitesContext";
import { LIVE_CATEGORIES, getLiveCategory } from "../data/liveCategories";
import { SectionHeading } from "../components/SectionHeading";
import { GiftPanel } from "../components/GiftPanel";
import { GiftFlight } from "../components/GiftFlight";
import { LiveAvatarOverlay } from "../components/LiveAvatarOverlay";
import { LiveChatHistory } from "../components/LiveChatHistory";
import { LiveChatOverlay } from "../components/LiveChatOverlay";
import { LiveHeartsOverlay } from "../components/LiveHeartsOverlay";
import { LiveLeaderboardOverlay } from "../components/LiveLeaderboardOverlay";
import type { TributeEntry } from "../components/LiveLeaderboardOverlay";
import { LiveInvitePanel } from "../components/LiveInvitePanel";
import { LiveGuestsStrip } from "../components/LiveGuestsStrip";
import { OtherLivesStrip } from "../components/OtherLivesStrip";
import { ReportButton } from "../components/ReportButton";
import {
  SortDAppelCaster,
  SORT_LEVELS,
  type SortLevel,
} from "../components/SortDAppelCaster";
import {
  AUTO_CHAT_LINES,
  SEED_CHAT,
} from "../data/mock";
import type { ChatMessage, Gift, User } from "../types";
import { generateId } from "../lib/helpers";
import {
  apiModerateLive,
  apiMyModerationState,
  type LiveModerationAction,
} from "../lib/liveApi";
import { apiGetProfile } from "../lib/api";
import { gradeBySlug } from "../data/grades";
import {
  getBotCadence,
  getViewerScale,
  nextViewerValue,
  pickInitialViewers,
  pickNextBotDelay,
} from "../lib/liveScaling";

const BOT_AUTHORS = [
  { id: "user-lyria", name: "Lyria", avatar: "https://i.pravatar.cc/150?u=lyria" },
  { id: "user-caelum", name: "Caelum", avatar: "https://i.pravatar.cc/150?u=caelum" },
  { id: "user-aeris", name: "Aëris", avatar: "https://i.pravatar.cc/150?u=aeris" },
  { id: "user-sylas", name: "Sylas", avatar: "https://i.pravatar.cc/150?u=sylas" },
  { id: "user-mira", name: "Mira", avatar: "https://i.pravatar.cc/150?u=mira" },
  { id: "user-thalia", name: "Thalia", avatar: "https://i.pravatar.cc/150?u=thalia" },
];

/** Pseudo-utilisateur "Sort d'appel" pour les annonces système du chat. */
const SYSTEM_AUTHOR = {
  id: "system-herald",
  name: "Héraut de la cour",
  avatar: "/crown.svg",
};

/**
 * Taille maximale du buffer de messages du chat — partagée entre
 * `sendMessage`, `pushSystemAnnouncement` et le générateur de bots
 * automatiques pour que le panneau d'historique puisse vraiment
 * remonter aussi loin (PR P). Sans ce partage, un message système
 * tronquait immédiatement le buffer à une valeur plus petite.
 */
const CHAT_BUFFER_MAX = 200;

/**
 * Formate une durée en secondes → "2 min", "1 h", "45 s" selon la taille.
 * Utilisé par les notifications de modération (mute/kick).
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

function extractTwitchChannel(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  const m = v.match(/twitch\.tv\/([A-Za-z0-9_]{3,})/i);
  if (m) return m[1];
  return v.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
}

function LiveVideoStage({
  isHost,
  localStream,
  remoteStream,
}: {
  isHost: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = isHost ? localStream : remoteStream;
  // iOS Safari et Chrome mobile bloquent `autoplay` avec son tant que
  // l'user n'a pas cliqué dans la page courante. `<video>.play()` rejette
  // avec `NotAllowedError`. Pour ne pas laisser le viewer avec un écran
  // figé + zéro son, on détecte ce cas et on superpose un bouton "Activer
  // le son" qui lance un `play()` sous gesture utilisateur.
  const [needsUnmute, setNeedsUnmute] = useState(false);

  useEffect(() => {
    // `cancelled` évite qu'un `.catch()` tardif du play() précédent n'aille
    // muter un *nouveau* stream : quand le stream change d'une vidéo à une
    // autre sans repasser par `null`, la promesse de l'effet précédent peut
    // régler après que le nouvel effet a déjà appelé `play()` sur le même
    // élément — sans ce flag, le vieux catch mettrait `el.muted = true` et
    // afficherait "Activer le son" par-dessus un flux qui joue bien.
    let cancelled = false;
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (!stream) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeedsUnmute(false);
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedsUnmute(false);
    el.play().catch(() => {
      if (cancelled || isHost) return;
      // Fallback viewer : on essaie de démarrer en muted (autoplay sans
      // son, toujours autorisé). Comme ça au moins la vidéo tourne, et
      // on affiche un bouton "Activer le son" pour récupérer l'audio
      // après un tap utilisateur.
      el.muted = true;
      el.play()
        .then(() => {
          if (!cancelled) setNeedsUnmute(true);
        })
        .catch(() => {
          if (!cancelled) setNeedsUnmute(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [stream, isHost]);

  const handleUnmute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.play()
      .then(() => setNeedsUnmute(false))
      .catch(() => {
        // Rare : l'autoplay échoue même sous gesture. On laisse le bouton
        // affiché pour que l'user re-tape.
      });
  };

  if (!stream) return null;

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Le host se voit sans son (sinon larsen). Les viewers entendent.
        //
        // `needsUnmute` participe à la prop pour que la reconciliation
        // React n'écrase pas le `el.muted = true` imposé par le fallback
        // autoplay : sans ça, juste après `setNeedsUnmute(true)`, React
        // ré-applique `muted={false}` sur l'élément vidéo → le flux
        // repart en tentative d'autoplay avec son alors que l'overlay
        // "Activer le son" est affiché par-dessus (incohérent, et sur
        // iOS le navigateur met la vidéo en pause).
        muted={isHost || needsUnmute}
        controls={!isHost}
        className="absolute inset-0 h-full w-full bg-night-900 object-contain"
      />
      {needsUnmute ? (
        <button
          type="button"
          onClick={handleUnmute}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <span className="rounded-full border border-gold-200/40 bg-night-900/80 px-5 py-3 font-display text-sm text-gold-100 shadow-lg">
            🔊 Activer le son
          </span>
        </button>
      ) : null}
    </>
  );
}

function TwitchEmbed({ channel }: { channel: string }) {
  if (!channel) return null;
  const parent =
    typeof window !== "undefined" ? window.location.hostname : "localhost";
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(
    channel,
  )}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  return (
    <iframe
      title={`Twitch - ${channel}`}
      src={src}
      allow="autoplay; fullscreen"
      allowFullScreen
      className="absolute inset-0 h-full w-full bg-night-900"
    />
  );
}

/**
 * Panneau de contrôle du broadcaster : visible à tout membre connecté, lui
 * permet de démarrer son propre live (partage d'écran pour tous, OBS/Twitch
 * gatekeeping réservé aux admins/animateurs officiels).
 */
/**
 * Détection support `getDisplayMedia`. iOS Safari (toutes versions à date
 * d'avril 2026) et la plupart des navigateurs Android renvoient `undefined`.
 * On bascule l'UI de mode de diffusion en fonction pour éviter de proposer
 * "Partage d'écran" à un mobile qui ne pourra pas l'exécuter.
 *
 * Pas de `useState` ici : les capacités du navigateur sont stables pendant
 * la durée de vie de la page (pas de SSR dans Vaelyndra, c'est du Vite SPA),
 * donc un simple test synchrone suffit.
 */
function isScreenShareSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

function isCameraSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Détection (best-effort) d'un appareil mobile. On combine plusieurs
 * signaux parce qu'aucun n'est parfait :
 *  - `userAgent` avec les mots-clés usuels (Android, iPhone, iPad,
 *    Mobile, Silk…) couvre 99 % des devices, y compris les tablettes
 *    Samsung.
 *  - `maxTouchPoints > 1` attrape les iPad récents qui se déclarent
 *    "Macintosh" dans leur UA par défaut.
 *
 * But : savoir si on doit préselectionner le mode "Caméra" (qui marche
 * partout) plutôt que "Partage d'écran" (qui n'existe pas sur mobile,
 * ni Android Chrome ni Samsung Internet ni iOS Safari → l'appel à
 * `getDisplayMedia` plante silencieusement, ce qui fait croire à
 * l'utilisateur Samsung que son téléphone "ne peut pas streamer").
 */
function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini|SamsungBrowser/i.test(ua)) {
    return true;
  }
  // iPad iOS 13+ se fait passer pour un Mac — on le récupère via le
  // nombre de points de contact.
  if (
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1 &&
    /Macintosh/i.test(ua)
  ) {
    return true;
  }
  return false;
}

/**
 * Panneau d'aide pour les users iPhone / iPad : explique le parcours
 * "streamer depuis mon appareil Apple" via Twitch Mobile → embed
 * automatique sur Vaelyndra. Sur iOS/iPadOS, le partage d'écran web n'est
 * pas possible (Apple bloque `getDisplayMedia` sur tous les navigateurs
 * iPad/iPhone, y compris Chrome et Firefox qui sont obligés d'utiliser
 * WebKit), donc l'app Twitch est le chemin officiel.
 *
 * `prominent` : si true, le panel est affiché déplié d'emblée (cas d'un
 * user qui a pas getDisplayMedia). Sinon il apparaît replié en
 * collapsible pour ne pas polluer l'UI desktop.
 */
function IosStreamingHelp({
  prominent,
  isQueen,
}: {
  prominent: boolean;
  isQueen: boolean;
}) {
  const [open, setOpen] = useState(prominent);
  return (
    <div
      className={`mt-5 overflow-hidden rounded-2xl border ${
        prominent
          ? "border-amber-400/40 bg-amber-500/5"
          : "border-royal-500/30 bg-night-900/30"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            📱
          </span>
          <span>
            <span className="block font-display text-sm text-gold-200">
              Tu streames depuis un iPhone ou un iPad&nbsp;?
            </span>
            <span className="block text-[11px] leading-snug text-ivory/55">
              {prominent
                ? "Apple bloque le partage d'écran web sur iOS/iPadOS — voici le chemin officiel."
                : "Pas-à-pas pour streamer tes jeux ou apps via Twitch."}
            </span>
          </span>
        </span>
        <span className="text-ivory/45">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-ivory/10 px-4 py-4 text-xs text-ivory/70">
          <p>
            Sur iPhone et iPad, le partage d'écran direct via navigateur
            n'est pas supporté (décision d'Apple, rien à voir avec
            Vaelyndra — toutes les apps de navigateur sur iPad passent
            obligatoirement par le moteur WebKit, qui bloque
            {" "}<code>getDisplayMedia</code>). Le chemin officiel pour
            streamer tes jeux ou apps&nbsp;:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Installe <strong className="text-gold-200">Twitch</strong>{" "}
              depuis l'App Store (gratuit, dispo iPhone et iPad).
            </li>
            <li>
              Crée un compte Twitch (si pas déjà fait) et connecte-toi dans
              l'app.
            </li>
            <li>
              Dans l'app Twitch, appuie sur ton avatar →{" "}
              <strong>Go Live</strong> → <strong>Partager l'écran</strong>.
              Tu peux streamer n'importe quel jeu ou application ouverte
              sur ton appareil (iPhone comme iPad).
            </li>
            <li>
              Récupère ton <strong>nom de chaîne Twitch</strong> (ex:{" "}
              <code className="rounded bg-night-900/60 px-1 py-0.5">
                tonpseudo
              </code>
              ).
            </li>
            {isQueen ? (
              <li>
                Sur Vaelyndra, choisis le mode{" "}
                <strong>OBS + Twitch</strong> ci-dessus, colle ton nom de
                chaîne, clique "Annoncer le live Twitch". Vaelyndra embed
                automatiquement ton flux Twitch.
              </li>
            ) : (
              <li>
                Sur Vaelyndra, demande à un <strong>admin/animateur</strong>{" "}
                d'activer le mode Twitch pour ton compte (bientôt
                accessible à tous les streamers certifiés — le mode est
                pour l'instant en beta réservée).
              </li>
            )}
          </ol>
          <p className="text-ivory/50">
            Sur mobile (Android comme iOS), le mode "Partage d'écran"
            n'est pas fiable : Chrome Android/Samsung Internet exposent
            bien l'API mais l'appel échoue ou renvoie une track morte.
            Utilise donc le mode "Caméra" pour filmer en selfie/arrière,
            ou passe par OBS + Twitch si tu veux streamer ton écran de
            jeu mobile.
          </p>
        </div>
      )}
    </div>
  );
}

function BroadcasterControls() {
  const { user, isQueen } = useAuth();
  const { notify } = useToast();
  const {
    config,
    updateConfig,
    startScreenShare,
    startCameraShare,
    switchCamera,
    cameraFacing,
    stopLive,
    announceTwitchLive,
    lastError,
  } = useLive();
  const [showKey, setShowKey] = useState(false);
  const screenShareSupported = isScreenShareSupported();
  const cameraSupported = isCameraSupported();
  const isMobile = useMemo(() => isLikelyMobile(), []);
  // Le partage d'écran via `getDisplayMedia` n'est pas supporté sur
  // mobile : même si Chrome Android expose parfois l'API, l'appel
  // renvoie une `NotAllowedError` / une track morte. On désactive donc
  // le mode screen sur tous les mobiles, indépendamment du test de
  // capacité API (qui donne de faux positifs sur Samsung Internet).
  const screenEffectiveSupported = screenShareSupported && !isMobile;

  const isLive = config.status === "live";

  useEffect(() => {
    if (lastError) notify(lastError, "info");
  }, [lastError, notify]);

  // Le mode "twitch" est désormais accessible à tous les streamers (pas
  // seulement aux reines — cf. PR #81). Un utilisateur mobile qui streame
  // via OBS sur sa Switch/PC ou via l'app Twitch mobile a aussi besoin de
  // ce mode — il embed le player Twitch sur la page Vaelyndra au lieu de
  // tenter un WebRTC impossible. On ne force donc plus de rétrogradation
  // vers "screen" pour les non-reines.
  //
  // En revanche on garde une redirection spécifique mobile : si un user
  // arrive avec `mode = "screen"` en localStorage (par ex. il avait choisi
  // "Partage d'écran" sur PC puis a rouvert Vaelyndra depuis son Samsung),
  // `getDisplayMedia` n'existe pas / plante silencieusement. Sans ce
  // fallback, il cliquerait "Passer en direct" et rien ne se passerait
  // (= « mon téléphone ne peut pas streamer »). On bascule alors sur le
  // mode caméra, seul mode 100 % supporté sur Samsung / Android / iOS.
  useEffect(() => {
    if (!user) return;
    if (
      config.mode === "screen" &&
      !screenEffectiveSupported &&
      cameraSupported
    ) {
      updateConfig({ mode: "camera" });
    }
  }, [
    user,
    config.mode,
    updateConfig,
    screenEffectiveSupported,
    cameraSupported,
  ]);

  if (!user) return null;

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(config.obsKey);
      notify("Clé OBS copiée.", "success");
    } catch {
      notify("Impossible de copier la clé.", "info");
    }
  }

  async function goLive() {
    if (!config.title.trim()) {
      notify("Donne un titre à ton live.", "info");
      return;
    }
    if (config.mode === "camera") {
      // `facing` par défaut = frontale sur mobile (selfie), seule caméra
      // dispo sur desktop (webcam intégrée).
      await startCameraShare("user");
      return;
    }
    if (config.mode === "screen") {
      await startScreenShare();
      return;
    }
    const handle = extractTwitchChannel(config.twitchChannel);
    if (!handle) {
      notify("Renseigne ton nom de chaîne Twitch.", "info");
      return;
    }
    updateConfig({ twitchChannel: handle });
    // On passe explicitement `handle` : updateConfig est batché donc
    // configRef.current lit encore la valeur brute pré-normalisation.
    announceTwitchLive(handle);
  }

  return (
    <section className="card-royal mt-8 p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-gold-300" />
        <h3 className="font-display text-lg text-gold-200">
          Lancer mon live
        </h3>
        {isLive && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            En direct
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center justify-between font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
            Titre
            <span
              className={`font-mono text-[10px] ${
                config.title.length > LIVE_TITLE_MAX - 3
                  ? "text-rose-300"
                  : "text-ivory/40"
              }`}
            >
              {config.title.length}/{LIVE_TITLE_MAX}
            </span>
          </span>
          <input
            type="text"
            maxLength={LIVE_TITLE_MAX}
            value={config.title}
            onChange={(e) => updateConfig({ title: e.target.value })}
            placeholder={
              isQueen ? "Nuit Étoilée de Vaelyndra" : "Mon live du soir"
            }
            className="input-royal"
            disabled={isLive}
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
            Description
            <span
              className={`font-mono text-[10px] ${
                config.description.length > LIVE_DESCRIPTION_MAX - 10
                  ? "text-rose-300"
                  : "text-ivory/40"
              }`}
            >
              {config.description.length}/{LIVE_DESCRIPTION_MAX}
            </span>
          </span>
          <input
            type="text"
            maxLength={LIVE_DESCRIPTION_MAX}
            value={config.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            placeholder="Rituel d'ouverture, salon sucré, discussion…"
            className="input-royal"
            disabled={isLive}
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
          Catégorie du live
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LIVE_CATEGORIES.map((c) => {
            const selected = config.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => !isLive && updateConfig({ category: c.id })}
                disabled={isLive}
                className={`flex items-start gap-2 rounded-xl border bg-night-900/40 p-3 text-left transition ${
                  selected
                    ? "border-gold-400/60 ring-1 ring-gold-400/40"
                    : "border-royal-500/30 opacity-80 hover:opacity-100 hover:border-gold-400/30"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {c.icon}
                </span>
                <span>
                  <span className="block font-display text-sm text-gold-200">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ivory/55">
                    {c.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="mb-2 font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
          Mode de diffusion
        </legend>
        <div
          className="grid gap-3 md:grid-cols-3"
        >
          <button
            type="button"
            onClick={() =>
              !isLive && cameraSupported && updateConfig({ mode: "camera" })
            }
            disabled={isLive || !cameraSupported}
            className={`card-royal flex items-start gap-3 p-4 text-left transition ${
              config.mode === "camera"
                ? "ring-1 ring-gold-400/60"
                : "opacity-80 hover:opacity-100"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <Camera className="mt-0.5 h-5 w-5 text-gold-300" />
            <div>
              <p className="font-display text-base text-gold-200">
                Caméra
                <span className="ml-2 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  mobile + pc
                </span>
              </p>
              <p className="mt-1 text-xs text-ivory/60">
                {cameraSupported
                  ? "Lance un live depuis ta caméra (frontale ou arrière sur mobile, webcam sur PC). Le mode le plus simple."
                  : "Ton navigateur ne donne pas accès à la caméra."}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              !isLive &&
              screenEffectiveSupported &&
              updateConfig({ mode: "screen" })
            }
            disabled={isLive || !screenEffectiveSupported}
            className={`card-royal flex items-start gap-3 p-4 text-left transition ${
              config.mode === "screen"
                ? "ring-1 ring-gold-400/60"
                : "opacity-80 hover:opacity-100"
            } disabled:cursor-not-allowed disabled:opacity-40`}
            title={
              screenEffectiveSupported
                ? undefined
                : isMobile
                  ? "Le partage d'écran web n'est pas supporté sur mobile (Android, Samsung, iPhone). Utilise le mode Caméra ci-dessus."
                  : "Le partage d'écran web n'est pas supporté sur ton navigateur. Utilise le mode Caméra ci-dessus."
            }
          >
            <Monitor className="mt-0.5 h-5 w-5 text-gold-300" />
            <div>
              <p className="font-display text-base text-gold-200">
                Partage d'écran
                <span className="ml-2 rounded-full border border-sky-300/40 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                  pc uniquement
                </span>
              </p>
              <p className="mt-1 text-xs text-ivory/60">
                {screenEffectiveSupported
                  ? "Stream ton écran (jeu, appli, navigateur…) directement depuis ton PC."
                  : isMobile
                    ? "Le partage d'écran n'est pas dispo sur téléphone — choisis « Caméra » juste au-dessus (ça marche sur Samsung, iPhone et toutes les tablettes)."
                    : "Ton navigateur ne permet pas le partage d'écran."}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => !isLive && updateConfig({ mode: "twitch" })}
            disabled={isLive}
            className={`card-royal flex items-start gap-3 p-4 text-left transition ${
              config.mode === "twitch"
                ? "ring-1 ring-gold-400/60"
                : "opacity-80 hover:opacity-100"
            } disabled:cursor-not-allowed`}
          >
            <Gamepad2 className="mt-0.5 h-5 w-5 text-gold-300" />
            <div>
              <p className="font-display text-base text-gold-200">
                OBS + Twitch
                <span className="ml-2 rounded-full border border-fuchsia-300/40 bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">
                  mobile + pc
                </span>
              </p>
              <p className="mt-1 text-xs text-ivory/60">
                Tu streames depuis OBS (PC) ou l'app Twitch mobile. Le site
                embed le lecteur officiel Twitch. Marche sur iPhone et
                Android.
              </p>
            </div>
          </button>
        </div>
      </fieldset>

      <IosStreamingHelp
        prominent={!screenEffectiveSupported}
        isQueen={isQueen}
      />

      {config.mode === "twitch" && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
              Chaîne Twitch
            </span>
            <input
              type="text"
              value={config.twitchChannel}
              onChange={(e) =>
                updateConfig({ twitchChannel: e.target.value })
              }
              placeholder="ton_pseudo_twitch"
              className="input-royal"
              disabled={isLive}
            />
            <span className="mt-1 block text-[10px] text-ivory/45">
              Nom d'utilisateur Twitch ou URL complète. Nécessite un compte Twitch.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
              Clé de stream OBS
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="inline-flex items-center gap-1 rounded-full border border-ivory/15 px-2 py-0.5 text-[10px] text-ivory/60 hover:text-ivory"
              >
                {showKey ? (
                  <>
                    <EyeOff className="h-3 w-3" /> Masquer
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" /> Voir
                  </>
                )}
              </button>
            </span>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={config.obsKey}
                onChange={(e) => updateConfig({ obsKey: e.target.value })}
                placeholder="live_xxxxxxxxxx"
                className="input-royal flex-1"
                autoComplete="off"
              />
              {config.obsKey && (
                <button
                  type="button"
                  onClick={copyKey}
                  className="btn-ghost"
                  title="Copier"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="mt-1 block text-[10px] text-ivory/45">
              Reste uniquement dans ton navigateur. Jamais envoyé au site —
              c'est ton garde-mémoire pour coller dans OBS.
            </span>
          </label>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isLive ? (
          <button onClick={goLive} className="btn-royal">
            <Radio className="h-4 w-4" />
            {config.mode === "camera"
              ? "Passer en direct (caméra)"
              : config.mode === "screen"
                ? "Partager mon écran"
                : "Annoncer le live Twitch"}
          </button>
        ) : (
          <button onClick={stopLive} className="btn-ghost">
            <StopCircle className="h-4 w-4" /> Terminer mon live
          </button>
        )}
        {isLive && config.mode === "camera" && (
          <button
            onClick={() => switchCamera()}
            className="btn-ghost"
            title="Basculer entre caméra frontale et arrière"
          >
            <RefreshCw className="h-4 w-4" />
            {cameraFacing === "user"
              ? "Passer en caméra arrière"
              : "Passer en caméra frontale"}
          </button>
        )}
        {isLive && config.mode === "camera" && (
          <p className="text-xs text-ivory/55">
            Autorise caméra + micro dans ton navigateur. Garde cet onglet
            ouvert.
          </p>
        )}
        {isLive && config.mode === "screen" && (
          <p className="text-xs text-ivory/55">
            Garde cet onglet ouvert — le flux s'interrompt si tu le fermes.
          </p>
        )}
        {isLive && config.mode === "twitch" && (
          <p className="text-xs text-ivory/55">
            Lance aussi le stream depuis OBS pour que la diffusion démarre.
          </p>
        )}
        {isLive && (
          <Link
            to={`/live/${user?.id}`}
            className="btn-ghost"
            title="Voir mon live côté viewer"
          >
            Voir ma page publique
          </Link>
        )}
      </div>
    </section>
  );
}

export function Live() {
  const { broadcasterId: paramBroadcasterId } = useParams<{
    broadcasterId?: string;
  }>();
  const navigate = useNavigate();
  const { lives } = useStore();
  const { user, users } = useAuth();
  const { notify } = useToast();
  const {
    config,
    remoteStream,
    localStream,
    isConnecting,
    joinAsViewer,
    liveRegistry,
    viewingMeta,
    publishChatMessage,
    subscribeChatMessages,
    resumableLive,
    resumeLive,
    dismissResumableLive,
  } = useLive();

  // Quel broadcaster regarde-t-on ?
  // Priorité :
  //  1. URL (`/live/:broadcasterId`) — on respecte toujours la demande
  //     explicite du viewer.
  //  2. Le user courant s'il est lui-même en live (ou sur le point de
  //     l'être : `config.status === "live"`). Sans cette priorité, un
  //     broadcaster qui cliquait sur « LIVES » tombait sur le live de
  //     quelqu'un d'autre déjà présent dans le registre (ex : Dreyna),
  //     et son propre flux était attribué au mauvais user — bug
  //     visible tel quel dans l'UI ("Dreyna en direct" alors que c'est
  //     Alexandre qui streame).
  //  3. Le premier live actif du registre (fallback spectateur).
  //  4. L'utilisateur connecté — pour qu'il puisse ouvrir l'écran de
  //     démarrage de live sans URL ni broadcaster actif.
  //  5. Chaîne vide — état "aucun live".
  const firstLiveId = Object.keys(liveRegistry)[0];
  // `imBroadcastingNow` couvre aussi le cas post-F5 : le user était en
  // direct il y a < 5 min (marker de reprise encore valide) mais son
  // `config.status` vient d'être réinitialisé à "idle" par le mount.
  // Sans cette troisième condition, un broadcaster qui refresh pendant
  // qu'un autre live tourne (ex: Dreyna) serait catapulté sur CE live
  // (firstLiveId prioritaire) et ne verrait jamais son bouton
  // « Reprendre mon live ».
  const imBroadcastingNow =
    !!user &&
    (user.id in liveRegistry ||
      config.status === "live" ||
      (!!resumableLive && resumableLive.userId === user.id));
  const broadcasterId =
    paramBroadcasterId ??
    (imBroadcastingNow && user ? user.id : undefined) ??
    firstLiveId ??
    user?.id ??
    "";
  const amBroadcaster = !!user && !!broadcasterId && user.id === broadcasterId;
  // Résout le profil du broadcaster (pour nom/avatar/pseudo dans le HUD + GiftPanel).
  const broadcasterProfile = useMemo<User | null>(
    () => users.find((u) => u.id === broadcasterId) ?? null,
    [broadcasterId, users],
  );

  const registryEntry = liveRegistry[broadcasterId] ?? null;
  const isHost = amBroadcaster && !!localStream;
  const { resetBroadcast: resetInviteBroadcast } = useLiveInvites();

  // Rejoindre le flux du broadcaster cible (sauf si on est host).
  const remoteStreamRef = useRef<MediaStream | null>(null);
  remoteStreamRef.current = remoteStream;
  useEffect(() => {
    if (amBroadcaster) return;
    // Si c'est un live Twitch (pas WebRTC), pas de joinAsViewer à tenter.
    if (registryEntry?.mode === "twitch") return;
    let cleanup: (() => void) | null = joinAsViewer(broadcasterId);
    const retry = window.setInterval(() => {
      if (!remoteStreamRef.current) {
        cleanup?.();
        cleanup = joinAsViewer(broadcasterId);
      }
    }, 20000);
    return () => {
      window.clearInterval(retry);
      cleanup?.();
    };
  }, [amBroadcaster, broadcasterId, joinAsViewer, registryEntry?.mode]);

  const hasRemote = !!remoteStream;
  const twitchChannel = extractTwitchChannel(
    registryEntry?.twitchChannel ?? (amBroadcaster ? config.twitchChannel : ""),
  );
  const activeMode: "screen" | "camera" | "twitch" =
    registryEntry?.mode ??
    viewingMeta?.mode ??
    (amBroadcaster ? config.mode : "screen");
  const isActiveLive = !!registryEntry || (amBroadcaster && config.status === "live");
  const showViewer =
    isActiveLive &&
    (isHost ||
      hasRemote ||
      (activeMode === "twitch" && !!twitchChannel));

  const [messages, setMessages] = useState<ChatMessage[]>(SEED_CHAT);
  // Grade du broadcaster — utilisé pour scaler le compteur de viewers
  // fake et la cadence du chat bot. `null` tant qu'on n'a pas récupéré le
  // profil → on part sur le défaut (novice). Idem `myGradeShort` pour le
  // préfixe `[SHORT]` devant mon pseudo dans les messages que je publie.
  const [broadcasterGradeSlug, setBroadcasterGradeSlug] = useState<
    string | null
  >(null);
  const [myGradeShort, setMyGradeShort] = useState<string | null>(null);
  // Compteur viewers fake — initialisé au tiers bas de la fourchette
  // correspondant au grade du broadcaster, puis mis à jour toutes les
  // ~N secondes avec un léger biais positif pour mimer l'arrivée des gens.
  const [viewers, setViewers] = useState(() =>
    pickInitialViewers(getViewerScale(null)),
  );
  // Modération (PR Q) : sanctions actives reçues depuis le backend pour le
  // user courant, sur *ce* live. Polled ~30 s depuis `apiMyModerationState`
  // pour détecter un mute/kick posé pendant qu'on regarde.
  const [myMuteUntil, setMyMuteUntil] = useState<string | null>(null);
  const [myKickUntil, setMyKickUntil] = useState<string | null>(null);
  // `heartEvents` est append-only : chaque cœur envoyé y dépose un
  // `BurstEvent`. `LiveHeartsOverlay` dédoublonne en interne.
  const [heartEvents, setHeartEvents] = useState<
    { emitterId: string; x: number }[]
  >([]);
  const [giftFlights, setGiftFlights] = useState<
    { id: string; gift: Gift; x: number }[]
  >([]);
  // Agrégat des Sylvins offerts au broadcaster courant pendant la séance
  // en cours, clé par senderId. Remis à zéro au changement de broadcaster.
  // Pré-seedé avec quelques donations fictives pour ne pas afficher un
  // Top vide en démo.
  const [tributes, setTributes] = useState<Record<string, TributeEntry>>(
    () => seedTributes(),
  );

  // Optimisation mobile : le cadre vidéo peut passer en plein écran
  // (Fullscreen API) et l'overlay de chat flottant peut être masqué pour
  // ne pas manger la vidéo sur petit écran. `playerCardRef` pointe sur
  // la carte contenant le player pour que `requestFullscreen` prenne
  // aussi les overlays (chat flottant, avatar, cadeaux) et pas juste
  // l'élément <video>.
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(
        !!document.fullscreenElement &&
          document.fullscreenElement === playerCardRef.current,
      );
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    const el = playerCardRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        // iOS Safari ne supporte pas requestFullscreen sur un div : on
        // informe l'utilisateur plutôt que d'échouer silencieusement.
        notify(
          "Le plein écran n'est pas supporté par ton navigateur. Essaie en rotation paysage ou masque le chat pour agrandir la vidéo.",
          "info",
        );
      }
    } catch {
      notify("Impossible de passer en plein écran sur ce navigateur.", "info");
    }
  }

  // Mémorise qu'on a vu le live courant apparaître dans le registre
  // au moins une fois (PR T, utilisé plus bas par l'auto-redirect).
  // Déclaré ici pour pouvoir être reset dans le même effet que le reste
  // de l'état spécifique au broadcaster — sinon un viewer qui navigue
  // de A (live) vers B (pas live) via une URL directe serait
  // immédiatement catapulté ailleurs sans voir "Le rideau est tiré"
  // (finding Devin Review sur PR #66).
  const wasLiveOnceRef = useRef(false);

  // Reset du chat + des cœurs + du leaderboard quand on change de
  // broadcaster pour éviter la confusion (tout est spécifique au live).
  useEffect(() => {
    setMessages(SEED_CHAT);
    setHeartEvents([]);
    setTributes(seedTributes());
    setMyMuteUntil(null);
    setMyKickUntil(null);
    // Un nouveau broadcaster = nouvelle observation. Si ce nouveau
    // `broadcasterId` est offline d'emblée, on reste sur la page
    // vide au lieu d'auto-redirect ailleurs.
    wasLiveOnceRef.current = false;
  }, [broadcasterId]);

  // Abonnement au flux des messages de chat transitant par le
  // DataChannel WebRTC (messages des autres viewers + host). Ajoute
  // chaque message entrant au buffer local, avec dédup par id (le
  // LiveContext dédup déjà côté transport, mais on protège aussi
  // l'UI au cas où un ancien message ferait double aller-retour).
  useEffect(() => {
    const unsubscribe = subscribeChatMessages((msg) => {
      setMessages((m) => {
        if (m.some((existing) => existing.id === msg.id)) return m;
        return [...m, msg].slice(-CHAT_BUFFER_MAX);
      });
    });
    return unsubscribe;
  }, [subscribeChatMessages, broadcasterId]);

  // Polling de mes éventuelles sanctions (mute/kick) sur le live courant.
  // On n'appelle pas l'endpoint si :
  //  - je suis le broadcaster (il ne peut pas se modérer lui-même),
  //  - je ne suis pas connecté (endpoint auth-protégé → 401 bruyant).
  useEffect(() => {
    if (!user || amBroadcaster) return;
    let cancelled = false;
    async function refresh() {
      try {
        const state = await apiMyModerationState(broadcasterId);
        if (cancelled) return;
        setMyMuteUntil(state.muted_until);
        setMyKickUntil(state.kicked_until);
      } catch {
        // Silencieux — on retentera à la prochaine itération.
      }
    }
    refresh();
    const t = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [user, amBroadcaster, broadcasterId]);

  // Timestamp future → booléen "encore actif".
  const isMuted = !!myMuteUntil && new Date(myMuteUntil) > new Date();
  const isKicked = !!myKickUntil && new Date(myKickUntil) > new Date();

  // Purge les demandes d'invitation dès que mon live s'arrête (détecté
  // quand je suis broadcaster et que `isActiveLive` redevient false).
  // Sans ce cleanup, un viewer ayant levé la main verrait son état
  // figé pour la session suivante — confusant et source de bugs.
  useEffect(() => {
    if (amBroadcaster && !isActiveLive) {
      resetInviteBroadcast(broadcasterId);
    }
  }, [amBroadcaster, isActiveLive, broadcasterId, resetInviteBroadcast]);

  // PR T — Auto-redirect vers un autre live quand celui qu'on regarde
  // se termine.
  //
  // On veut uniquement rediriger si on a *vraiment* vu le live en cours
  // au moins une fois (sinon, un user qui arrive sur une URL `/live/xxx`
  // obsolète se verrait catapulté ailleurs sans prévenir). Le ref
  // `wasLiveOnceRef` mémorise qu'on a vu `registryEntry` apparaître ; si
  // ensuite il disparaît ET qu'un autre live est dispo, on navigue.
  //
  // Le broadcaster lui-même n'est jamais auto-redirigé : quand il stop
  // son live, il doit rester sur sa propre page pour voir l'état "idle"
  // et relancer s'il veut.
  useEffect(() => {
    if (amBroadcaster) {
      wasLiveOnceRef.current = false;
      return;
    }
    if (registryEntry) {
      wasLiveOnceRef.current = true;
      return;
    }
    if (!wasLiveOnceRef.current) return;
    // Le live qu'on regardait vient de disparaître — on cherche un
    // remplaçant dans le registre. Le plus récent d'abord.
    const others = Object.values(liveRegistry)
      .filter((e) => e.userId !== broadcasterId)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
    const next = others[0];
    if (next) {
      wasLiveOnceRef.current = false;
      notify(`Le live vient de finir — on passe chez ${next.username}.`, "info");
      navigate(`/live/${next.userId}`, { replace: true });
    }
  }, [
    amBroadcaster,
    registryEntry,
    broadcasterId,
    liveRegistry,
    navigate,
    notify,
  ]);

  // PR T — "Live suivant" : un viewer peut explicitement cycler vers
  // le prochain live en cours via un bouton (flèche sur le player).
  // Retourne l'id du prochain live à viewer, ou null s'il n'y en a pas.
  const nextLiveEntry = useMemo(() => {
    const others = Object.values(liveRegistry).filter(
      (e) => e.userId !== broadcasterId,
    );
    if (others.length === 0) return null;
    // Ordre "plus récent d'abord" — cohérent avec l'auto-redirect et
    // avec `OtherLivesStrip` : le bouton "Live suivant" emmène le
    // viewer sur le même live que celui affiché en tête de strip.
    others.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return others[0];
  }, [liveRegistry, broadcasterId]);

  function goToNextLive() {
    if (!nextLiveEntry) return;
    navigate(`/live/${nextLiveEntry.userId}`);
  }

  // Résout le grade du broadcaster pour scaler viewers fake + cadence bots.
  // On refetch quand le broadcaster change (navigation entre lives). L'appel
  // est silencieux : si on n'a pas le grade on reste sur la courbe "novice".
  useEffect(() => {
    if (!broadcasterId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBroadcasterGradeSlug(null);
      return;
    }
    // Reset immédiatement pour éviter qu'en passant d'un live "Légende"
    // à un live "Novice", on garde brièvement le scale Légende (1500-3500
    // viewers, bots toutes les 4-8 s) pendant que l'API renvoie le vrai
    // grade. On retombe sur la courbe Novice par défaut en attendant.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBroadcasterGradeSlug(null);
    let cancelled = false;
    apiGetProfile(broadcasterId)
      .then((p) => {
        if (!cancelled) setBroadcasterGradeSlug(p.grade?.slug ?? null);
      })
      .catch(() => {
        if (!cancelled) setBroadcasterGradeSlug(null);
      });
    return () => {
      cancelled = true;
    };
  }, [broadcasterId]);

  // Résout mon propre diminutif de grade pour l'afficher en préfixe
  // `[SHORT]` devant mon pseudo dans les messages que j'envoie. Refetch
  // quand l'utilisateur courant change (login/logout).
  useEffect(() => {
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMyGradeShort(null);
      return;
    }
    const userId = user.id;
    let cancelled = false;
    apiGetProfile(userId)
      .then((p) => {
        if (!cancelled) setMyGradeShort(p.grade?.short ?? null);
      })
      .catch(() => {
        if (!cancelled) setMyGradeShort(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Reseed le compteur viewers quand le grade du broadcaster est résolu
  // (évite de garder l'ancienne valeur 1284 quand on arrive sur un live
  // de Novice). On garde la valeur si elle est déjà dans la fourchette.
  const viewerScale = useMemo(
    () => getViewerScale(broadcasterGradeSlug),
    [broadcasterGradeSlug],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewers((v) => {
      if (v >= viewerScale.min && v <= viewerScale.max) return v;
      return pickInitialViewers(viewerScale);
    });
  }, [viewerScale]);

  // Simulate viewers pulse — scalé par grade du broadcaster :
  // Novice = petits mouvements rares, Légende = grosses variations rapides.
  useEffect(() => {
    const t = setInterval(() => {
      setViewers((v) => nextViewerValue(v, viewerScale));
    }, viewerScale.intervalMs);
    return () => clearInterval(t);
  }, [viewerScale]);

  // Auto chat lines — cadence scalée par grade du broadcaster. On utilise
  // setTimeout récursif (plutôt qu'un setInterval fixe) pour que chaque
  // attente soit tirée au hasard dans [minMs, maxMs] du grade courant,
  // ce qui sonne plus naturel qu'un tick mécanique.
  useEffect(() => {
    if (!isActiveLive) return;
    const cadence = getBotCadence(broadcasterGradeSlug);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      timer = setTimeout(() => {
        const line =
          AUTO_CHAT_LINES[Math.floor(Math.random() * AUTO_CHAT_LINES.length)];
        const bot = BOT_AUTHORS[Math.floor(Math.random() * BOT_AUTHORS.length)];
        setMessages((m) =>
          [
            ...m,
            {
              id: generateId("msg"),
              authorId: bot.id,
              authorName: bot.name,
              authorAvatar: bot.avatar,
              content: line,
              createdAt: new Date().toISOString(),
              // Les bots adoptent le diminutif du broadcaster (ils
              // "ressemblent" au public du live). Pas d'appel API : on
              // dérive via le slug déjà en main.
              gradeShort: gradeBySlug(broadcasterGradeSlug ?? "")?.short ?? null,
            },
          ].slice(-CHAT_BUFFER_MAX),
        );
        scheduleNext();
      }, pickNextBotDelay(cadence));
    };
    scheduleNext();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isActiveLive, broadcasterGradeSlug]);

  const replays = useMemo(() => lives, [lives]);

  function sendMessage(content: string) {
    if (!content.trim()) return;
    if (!user) {
      notify("Connectez-vous pour écrire dans la cour.", "info");
      return;
    }
    if (isKicked || isMuted) {
      // Mute ou kick actif → on bloque l'envoi, côté UI uniquement pour
      // l'instant (le chat n'est pas persisté côté serveur). Le kick
      // l'emporte sur le mute (plus grave) pour le message affiché.
      const untilIso = isKicked ? myKickUntil : myMuteUntil;
      const until = untilIso ? new Date(untilIso) : null;
      const remaining = until
        ? Math.max(1, Math.round((until.getTime() - Date.now()) / 1000))
        : null;
      notify(
        isKicked
          ? remaining
            ? `Tu es expulsé du live pour encore ${formatDuration(remaining)}.`
            : "Tu es expulsé de ce live."
          : remaining
            ? `Tu es en sourdine pour encore ${formatDuration(remaining)}.`
            : "Tu es en sourdine sur ce live.",
        "info",
      );
      return;
    }
    // Publie via le contexte Live → WebRTC DataChannel. Le message
    // arrive ensuite dans le state local via le subscriber (plus bas
    // dans le composant) ; ça garantit que :
    //  - tous les viewers voient notre message, pas juste nous ;
    //  - on voit les messages des autres viewers (bidirectionnel) ;
    //  - la dédup par id empêche le doublon avec l'écho optimiste.
    publishChatMessage({
      id: generateId("msg"),
      authorId: user.id,
      authorName: user.username,
      authorAvatar: user.avatar,
      content: content.trim(),
      createdAt: new Date().toISOString(),
      highlight: user.role === "queen",
      gradeShort: myGradeShort,
    });
  }

  // ---------------------------------------------------------------------------
  // Handlers de modération (broadcaster uniquement)
  // ---------------------------------------------------------------------------
  async function applyModeration(
    action: LiveModerationAction,
    targetUserId: string,
    targetName: string,
    durationSeconds: number,
  ) {
    if (!amBroadcaster) return;
    try {
      await apiModerateLive({
        targetUserId,
        action,
        durationSeconds,
      });
      const label =
        action === "mute"
          ? `${targetName} mis en sourdine pour ${formatDuration(durationSeconds)}.`
          : `${targetName} expulsé du live pour ${formatDuration(durationSeconds)}.`;
      notify(label, "success");
      pushSystemAnnouncement(
        action === "mute"
          ? `🔇 ${targetName} a été mis en sourdine (${formatDuration(durationSeconds)}).`
          : `🚫 ${targetName} a été expulsé du live (${formatDuration(durationSeconds)}).`,
      );
    } catch {
      notify("Action impossible pour le moment.", "error");
    }
  }

  function handleMute(
    targetUserId: string,
    targetName: string,
    durationSeconds: number,
  ) {
    void applyModeration("mute", targetUserId, targetName, durationSeconds);
  }

  function handleKick(
    targetUserId: string,
    targetName: string,
    durationSeconds: number,
  ) {
    void applyModeration("kick", targetUserId, targetName, durationSeconds);
  }

  function pushSystemAnnouncement(content: string) {
    setMessages((m) =>
      [
        ...m,
        {
          id: generateId("msg"),
          authorId: SYSTEM_AUTHOR.id,
          authorName: SYSTEM_AUTHOR.name,
          authorAvatar: SYSTEM_AUTHOR.avatar,
          content,
          createdAt: new Date().toISOString(),
          highlight: true,
        },
      ].slice(-CHAT_BUFFER_MAX),
    );
  }

  // Repère la dernière annonce cœur envoyée par l'utilisateur courant,
  // pour regrouper les clics rapprochés dans le chat (anti-spam texte).
  const lastHeartAnnounceRef = useRef<number>(0);
  function shootHeart() {
    const emitterId = user?.id ?? "anon";
    // Position horizontale aléatoire mais bornée pour rester centrée.
    const x = 20 + Math.random() * 60;
    setHeartEvents((h) => [...h.slice(-64), { emitterId, x }]);
    if (!user) return;
    // On n'annonce qu'un cœur par fenêtre de 1,5 s pour ne pas noyer le chat.
    const now = Date.now();
    if (now - lastHeartAnnounceRef.current > 1500) {
      lastHeartAnnounceRef.current = now;
      pushSystemAnnouncement(
        `❤️ ${user.username} envoie un cœur à ${broadcasterProfile?.username ?? "la cour"}`,
      );
    }
  }

  /**
   * Lance un sort d'appel. Retourne `false` si on n'a pas pu le lancer
   * (ex. pas connecté) — dans ce cas le `SortDAppelCaster` n'armera pas
   * le cooldown.
   */
  function castSortDAppel(level: SortLevel): boolean {
    if (!user) {
      notify("Connectez-vous pour lancer un sort d'appel.", "info");
      return false;
    }
    const tier = SORT_LEVELS.find((s) => s.level === level);
    if (!tier) return false;
    const romanSuffix =
      level === 1 ? "I" : level === 2 ? "II" : level === 3 ? "III" : "IV";
    const glyph =
      level === 4 ? "👑" : level === 3 ? "🌟" : level === 2 ? "✨" : "🔥";
    notify(
      `${glyph} Sort ${romanSuffix} lancé sur ${broadcasterProfile?.username ?? "la cour"}`,
      "info",
    );
    pushSystemAnnouncement(
      `${glyph} ${user.username} invoque le Sort ${romanSuffix} sur ${broadcasterProfile?.username ?? "la cour"}`,
    );
    return true;
  }

  function onGiftSent(gift: Gift) {
    const id = generateId("gflight");
    setGiftFlights((f) => [...f, { id, gift, x: 10 + Math.random() * 80 }]);
    setTimeout(
      () => setGiftFlights((f) => f.filter((x) => x.id !== id)),
      2800,
    );
    if (user) {
      pushSystemAnnouncement(
        `🎁 ${user.username} a offert ${gift.name} à ${broadcasterProfile?.username ?? "la cour"}`,
      );
      // On agrège la donation dans le leaderboard live. On additionne le
      // prix du cadeau à la contribution cumulée de l'utilisateur pour
      // ce broadcaster depuis le début de la séance.
      setTributes((prev) => {
        const current = prev[user.id];
        return {
          ...prev,
          [user.id]: {
            userId: user.id,
            name: user.username,
            avatar: user.avatar,
            total: (current?.total ?? 0) + gift.price,
          },
        };
      });
    }
  }

  const heroTitle =
    registryEntry?.title?.trim() ||
    viewingMeta?.title?.trim() ||
    (amBroadcaster ? config.title?.trim() : "") ||
    (broadcasterProfile
      ? `${broadcasterProfile.username} en direct`
      : "Nuit Étoilée · Ouverture de la cour");
  // Catégorie à afficher en badge dans le header du lecteur. On privilégie
  // l'entrée du registre public (vue unifiée cross-tab) ; si elle n'existe
  // pas encore (host qui est en train de démarrer), on retombe sur le
  // state local du host courant.
  const heroCategory = getLiveCategory(
    registryEntry?.category ?? (amBroadcaster ? config.category : undefined),
  );
  const heroDescription =
    registryEntry?.description?.trim() ||
    viewingMeta?.description?.trim() ||
    (amBroadcaster ? config.description?.trim() : "") ||
    (broadcasterProfile
      ? `Avec ${broadcasterProfile.username} · depuis l'archipel de Vaelyndra`
      : "Depuis l'archipel de Vaelyndra");

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="La Salle des Lives"
        title={<>La cour <span className="text-mystic">en direct</span></>}
        subtitle={
          broadcasterProfile
            ? `Vous regardez ${broadcasterProfile.username}. Chaque membre peut lancer son propre live.`
            : "Quand le rideau s'ouvre, Vaelyndra s'anime. Chat en temps réel et rituels partagés."
        }
      />

      <div className="mt-6 sm:mt-10">
        <div>
          {/*
            Carte du lecteur : portée d'ancrage du ref pour la Fullscreen
            API (on met en plein écran la carte entière, pas juste la
            balise <video>, pour garder overlays + chat dans la vue).
            Quand `isFullscreen` est vrai, on passe en noir plein cadre
            pour cacher le fond nocturne qui baverait au bord.
          */}
          <div
            ref={playerCardRef}
            className={`card-royal relative overflow-hidden ${
              isFullscreen ? "bg-night-900" : ""
            }`}
          >
            <div
              className={`relative w-full overflow-hidden bg-night-900 ${
                isFullscreen ? "h-screen" : "aspect-video"
              }`}
            >
              {showViewer ? (
                <>
                  {(activeMode === "screen" ||
                    activeMode === "camera") && (
                    <LiveVideoStage
                      isHost={isHost}
                      localStream={localStream}
                      remoteStream={remoteStream}
                    />
                  )}
                  {activeMode === "twitch" && (
                    <TwitchEmbed channel={twitchChannel} />
                  )}
                  {/*
                    Overlay « avatar en live » : médaillon du broadcaster
                    (avec sa scène + sa parure équipées) en surimpression,
                    pour que les viewers voient toujours qui ils regardent
                    même sur un partage d'écran ou un embed Twitch.
                  */}
                  <LiveAvatarOverlay
                    broadcasterId={broadcasterId}
                    broadcasterName={
                      broadcasterProfile?.username ?? "Vaelyndra"
                    }
                    fallbackAvatar={broadcasterProfile?.avatar ?? null}
                    showControls={amBroadcaster}
                  />
                  {/* Bandeau d'invités sur scène (PR H). Positionné en haut
                      du cadre, juste en-dessous du médaillon avatar. */}
                  <LiveGuestsStrip broadcasterId={broadcasterId} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-night-900/95 via-night-900/40 to-transparent p-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />{" "}
                          En direct
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${heroCategory.chipClass}`}
                        >
                          <span aria-hidden>{heroCategory.icon}</span>
                          {heroCategory.label}
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-2xl text-gold-200 md:text-4xl">
                        {heroTitle}
                      </h3>
                      <p className="mt-1 text-sm text-ivory/70">
                        {heroDescription}
                      </p>
                      {broadcasterProfile && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ivory/80">
                          <div className="flex items-center gap-2">
                            <img
                              src={broadcasterProfile.avatar}
                              alt=""
                              className="h-6 w-6 rounded-full border border-gold-400/40 object-cover"
                            />
                            <span>
                              avec{" "}
                              <span className="font-display text-gold-200">
                                {broadcasterProfile.username}
                              </span>
                            </span>
                          </div>
                          {user && user.id !== broadcasterId && (
                            <ReportButton
                              targetType="live"
                              targetId={broadcasterId}
                              targetLabel={`Live de ${broadcasterProfile.username}`}
                              targetUrl={`/live/${broadcasterId}`}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : isActiveLive &&
                (activeMode === "screen" || activeMode === "camera") ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                  {broadcasterProfile?.avatar && (
                    <img
                      src={broadcasterProfile.avatar}
                      alt=""
                      className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-sm"
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <Radio className="h-10 w-10 animate-pulse text-rose-300" />
                    <p className="font-display text-2xl text-gold-200">
                      {isConnecting
                        ? "Connexion au flux…"
                        : "Le live est annoncé"}
                    </p>
                    <p className="max-w-md text-sm text-ivory/65">
                      {isConnecting
                        ? "La cour se connecte aux portails de Vaelyndra."
                        : `${broadcasterProfile?.username ?? "Le broadcaster"} prépare son sortilège. Rafraîchis dans quelques secondes.`}
                    </p>
                  </div>
                </div>
              ) : amBroadcaster &&
                resumableLive &&
                user &&
                resumableLive.userId === user.id ? (
                /*
                 * Post-refresh (F5, pull-to-refresh, crash onglet) d'un
                 * broadcaster qui était en live il y a < 5 min. Le
                 * MediaStream est perdu (sécurité navigateur), mais la
                 * config est connue → on propose la reprise en un clic
                 * au lieu de faire croire que le live est fermé. Voir
                 * LiveContext > LiveResumeMarker pour les détails.
                 */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <Radio className="h-10 w-10 animate-pulse text-rose-300" />
                  <p className="font-display text-2xl text-gold-200">
                    Reprendre ton live ?
                  </p>
                  <p className="max-w-md text-sm text-ivory/75">
                    Tu étais en direct juste avant d'actualiser. Ton flux
                    vidéo a été coupé par le navigateur mais ta config est
                    sauvegardée — clique pour relancer.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void resumeLive();
                      }}
                      className="rounded-full border border-rose-300/60 bg-rose-400/20 px-5 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/30"
                    >
                      Reprendre mon live
                    </button>
                    <button
                      type="button"
                      onClick={dismissResumableLive}
                      className="rounded-full border border-ivory/20 px-4 py-2 text-xs text-ivory/70 transition hover:bg-ivory/10"
                    >
                      Non, c'est fini
                    </button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                  <Radio className="h-10 w-10 text-royal-300" />
                  <p className="font-display text-2xl text-gold-200">
                    Le rideau est tiré
                  </p>
                  <p className="max-w-md text-sm text-ivory/65">
                    {broadcasterProfile?.username ?? "Ce membre"} n'est pas en
                    direct pour le moment. Préparez votre bougie pour le
                    prochain rituel.
                  </p>
                </div>
              )}

              {/* Cœurs flottants groupés (remplace l'ancienne pluie à
                  1 cœur par clic). Voir `LiveHeartsOverlay` pour le combo.
                  `key={broadcasterId}` force un remount quand on change
                  de broadcaster : l'état interne (bursts + processedRef)
                  est entièrement purgé pour éviter le leak visuel et
                  mémoire du `Set` accumulateur. */}
              <LiveHeartsOverlay key={broadcasterId} events={heartEvents} />
              <GiftFlight items={giftFlights} />

              {/* Classement live Top 3 Sylvins. Purgé au changement de
                  broadcaster via le `key`. Masqué si le live n'est pas
                  actif (pas de compétition à afficher sur un rideau tiré). */}
              {isActiveLive && (
                <LiveLeaderboardOverlay
                  key={`lb-${broadcasterId}`}
                  entries={Object.values(tributes)}
                />
              )}

              {/* Chat flottant TikTok/Twitch : visible uniquement si un
                  live est effectivement en cours sur ce broadcaster, et
                  seulement si l'utilisateur ne l'a pas masqué via le
                  bouton "masquer le chat" (utile sur mobile pour voir
                  la vidéo sans que le flot de messages mange l'écran). */}
              {isActiveLive && isChatVisible && (
                <LiveChatOverlay
                  key={broadcasterId}
                  messages={messages}
                  systemAuthorId={SYSTEM_AUTHOR.id}
                  onSend={sendMessage}
                  canSend={!!user}
                  placeholder={
                    user
                      ? "Un mot pour la cour…"
                      : "Connecte-toi pour parler dans le live"
                  }
                />
              )}

              {/* Barre d'outils du lecteur (top-right) :
                   - masquer / afficher le chat flottant
                   - basculer en plein écran
                  Avec le compteur de viewers. Les boutons sont
                  pointer-events:auto pour rester cliquables par-dessus
                  les overlays, et assez grands pour être tappables
                  au doigt (h-8 w-8 = 32 px). */}
              <div className="absolute right-2 top-2 z-30 flex items-center gap-2 sm:right-4 sm:top-4">
                <div className="pointer-events-none flex items-center gap-2 rounded-full bg-night-900/70 px-3 py-1.5 text-xs text-ivory/80 backdrop-blur">
                  <Users className="h-3.5 w-3.5 text-gold-300" /> {viewers}
                </div>
                {nextLiveEntry && !amBroadcaster && (
                  <button
                    type="button"
                    onClick={goToNextLive}
                    className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-night-900/70 px-3 text-xs text-ivory/80 backdrop-blur transition hover:bg-night-900/90 hover:text-gold-200"
                    aria-label={`Live suivant : ${nextLiveEntry.username}`}
                    title={`Live suivant : ${nextLiveEntry.username}`}
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Live suivant</span>
                  </button>
                )}
                {isActiveLive && (
                  <button
                    type="button"
                    onClick={() => setIsChatVisible((v) => !v)}
                    className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-night-900/70 text-ivory/80 backdrop-blur transition hover:bg-night-900/90 hover:text-gold-200"
                    aria-label={
                      isChatVisible ? "Masquer le chat" : "Afficher le chat"
                    }
                    aria-pressed={!isChatVisible}
                    title={
                      isChatVisible ? "Masquer le chat" : "Afficher le chat"
                    }
                  >
                    {isChatVisible ? (
                      <MessageSquareOff className="h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-night-900/70 text-ivory/80 backdrop-blur transition hover:bg-night-900/90 hover:text-gold-200"
                  aria-label={
                    isFullscreen
                      ? "Quitter le plein écran"
                      : "Passer en plein écran"
                  }
                  aria-pressed={isFullscreen}
                  title={
                    isFullscreen
                      ? "Quitter le plein écran"
                      : "Passer en plein écran"
                  }
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={shootHeart}
                  className="btn-ghost"
                  aria-label="Envoyer un cœur"
                >
                  <Heart className="h-3.5 w-3.5" /> Cœur
                </button>
                <SortDAppelCaster onCast={castSortDAppel} disabled={!user} />
              </div>
              <p className="text-xs text-ivory/50">
                {isActiveLive
                  ? "Chat flottant sur le flux. Les Sorts I/II/III ont chacun leur cooldown (10 / 25 / 60 s)."
                  : broadcasterProfile && amBroadcaster
                    ? "Lance ton propre live depuis le panneau ci-dessous."
                    : "Le rideau est tiré. Reviens quand la scène s'allume."}
              </p>
            </div>
          </div>

          {/* Carte « présentation du streamer » : nom en grand juste
              sous le lecteur pour que les viewers qui débarquent
              comprennent instantanément chez qui ils sont. On affiche
              l'avatar, le pseudo, éventuellement le handle `@xxx`, le
              diminutif de grade [BRM/SEN/FLX/…] et un lien cliquable
              vers le profil. Cachée seulement si on n'a pas encore
              résolu le broadcaster (rare, transitoire). */}
          {broadcasterProfile && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-gold-400/25 bg-night-900/60 p-4 sm:p-5">
              <Link
                to={
                  broadcasterProfile.handle
                    ? `/profil/@${broadcasterProfile.handle}`
                    : `/profil/${broadcasterProfile.id}`
                }
                className="group flex items-center gap-4"
              >
                <img
                  src={broadcasterProfile.avatar}
                  alt=""
                  className="h-14 w-14 rounded-full border-2 border-gold-400/60 object-cover transition group-hover:border-gold-300 sm:h-16 sm:w-16"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {broadcasterGradeSlug &&
                      (() => {
                        const g = gradeBySlug(broadcasterGradeSlug);
                        if (!g) return null;
                        return (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-200"
                            title={g.name}
                          >
                            <span aria-hidden>{g.icon}</span>
                            [{g.short}]
                          </span>
                        );
                      })()}
                  </div>
                  <h2 className="font-display text-2xl text-gold-100 transition group-hover:text-gold-200 sm:text-3xl">
                    {broadcasterProfile.username}
                  </h2>
                  {broadcasterProfile.handle && (
                    <p className="text-xs text-ivory/55">
                      @{broadcasterProfile.handle}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          )}

          {/* Historique complet du chat (PR P/Q) : permet de remonter
              dans le temps pour voir les messages qui ont disparu de
              l'overlay flottant, et pour le broadcaster, d'accéder au
              menu de modération (mute / expulser) en cliquant sur un
              pseudo. Visible sur mobile comme sur PC. */}
          {isActiveLive && (
            <LiveChatHistory
              messages={messages}
              systemAuthorId={SYSTEM_AUTHOR.id}
              broadcasterId={broadcasterId}
              isBroadcaster={amBroadcaster}
              currentUserId={user?.id ?? null}
              onMute={handleMute}
              onKick={handleKick}
            />
          )}

          {/* Bandeau "Tu es expulsé / en sourdine" pour le user courant.
              Informatif : le mute est déjà appliqué dans sendMessage, le
              kick n'empêche pas de voir le flux (on informe simplement). */}
          {isActiveLive && isKicked && (
            <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-3 text-sm text-rose-100">
              🚫 Tu as été expulsé du live. Tu ne peux plus y participer
              pour l'instant.
            </div>
          )}
          {isActiveLive && isMuted && !isKicked && (
            <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/15 p-3 text-sm text-amber-100">
              🔇 Tu es en sourdine sur ce live — tu ne peux pas envoyer de
              message dans le chat pour l'instant.
            </div>
          )}

          {/* Panneau "Demander à monter" (PR H) : bouton côté viewer,
              file d'attente côté broadcaster. Rendu juste sous le lecteur
              pour que les deux rôles le voient sans scroller. */}
          <LiveInvitePanel
            broadcasterId={broadcasterId}
            broadcasterName={broadcasterProfile?.username ?? "la cour"}
            isBroadcaster={amBroadcaster}
            onAnnounce={pushSystemAnnouncement}
            isActiveLive={isActiveLive}
          />

          {/* PR T — bandeau "autres lives en cours" avec preview
              thumbnail + badge catégorie + titre, style TikTok-like. */}
          <OtherLivesStrip
            currentBroadcasterId={broadcasterId}
            liveRegistry={liveRegistry}
          />

          <BroadcasterControls />

          {broadcasterProfile && (
            <div className="mt-8">
              <GiftPanel
                hostId={broadcasterProfile.id}
                hostName={broadcasterProfile.username}
                onGiftSent={onGiftSent}
              />
            </div>
          )}

          <section className="mt-12">
            <SectionHeading
              align="left"
              eyebrow="Archives des rituels"
              title="Lives passés"
              subtitle="Revivez les moments marquants de la cour."
            />
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {replays.map((l) => (
                <div
                  key={l.id}
                  className="card-royal group overflow-hidden"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={l.cover}
                      alt={l.title}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/30 to-transparent" />
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-night-900/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gold-300">
                      <Archive className="h-3 w-3" /> Replay
                    </span>
                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-night-900/80 px-2 py-0.5 text-xs text-ivory/80">
                      <Users className="h-3 w-3 text-gold-300" />{" "}
                      {l.peakViewers}
                    </span>
                    <button className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-shine text-night-900 opacity-0 shadow-glow-gold transition group-hover:opacity-100">
                      <Play className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-4">
                    <h4 className="font-display text-lg text-gold-200">
                      {l.title}
                    </h4>
                    <p className="mt-2 line-clamp-2 text-xs text-ivory/60">
                      {l.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}

/**
 * Donations fictives qui pré-remplissent le Top 3 avant que la première
 * vraie donation n'arrive. Évite un classement vide pendant la démo et
 * donne une vraie "compétition" à dépasser.
 */
function seedTributes(): Record<string, TributeEntry> {
  const seeds: TributeEntry[] = [
    {
      userId: "seed-lyria",
      name: "Lyria",
      avatar: "https://i.pravatar.cc/150?u=lyria",
      total: 1200,
    },
    {
      userId: "seed-caelum",
      name: "Caelum",
      avatar: "https://i.pravatar.cc/150?u=caelum",
      total: 780,
    },
    {
      userId: "seed-mira",
      name: "Mira",
      avatar: "https://i.pravatar.cc/150?u=mira",
      total: 420,
    },
  ];
  return Object.fromEntries(seeds.map((s) => [s.userId, s]));
}
