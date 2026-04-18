import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Send, Users, Play, Archive, Flame, Heart } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import {
  AUTO_CHAT_LINES,
  DREYNA_PROFILE,
  SEED_CHAT,
} from "../data/mock";
import type { ChatMessage } from "../types";
import { formatDate, formatRelative, generateId } from "../lib/helpers";

const BOT_AUTHORS = [
  { id: "user-lyria", name: "Lyria", avatar: "https://i.pravatar.cc/150?u=lyria" },
  { id: "user-caelum", name: "Caelum", avatar: "https://i.pravatar.cc/150?u=caelum" },
  { id: "user-aeris", name: "Aëris", avatar: "https://i.pravatar.cc/150?u=aeris" },
  { id: "user-sylas", name: "Sylas", avatar: "https://i.pravatar.cc/150?u=sylas" },
  { id: "user-mira", name: "Mira", avatar: "https://i.pravatar.cc/150?u=mira" },
  { id: "user-thalia", name: "Thalia", avatar: "https://i.pravatar.cc/150?u=thalia" },
];

export function Live() {
  const { lives, isLiveOn } = useStore();
  const { user } = useAuth();
  const { notify } = useToast();
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
    if (!isLiveOn) return;
    const t = setInterval(() => {
      const line = AUTO_CHAT_LINES[Math.floor(Math.random() * AUTO_CHAT_LINES.length)];
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
  }, [isLiveOn]);

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
              {isLiveOn ? (
                <>
                  <img
                    src={DREYNA_PROFILE.avatar}
                    alt="Dreyna en live"
                    className="absolute inset-0 h-full w-full scale-105 object-cover blur-sm"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/50 to-transparent" />
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="absolute inset-0 bg-aurora mix-blend-screen"
                  />
                  <div className="absolute inset-0 flex items-end p-6">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />{" "}
                        En direct
                      </span>
                      <h3 className="mt-3 font-display text-2xl text-gold-200 md:text-4xl">
                        Nuit Étoilée · Ouverture de la cour
                      </h3>
                      <p className="mt-1 text-sm text-ivory/70">
                        Avec la reine Dreyna · depuis l'archipel de Vaelyndra
                      </p>
                    </div>
                  </div>
                </>
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

              <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-night-900/70 px-3 py-1.5 text-xs text-ivory/80 backdrop-blur">
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
                {isLiveOn
                  ? "Live actif — le chat est activé automatiquement."
                  : "La reine peut activer le direct depuis la Salle du Trône."}
              </p>
            </div>
          </div>

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
                    <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
                      {formatDate(l.startedAt)} ·{" "}
                      {l.durationMinutes ? `${l.durationMinutes} min` : ""}
                    </p>
                    <h4 className="mt-1 font-display text-base text-gold-200">
                      {l.title}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-xs text-ivory/60">
                      {l.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="card-royal flex h-[620px] flex-col overflow-hidden">
          <div className="border-b border-royal-500/30 p-4">
            <h3 className="font-display text-lg text-gold-200">
              Chat de la cour
            </h3>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
              {isLiveOn ? "Le chat vit avec la reine" : "En veille"}
            </p>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 rounded-xl p-2 ${
                  m.highlight ? "bg-gold-500/10 ring-1 ring-gold-400/40" : ""
                }`}
              >
                <img
                  src={m.authorAvatar}
                  alt={m.authorName}
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-royal-500/40"
                />
                <div className="text-sm">
                  <span
                    className={`font-display text-sm ${
                      m.highlight ? "text-gold-200" : "text-royal-300"
                    }`}
                  >
                    {m.authorName}
                  </span>{" "}
                  <span className="text-xs text-ivory/40">
                    {formatRelative(m.createdAt)}
                  </span>
                  <p className="text-ivory/85">{m.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <form
            onSubmit={send}
            className="flex gap-2 border-t border-royal-500/30 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                user
                  ? `Dites quelque chose à ${DREYNA_PROFILE.username}...`
                  : "Connectez-vous pour chatter..."
              }
              className="glass-input"
            />
            <button type="submit" className="btn-gold">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
