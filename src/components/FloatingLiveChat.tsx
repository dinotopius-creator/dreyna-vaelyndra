/**
 * Chat flottant global, visible dès que l'utilisateur est en train de
 * broadcaster (`config.status === "live"` côté LiveContext), quelle que
 * soit la page actuellement ouverte. But : permettre au streamer de
 * quitter la page Live pour aller sur la boutique, son profil, les
 * messages… sans perdre de vue le chat de son propre live.
 *
 * UX :
 *  - Fenêtre flottante draggable (souris ET tactile, via PointerEvents)
 *    sur n'importe quelle zone de l'écran. Position persistée en
 *    localStorage pour rester à l'endroit choisi entre deux sessions.
 *  - Bouton "minimiser" qui réduit la fenêtre en pastille ronde avec
 *    compteur de messages non lus, cliquable pour rouvrir.
 *  - Bouton "masquer ce live" pour se débarrasser de l'overlay pendant
 *    cette session de stream précise (réapparaît au prochain go live).
 *  - Le champ input partage exactement la même API `publishChatMessage`
 *    que le chat intégré à la page Live (dédup côté consumers grâce à
 *    l'id unique du message), donc aucune divergence possible.
 *
 * Ce composant doit être monté au niveau racine (App.tsx) pour
 * persister à travers les navigations React Router.
 *
 * Séparation `FloatingLiveChat` / `FloatingLiveChatSession` : la
 * première fait le gating (user connecté + live en cours) et re-monte
 * la seconde avec un `key` lié à `startedAt` pour que tout l'état
 * interne (messages, compteur de non-lus, état masqué/minimisé) soit
 * fraîchement initialisé à chaque nouveau stream sans avoir à reset
 * manuellement dans un effect (le lint rule `react-hooks/
 * set-state-in-effect` interdit ce pattern).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, MessageSquare, Minus, Send, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { generateId } from "../lib/helpers";
import type { ChatMessage } from "../types";

const POSITION_STORAGE_KEY = "vaelyndra_floating_live_chat_pos";
const MINIMIZED_STORAGE_KEY = "vaelyndra_floating_live_chat_min";
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 420;
const MINI_SIZE = 56;
// Distance minimum d'un bord qu'on laisse toujours visible quand on
// drag près du bord : évite que le user "perde" le panneau en le
// draguant hors écran.
const CLAMP_MARGIN = 40;
// Nombre max de messages gardés en mémoire dans l'overlay. Au-delà,
// on fait sauter les plus vieux pour que la liste reste scrollable
// sans exploser en RAM même sur un live de 4 h.
const MAX_HISTORY = 200;

interface Position {
  x: number;
  y: number;
}

function readPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function readMinimized(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MINIMIZED_STORAGE_KEY) === "1";
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  // Bas-droite de l'écran par défaut (comme demandé par Alexandre).
  return {
    x: Math.max(16, window.innerWidth - PANEL_WIDTH - 24),
    y: Math.max(16, window.innerHeight - PANEL_HEIGHT - 96),
  };
}

function clampPosition(
  pos: Position,
  width: number,
  height: number,
): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - CLAMP_MARGIN;
  const maxY = window.innerHeight - height;
  const minX = CLAMP_MARGIN - width;
  const minY = 0;
  return {
    x: Math.min(Math.max(pos.x, minX), maxX),
    y: Math.min(Math.max(pos.y, minY), maxY),
  };
}

export function FloatingLiveChat() {
  const { user } = useAuth();
  const { config } = useLive();
  const isBroadcasting = config.status === "live";
  if (!isBroadcasting || !user) return null;
  // `startedAt` change à chaque nouveau stream → remount complet de
  // la session (état interne réinitialisé "gratuitement" par React,
  // sans setState-in-effect).
  return <FloatingLiveChatSession key={config.startedAt ?? "session"} />;
}

function FloatingLiveChatSession() {
  const { user } = useAuth();
  const { publishChatMessage, subscribeChatMessages } = useLive();

  const [position, setPosition] = useState<Position>(() => {
    const stored = readPosition();
    const initial = stored ?? defaultPosition();
    return clampPosition(initial, PANEL_WIDTH, PANEL_HEIGHT);
  });
  const [minimized, setMinimized] = useState<boolean>(() => readMinimized());
  // Masquage one-shot : le user a cliqué sur ✕, on cache jusqu'à la
  // prochaine session (= prochain remount via le `key={startedAt}`).
  const [hiddenForSession, setHiddenForSession] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  // Ref miroir sur `minimized` pour que le callback de subscription,
  // stable entre les renders, puisse lire la valeur courante sans
  // déclencher une re-subscription à chaque toggle.
  const minimizedRef = useRef(minimized);
  useEffect(() => {
    minimizedRef.current = minimized;
  }, [minimized]);

  // Abonnement aux messages du live : mêmes messages que ceux affichés
  // par le composant `LiveChatHistory` sur la page Live.
  useEffect(() => {
    const unsub = subscribeChatMessages((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].slice(-MAX_HISTORY);
      });
      if (minimizedRef.current) setUnread((n) => n + 1);
    });
    return unsub;
  }, [subscribeChatMessages]);

  // Reclamp quand la fenêtre du navigateur est redimensionnée (ex :
  // orientation mobile qui tourne, ou fenêtre PC réduite) — sinon le
  // panneau peut se retrouver hors écran et devenir inaccessible.
  useEffect(() => {
    function handleResize() {
      setPosition((prev) => clampPosition(prev, PANEL_WIDTH, PANEL_HEIGHT));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Persiste la position à chaque changement stable.
  useEffect(() => {
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      /* quota / mode privé : pas grave */
    }
  }, [position]);

  useEffect(() => {
    try {
      localStorage.setItem(MINIMIZED_STORAGE_KEY, minimized ? "1" : "0");
    } catch {
      /* idem */
    }
  }, [minimized]);

  // ─── Drag (pointer events = souris + tactile unifié) ───
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Ne commence un drag que si la cible est le handle : évite de
    // drager quand on clique dans le champ texte ou sur un bouton.
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - position.x,
      offsetY: e.clientY - position.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const nextWidth = minimized ? MINI_SIZE : PANEL_WIDTH;
    const nextHeight = minimized ? MINI_SIZE : PANEL_HEIGHT;
    setPosition(
      clampPosition(
        { x: e.clientX - state.offsetX, y: e.clientY - state.offsetY },
        nextWidth,
        nextHeight,
      ),
    );
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pas de capture active, pas grave */
    }
  }

  function toggleMinimized() {
    setMinimized((v) => {
      if (v) setUnread(0);
      return !v;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || !user) return;
    publishChatMessage({
      id: generateId("msg"),
      authorId: user.id,
      authorName: user.username,
      authorAvatar: user.avatar,
      content: value,
      createdAt: new Date().toISOString(),
      highlight: false,
    });
    setInput("");
  }

  const sortedMessages = useMemo(
    () => messages.slice(-MAX_HISTORY),
    [messages],
  );

  if (!user || hiddenForSession) return null;

  // ─── Mode pastille (minimisé) ───
  if (minimized) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Ouvrir le chat du live"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={toggleMinimized}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggleMinimized();
        }}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          zIndex: 2147483000,
          touchAction: "none",
        }}
        className="flex h-14 w-14 cursor-grab items-center justify-center rounded-full border border-gold-400/60 bg-night-900/85 text-gold-200 shadow-2xl backdrop-blur-md active:cursor-grabbing"
      >
        <MessageSquare className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-night-900 bg-rose-500 px-1 text-[10px] font-bold text-ivory">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
    );
  }

  // ─── Mode panneau ouvert ───
  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        zIndex: 2147483000,
      }}
      className="flex flex-col overflow-hidden rounded-2xl border border-gold-400/30 bg-night-900/92 text-ivory shadow-2xl backdrop-blur-md"
    >
      {/* Barre de drag : cible unique des PointerEvents pour le drag.
          touchAction=none empêche le scroll de la page pendant le swipe
          mobile. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: "none" }}
        className="flex cursor-grab items-center gap-2 border-b border-ivory/10 bg-gradient-to-r from-gold-500/15 to-transparent px-3 py-2 active:cursor-grabbing"
      >
        <MessageSquare className="h-4 w-4 text-gold-300" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-display text-sm text-gold-200">
            Chat de ton live
          </span>
          <span className="truncate text-[10px] text-ivory/50">
            {sortedMessages.length} message
            {sortedMessages.length > 1 ? "s" : ""} · déplace-moi où tu veux
          </span>
        </div>
        <button
          type="button"
          onClick={toggleMinimized}
          data-no-drag
          className="rounded-full p-1 text-ivory/60 transition hover:bg-ivory/10 hover:text-ivory"
          aria-label="Réduire"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setHiddenForSession(true)}
          data-no-drag
          className="rounded-full p-1 text-ivory/60 transition hover:bg-rose-500/20 hover:text-rose-200"
          aria-label="Fermer pour ce live"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Liste des messages (scroll interne). overscrollBehavior=contain
          empêche le scroll du chat de "fuir" vers la page en-dessous. */}
      <div
        data-no-drag
        style={{ overscrollBehavior: "contain" }}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm"
      >
        {sortedMessages.length === 0 && (
          <p className="py-6 text-center text-xs text-ivory/40">
            En attente du premier message…
          </p>
        )}
        {sortedMessages.map((m) => (
          <FloatingChatRow key={m.id} msg={m} />
        ))}
      </div>

      {/* Champ d'envoi — même API que le chat intégré à la page Live. */}
      <form
        onSubmit={submit}
        data-no-drag
        className="flex items-center gap-2 border-t border-ivory/10 bg-night-900/60 px-2 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Réponds à ton chat…"
          className="flex-1 rounded-full bg-night-900/70 px-3 py-1.5 text-sm text-ivory outline-none placeholder:text-ivory/40"
          maxLength={240}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-gold-shine px-3 py-1.5 text-xs font-semibold text-night-900 disabled:opacity-40"
          aria-label="Envoyer"
        >
          <Send className="h-3 w-3" />
        </button>
      </form>
    </div>
  );
}

function FloatingChatRow({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-start gap-2">
      <img
        src={msg.authorAvatar}
        alt=""
        className="h-6 w-6 flex-none rounded-full border border-gold-400/30 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] text-ivory/55">
          <span className="truncate font-semibold text-gold-200">
            {msg.authorName}
          </span>
          {msg.highlight && (
            <Crown className="h-2.5 w-2.5 flex-none text-gold-300" />
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-ivory/95">
          {msg.content}
        </p>
      </div>
    </div>
  );
}
