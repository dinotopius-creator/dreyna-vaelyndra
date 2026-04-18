import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  Send,
  Users,
  Play,
  Archive,
  Flame,
  Heart,
  Crown,
  Monitor,
  Gamepad2,
  StopCircle,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  LIVE_DESCRIPTION_MAX,
  LIVE_TITLE_MAX,
  useLive,
} from "../contexts/LiveContext";
import { SectionHeading } from "../components/SectionHeading";
import {
  AUTO_CHAT_LINES,
  DREYNA_PROFILE,
  SEED_CHAT,
} from "../data/mock";
import type { ChatMessage } from "../types";
import { generateId } from "../lib/helpers";

const BOT_AUTHORS = [
  { id: "user-lyria", name: "Lyria", avatar: "https://i.pravatar.cc/150?u=lyria" },
  { id: "user-caelum", name: "Caelum", avatar: "https://i.pravatar.cc/150?u=caelum" },
  { id: "user-aeris", name: "Aëris", avatar: "https://i.pravatar.cc/150?u=aeris" },
  { id: "user-sylas", name: "Sylas", avatar: "https://i.pravatar.cc/150?u=sylas" },
  { id: "user-mira", name: "Mira", avatar: "https://i.pravatar.cc/150?u=mira" },
  { id: "user-thalia", name: "Thalia", avatar: "https://i.pravatar.cc/150?u=thalia" },
];

function extractTwitchChannel(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  // Accepte "https://www.twitch.tv/xxx" ou simplement "xxx"
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
      // La reine se voit sans son (sinon larsen). Les viewers entendent.
      muted={isHost}
      controls={!isHost}
      className="absolute inset-0 h-full w-full bg-night-900 object-contain"
    />
  );
}

function TwitchEmbed({ channel }: { channel: string }) {
  if (!channel) return null;
  // Twitch exige le paramètre `parent` avec le hostname. On le récupère côté client.
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

function QueenControls() {
  const { user } = useAuth();
  const { notify } = useToast();
  const {
    config,
    updateConfig,
    startScreenShare,
    stopLive,
    lastError,
  } = useLive();
  const [showKey, setShowKey] = useState(false);

  const isQueen = user?.role === "queen";
  const isLive = config.status === "live";

  useEffect(() => {
    if (lastError) notify(lastError, "info");
  }, [lastError, notify]);

  if (!isQueen) return null;

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
      notify("Donne un titre à ton live, reine.", "info");
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
      updateConfig({
        status: "live",
        twitchChannel: handle,
        startedAt: new Date().toISOString(),
      });
    }
  }

  return (
    <section className="card-royal mt-8 p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-gold-300" />
        <h3 className="font-display text-lg text-gold-200">
          Salle du Trône — Diffuser
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
            placeholder="Nuit Étoilée de Vaelyndra"
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
            placeholder="Rituel d'ouverture de la cour, salon sucré…"
            className="input-royal"
            disabled={isLive}
          />
        </label>
      </div>

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
                Zéro install. Ton navigateur partage un écran/onglet/appli et
                les viewers le voient en live via WebRTC.
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
            <StopCircle className="h-4 w-4" /> Terminer le live
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
      </div>
    </section>
  );
}

export function Live() {
  const { lives } = useStore();
  const { user } = useAuth();
  const { notify } = useToast();
  const { config, remoteStream, localStream, isConnecting, joinAsViewer } =
    useLive();
  const isHost = user?.role === "queen" && !!localStream;

  // Découverte active d'un live en cours : on tente de rejoindre la Salle
  // du Trône dès qu'on arrive sur `/live` (sauf si on est l'hôte). On
  // retente toutes les 20s tant qu'on n'a pas de flux, pour détecter un
  // live lancé depuis un autre navigateur après notre arrivée sur la page.
  //
  // IMPORTANT: on NE met PAS `remoteStream` dans les deps — sinon la
  // réception d'un flux change `remoteStream`, déclenche le cleanup du
  // précédent effect (qui détruit le peer et remet `remoteStream=null`),
  // ce qui déclenche un nouveau re-render… boucle infinie. On passe par
  // un ref pour relire la valeur courante dans le setInterval.
  const remoteStreamRef = useRef<MediaStream | null>(null);
  remoteStreamRef.current = remoteStream;
  useEffect(() => {
    if (isHost) return;
    if (config.mode === "twitch") return;
    let cleanup: (() => void) | null = joinAsViewer();
    const retry = window.setInterval(() => {
      if (!remoteStreamRef.current) {
        cleanup?.();
        cleanup = joinAsViewer();
      }
    }, 20000);
    return () => {
      window.clearInterval(retry);
      cleanup?.();
    };
  }, [isHost, config.mode, joinAsViewer]);
  // localStream est aussi consommé dans <LiveVideoStage /> via prop.
  const hasRemote = config.mode === "screen" && !!remoteStream;
  const twitchChannel = extractTwitchChannel(config.twitchChannel);
  const showViewer =
    config.status === "live" &&
    (isHost ||
      hasRemote ||
      (config.mode === "twitch" && !!twitchChannel));

  const [messages, setMessages] = useState<ChatMessage[]>(SEED_CHAT);
  const [input, setInput] = useState("");
  const [viewers, setViewers] = useState(1284);
  const [hearts, setHearts] = useState<{ id: string; x: number }[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    if (config.status !== "live") return;
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
  }, [config.status]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const replays = useMemo(() => lives, [lives]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    if (!user) {
      notify("Connectez-vous pour écrire dans la cour.", "info");
      return;
    }
    setMessages((m) => [
      ...m,
      {
        id: generateId("msg"),
        authorId: user.id,
        authorName: user.username,
        authorAvatar: user.avatar,
        content: input.trim(),
        createdAt: new Date().toISOString(),
        highlight: user.role === "queen",
      },
    ]);
    setInput("");
  }

  function shootHeart() {
    const id = generateId("h");
    setHearts((h) => [...h, { id, x: Math.random() * 100 }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 2500);
  }

  const heroTitle = config.title?.trim() || "Nuit Étoilée · Ouverture de la cour";
  const heroDescription =
    config.description?.trim() ||
    "Avec la reine Dreyna · depuis l'archipel de Vaelyndra";

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <SectionHeading
        eyebrow="La Salle des Lives"
        title={<>La cour <span className="text-mystic">en direct</span></>}
        subtitle="Quand le rideau s'ouvre, Vaelyndra s'anime. Chat en temps réel et rituels partagés."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div>
          <div className="card-royal relative overflow-hidden">
            <div className="relative aspect-video w-full overflow-hidden bg-night-900">
              {showViewer ? (
                <>
                  {config.mode === "screen" && (
                    <LiveVideoStage
                      isHost={isHost}
                      localStream={localStream}
                      remoteStream={remoteStream}
                    />
                  )}
                  {config.mode === "twitch" && (
                    <TwitchEmbed channel={twitchChannel} />
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-night-900/95 via-night-900/40 to-transparent p-6">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />{" "}
                        En direct
                      </span>
                      <h3 className="mt-3 font-display text-2xl text-gold-200 md:text-4xl">
                        {heroTitle}
                      </h3>
                      <p className="mt-1 text-sm text-ivory/70">
                        {heroDescription}
                      </p>
                    </div>
                  </div>
                </>
              ) : config.status === "live" && config.mode === "screen" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
                  <img
                    src={DREYNA_PROFILE.avatar}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-sm"
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <Radio className="h-10 w-10 animate-pulse text-rose-300" />
                    <p className="font-display text-2xl text-gold-200">
                      {isConnecting
                        ? "Connexion au flux royal…"
                        : "Le live est annoncé"}
                    </p>
                    <p className="max-w-md text-sm text-ivory/65">
                      {isConnecting
                        ? "La cour se connecte aux portails de Vaelyndra."
                        : "La reine prépare son sortilège. Rafraîchis la page dans quelques secondes."}
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
                    Dreyna n'est pas en direct pour le moment. Préparez votre
                    bougie pour le prochain rituel.
                  </p>
                </div>
              )}

              <AnimatePresence>
                {hearts.map((h) => (
                  <motion.span
                    key={h.id}
                    initial={{ opacity: 0, y: 0, scale: 0.5 }}
                    animate={{ opacity: 1, y: -220, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.2, ease: "easeOut" }}
                    style={{ left: `${h.x}%` }}
                    className="pointer-events-none absolute bottom-8 text-gold-300"
                  >
                    <Heart className="h-5 w-5 fill-gold-300 text-gold-300" />
                  </motion.span>
                ))}
              </AnimatePresence>

              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-night-900/70 px-3 py-1.5 text-xs text-ivory/80 backdrop-blur">
                <Users className="h-3.5 w-3.5 text-gold-300" /> {viewers} elfes
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex gap-2">
                <button onClick={shootHeart} className="btn-ghost">
                  <Heart className="h-3.5 w-3.5" /> Envoyer un cœur
                </button>
                <button
                  onClick={() =>
                    notify("🔥 Dreyna vient de recevoir votre sortilège", "info")
                  }
                  className="btn-ghost"
                >
                  <Flame className="h-3.5 w-3.5" /> Sort d'appel
                </button>
              </div>
              <p className="text-xs text-ivory/50">
                {config.status === "live"
                  ? "Live actif — le chat est activé automatiquement."
                  : "La reine peut activer le direct depuis la Salle du Trône."}
              </p>
            </div>
          </div>

          <QueenControls />

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

        <aside className="card-royal relative flex h-[600px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-ivory/10 px-4 py-3">
            <div>
              <p className="font-display text-base text-gold-200">
                Chat de la cour
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/50">
                en direct · modération douce
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-night-900/70 px-2 py-0.5 text-[10px] text-ivory/70">
              <Users className="h-3 w-3 text-gold-300" /> {viewers}
            </span>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${
                  m.highlight ? "rounded-xl bg-gold-500/10 p-2" : ""
                }`}
              >
                <img
                  src={m.authorAvatar}
                  alt={m.authorName}
                  className="h-7 w-7 rounded-full border border-gold-400/30 object-cover"
                />
                <div>
                  <div className="flex items-center gap-2 text-[11px] text-ivory/60">
                    <span className="text-gold-200">{m.authorName}</span>
                    {m.highlight && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-gold-200">
                        <Crown className="h-2.5 w-2.5" /> reine
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ivory/85">{m.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <form
            onSubmit={send}
            className="flex items-center gap-2 border-t border-ivory/10 px-3 py-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                user
                  ? "Écris ton message dans la cour…"
                  : "Connecte-toi pour rejoindre le chat"
              }
              className="input-royal flex-1"
              disabled={!user}
            />
            <button
              type="submit"
              className="btn-royal"
              disabled={!user || !input.trim()}
            >
              <Send className="h-3.5 w-3.5" /> Envoyer
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
