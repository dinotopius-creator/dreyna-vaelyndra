import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  Users,
  Play,
  Archive,
  Heart,
  Crown,
  Monitor,
  Gamepad2,
  StopCircle,
  Copy,
  Eye,
  EyeOff,
  Video,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  LIVE_DESCRIPTION_MAX,
  LIVE_TITLE_MAX,
  useLive,
} from "../contexts/LiveContext";
import type { LiveRegistryEntry } from "../contexts/LiveContext";
import { LIVE_CATEGORIES, getLiveCategory } from "../data/liveCategories";
import { SectionHeading } from "../components/SectionHeading";
import { GiftPanel } from "../components/GiftPanel";
import { GiftFlight } from "../components/GiftFlight";
import { LiveAvatarOverlay } from "../components/LiveAvatarOverlay";
import { LiveChatOverlay } from "../components/LiveChatOverlay";
import { LiveHeartsOverlay } from "../components/LiveHeartsOverlay";
import { LiveLeaderboardOverlay } from "../components/LiveLeaderboardOverlay";
import type { TributeEntry } from "../components/LiveLeaderboardOverlay";
import {
  SortDAppelCaster,
  SORT_LEVELS,
  type SortLevel,
} from "../components/SortDAppelCaster";
import {
  AUTO_CHAT_LINES,
  DREYNA_PROFILE,
  SEED_CHAT,
} from "../data/mock";
import type { ChatMessage, Gift, User } from "../types";
import { generateId } from "../lib/helpers";

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      el.play().catch(() => {
        // Navigateur bloque l'autoplay tant qu'il n'y a pas d'interaction.
      });
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      // Le host se voit sans son (sinon larsen). Les viewers entendent.
      muted={isHost}
      controls={!isHost}
      className="absolute inset-0 h-full w-full bg-night-900 object-contain"
    />
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
 * réservé à la reine pour garder le garde-fou ZEPETO).
 */
function BroadcasterControls() {
  const { user, isQueen } = useAuth();
  const { notify } = useToast();
  const {
    config,
    updateConfig,
    startScreenShare,
    stopLive,
    announceTwitchLive,
    lastError,
  } = useLive();
  const [showKey, setShowKey] = useState(false);

  const isLive = config.status === "live";

  useEffect(() => {
    if (lastError) notify(lastError, "info");
  }, [lastError, notify]);

  // Les non-queen n'ont que le mode "screen". On force.
  useEffect(() => {
    if (!user) return;
    if (!isQueen && config.mode !== "screen") {
      updateConfig({ mode: "screen" });
    }
  }, [user, isQueen, config.mode, updateConfig]);

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
    if (config.mode === "screen") {
      await startScreenShare();
    } else {
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
  }

  return (
    <section className="card-royal mt-8 p-5 md:p-6">
      <div className="flex items-center gap-2">
        {isQueen ? (
          <Crown className="h-4 w-4 text-gold-300" />
        ) : (
          <Video className="h-4 w-4 text-gold-300" />
        )}
        <h3 className="font-display text-lg text-gold-200">
          {isQueen ? "Salle du Trône — Diffuser" : "Lancer mon live"}
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

      {isQueen && (
        <fieldset className="mt-5">
          <legend className="mb-2 font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
            Mode de diffusion
          </legend>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => !isLive && updateConfig({ mode: "screen" })}
              disabled={isLive}
              className={`card-royal flex items-start gap-3 p-4 text-left transition ${
                config.mode === "screen"
                  ? "ring-1 ring-gold-400/60"
                  : "opacity-80 hover:opacity-100"
              } disabled:cursor-not-allowed`}
            >
              <Monitor className="mt-0.5 h-5 w-5 text-gold-300" />
              <div>
                <p className="font-display text-base text-gold-200">
                  Partage d'écran direct
                </p>
                <p className="mt-1 text-xs text-ivory/60">
                  Zéro install. Ton navigateur partage un écran/onglet/appli
                  et les viewers le voient en live via WebRTC.
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
                </p>
                <p className="mt-1 text-xs text-ivory/60">
                  Tu streames depuis OBS vers Twitch. Le site embed le lecteur
                  officiel. Qualité pro.
                </p>
              </div>
            </button>
          </div>
        </fieldset>
      )}

      {isQueen && config.mode === "twitch" && (
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
              placeholder="dreynakame"
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
            {config.mode === "screen"
              ? "Partager mon écran"
              : "Annoncer le live Twitch"}
          </button>
        ) : (
          <button onClick={stopLive} className="btn-ghost">
            <StopCircle className="h-4 w-4" /> Terminer mon live
          </button>
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

/** Affiche la liste des lives en cours (autre que celui qu'on regarde). */
function LiveRoster({
  entries,
  activeId,
}: {
  entries: LiveRegistryEntry[];
  activeId: string;
}) {
  const filtered = entries.filter((e) => e.userId !== activeId);
  if (filtered.length === 0) return null;
  return (
    <div className="card-royal mt-6 p-5">
      <p className="mb-3 font-regal text-[11px] uppercase tracking-[0.22em] text-ivory/60">
        Autres lives en cours
      </p>
      <ul className="flex flex-wrap gap-2">
        {filtered.map((e) => {
          const category = getLiveCategory(e.category);
          return (
            <li key={e.userId}>
              <Link
                to={`/live/${e.userId}`}
                className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 bg-night-900/40 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold-400/50"
              >
                <img
                  src={e.avatar}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span className="font-display text-gold-200">
                  {e.username}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] ${category.chipClass}`}
                  title={category.label}
                >
                  <span aria-hidden>{category.icon}</span>
                  {category.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-rose-200">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-rose-400" />
                  Live
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Live() {
  const { broadcasterId: paramBroadcasterId } = useParams<{
    broadcasterId?: string;
  }>();
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
  } = useLive();

  // Quel broadcaster regarde-t-on ? Priorité URL > Dreyna par défaut.
  const broadcasterId = paramBroadcasterId ?? DREYNA_PROFILE.id;
  const amBroadcaster = !!user && user.id === broadcasterId;
  // Résout le profil du broadcaster (pour nom/avatar/pseudo dans le HUD + GiftPanel).
  const broadcasterProfile = useMemo<User | null>(() => {
    if (broadcasterId === DREYNA_PROFILE.id) {
      return {
        id: DREYNA_PROFILE.id,
        username: DREYNA_PROFILE.username,
        email: "dreyna@vaelyndra.realm",
        avatar: DREYNA_PROFILE.avatar,
        role: "queen",
        joinedAt: new Date().toISOString(),
      };
    }
    return users.find((u) => u.id === broadcasterId) ?? null;
  }, [broadcasterId, users]);

  const registryEntry = liveRegistry[broadcasterId] ?? null;
  const isHost = amBroadcaster && !!localStream;

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
  const activeMode: "screen" | "twitch" =
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
  const [viewers, setViewers] = useState(1284);
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

  // Reset du chat + des cœurs + du leaderboard quand on change de
  // broadcaster pour éviter la confusion (tout est spécifique au live).
  useEffect(() => {
    setMessages(SEED_CHAT);
    setHeartEvents([]);
    setTributes(seedTributes());
  }, [broadcasterId]);

  // Simulate viewers pulse
  useEffect(() => {
    const t = setInterval(
      () =>
        setViewers((v) =>
          Math.max(800, v + Math.round((Math.random() - 0.4) * 30)),
        ),
      2500,
    );
    return () => clearInterval(t);
  }, []);

  // Auto chat lines
  useEffect(() => {
    if (!isActiveLive) return;
    const t = setInterval(() => {
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
          },
        ].slice(-60),
      );
    }, 4200);
    return () => clearInterval(t);
  }, [isActiveLive]);

  const replays = useMemo(() => lives, [lives]);

  function sendMessage(content: string) {
    if (!content.trim()) return;
    if (!user) {
      notify("Connectez-vous pour écrire dans la cour.", "info");
      return;
    }
    setMessages((m) =>
      [
        ...m,
        {
          id: generateId("msg"),
          authorId: user.id,
          authorName: user.username,
          authorAvatar: user.avatar,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          highlight: user.role === "queen",
        },
      ].slice(-80),
    );
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
      ].slice(-60),
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
      : "Avec la reine Dreyna · depuis l'archipel de Vaelyndra");

  const registryList = useMemo(
    () => Object.values(liveRegistry),
    [liveRegistry],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <SectionHeading
        eyebrow="La Salle des Lives"
        title={<>La cour <span className="text-mystic">en direct</span></>}
        subtitle={
          broadcasterProfile
            ? `Vous regardez ${broadcasterProfile.username}. Chaque membre peut lancer son propre live.`
            : "Quand le rideau s'ouvre, Vaelyndra s'anime. Chat en temps réel et rituels partagés."
        }
      />

      <div className="mt-10">
        <div>
          <div className="card-royal relative overflow-hidden">
            <div className="relative aspect-video w-full overflow-hidden bg-night-900">
              {showViewer ? (
                <>
                  {activeMode === "screen" && (
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
                        <div className="mt-3 flex items-center gap-2 text-xs text-ivory/80">
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
                      )}
                    </div>
                  </div>
                </>
              ) : isActiveLive && activeMode === "screen" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                  <img
                    src={broadcasterProfile?.avatar ?? DREYNA_PROFILE.avatar}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-sm"
                  />
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
                  live est effectivement en cours sur ce broadcaster. */}
              {isActiveLive && (
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

              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-night-900/70 px-3 py-1.5 text-xs text-ivory/80 backdrop-blur">
                <Users className="h-3.5 w-3.5 text-gold-300" /> {viewers} elfes
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

          <LiveRoster entries={registryList} activeId={broadcasterId} />

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
