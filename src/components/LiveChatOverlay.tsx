/**
 * Chat flottant style TikTok / Twitch : les messages apparaissent en
 * surimpression sur le flux, en bas à gauche, et disparaissent tout
 * seuls au bout de `DISPLAY_MS`. On n'affiche au maximum que
 * `MAX_VISIBLE` messages pour éviter de masquer le flux.
 *
 * Le champ de saisie reste intégré à l'overlay pour rester collé au
 * flux (plus de panneau latéral).
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Send } from "lucide-react";
import type { ChatMessage } from "../types";
import { getOfficial } from "../data/officials";
import { CREATURES } from "../data/creatures";

const DISPLAY_MS = 7000;
const MAX_VISIBLE = 6;

interface Props {
  messages: ChatMessage[];
  /** ID "system" utilisé pour marquer les annonces (cœur, cadeau, sort). */
  systemAuthorId: string;
  /** Callback d'envoi du message courant (géré par le parent). */
  onSend: (content: string) => void;
  canSend: boolean;
  placeholder: string;
}

interface VisibleMessage extends ChatMessage {
  /** Timestamp d'apparition côté client (pour le TTL visuel). */
  seenAt: number;
}

export function LiveChatOverlay({
  messages,
  systemAuthorId,
  onSend,
  canSend,
  placeholder,
}: Props) {
  const [visible, setVisible] = useState<VisibleMessage[]>([]);
  const [input, setInput] = useState("");

  // Quand un nouveau message arrive, on l'ajoute à la file visible. On
  // trim à MAX_VISIBLE pour empêcher le flood de remplir tout le cadre.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    setVisible((prev) => {
      if (prev.some((m) => m.id === last.id)) return prev;
      return [...prev, { ...last, seenAt: Date.now() }].slice(-MAX_VISIBLE);
    });
  }, [messages]);

  // TTL : on balaye toutes les 500 ms et on retire ce qui est trop vieux.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - DISPLAY_MS;
      setVisible((prev) => prev.filter((m) => m.seenAt >= cutoff));
    }, 500);
    return () => clearInterval(t);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <>
      {/* File de messages flottants en bas-gauche du flux. */}
      {/* Sur mobile, on contraint la hauteur à 40% de la carte pour
          laisser la vidéo respirer ; sur sm+, on autorise 55% comme
          avant. Le masquage complet du chat reste accessible via le
          bouton dédié dans la barre d'outils du lecteur. */}
      <div className="pointer-events-none absolute bottom-20 left-3 right-3 z-10 flex max-h-[40%] flex-col justify-end gap-2 sm:bottom-24 sm:left-4 sm:right-auto sm:max-h-[55%] sm:max-w-[60%]">
        <AnimatePresence initial={false}>
          {visible.map((m) => (
            <FloatingChatLine
              key={m.id}
              msg={m}
              isSystem={m.authorId === systemAuthorId}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Champ de saisie intégré au bas de l'overlay — pointer-events:auto
          pour qu'on puisse cliquer dedans. */}
      <form
        onSubmit={submit}
        className="pointer-events-auto absolute bottom-4 left-4 right-4 z-20 flex items-center gap-2 rounded-full border border-ivory/10 bg-night-900/60 px-2 py-1.5 backdrop-blur"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-2 text-sm text-ivory outline-none placeholder:text-ivory/40"
          disabled={!canSend}
          maxLength={240}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-full bg-gold-shine px-3 py-1 text-xs font-semibold text-night-900 disabled:opacity-40"
          disabled={!canSend || !input.trim()}
          aria-label="Envoyer"
        >
          <Send className="h-3 w-3" /> Envoyer
        </button>
      </form>
    </>
  );
}

function FloatingChatLine({
  msg,
  isSystem,
}: {
  msg: ChatMessage;
  isSystem: boolean;
}) {
  const official = useMemo(() => getOfficial(msg.authorId), [msg.authorId]);
  const creature = useMemo(
    () =>
      official ? CREATURES.find((c) => c.id === official.creatureId) : null,
    [official],
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={
        "pointer-events-none flex items-start gap-2 rounded-2xl px-3 py-1.5 backdrop-blur-md" +
        (isSystem
          ? " border border-gold-400/40 bg-gold-500/15 text-gold-100"
          : msg.highlight
            ? " border border-gold-400/30 bg-gold-500/10 text-ivory"
            : " bg-night-900/55 text-ivory/95")
      }
    >
      <img
        src={msg.authorAvatar}
        alt=""
        className="h-6 w-6 flex-none rounded-full border border-gold-400/30 object-cover"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-ivory/65">
          <span className="font-semibold text-gold-200">{msg.authorName}</span>
          {official?.role === "admin" && (
            <span className="inline-flex items-center rounded-full bg-gold-500/30 px-1 text-[9px] text-gold-100">
              <Crown className="mr-0.5 h-2 w-2" /> admin
            </span>
          )}
          {official?.role === "animator" && (
            <span className="rounded-full bg-fuchsia-500/30 px-1 text-[9px] text-fuchsia-100">
              🎭 animateur·ice
            </span>
          )}
          {creature && (
            <span className="text-[10px]" aria-hidden>
              {creature.icon}
            </span>
          )}
          {msg.highlight && !official && (
            <span className="inline-flex items-center rounded-full bg-gold-500/20 px-1 text-[9px] text-gold-200">
              <Crown className="mr-0.5 h-2 w-2" /> reine
            </span>
          )}
        </div>
        <p className="break-words text-sm leading-snug">{msg.content}</p>
      </div>
    </motion.div>
  );
}
