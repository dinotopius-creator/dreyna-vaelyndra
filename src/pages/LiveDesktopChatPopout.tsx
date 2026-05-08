import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, MessageCircle, Send, Users } from "lucide-react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiGetProfile } from "../lib/api";
import { generateId } from "../lib/helpers";
import {
  subscribeCrossWindowLiveChat,
  subscribeCrossWindowLiveViewers,
} from "../lib/liveChatBus";
import {
  apiListLiveChat,
  apiPostLiveChat,
  type LiveChatMessageOut,
} from "../lib/liveApi";
import type { LiveViewerSummary } from "../types";

const MAX_MESSAGES = 120;
const POLL_MS = 1_500;

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function LiveDesktopChatPopout() {
  const { broadcasterId = "" } = useParams<{ broadcasterId?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<LiveChatMessageOut[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">(
    "loading",
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [myGradeShort, setMyGradeShort] = useState<string | null>(null);
  const [viewers, setViewers] = useState<LiveViewerSummary[]>([]);
  const [isViewerListOpen, setIsViewerListOpen] = useState(false);
  const lastCreatedAtRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
  const isStreamerPopout = !!user?.id && user.id === broadcasterId;

  useEffect(() => {
    document.title = "Vaelyndra Live Chat";
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    apiGetProfile(user.id)
      .then((profile) => {
        if (!cancelled) setMyGradeShort(profile.grade?.short ?? null);
      })
      .catch(() => {
        if (!cancelled) setMyGradeShort(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!broadcasterId) return;
    let cancelled = false;

    async function tick() {
      try {
        const incoming = await apiListLiveChat({
          broadcasterId,
          after: lastCreatedAtRef.current,
          limit: MAX_MESSAGES,
        });
        if (cancelled) return;
        if (incoming.length > 0) {
          lastCreatedAtRef.current = incoming[incoming.length - 1].created_at;
          setMessages((current) => {
            const next = [...current];
            incoming.forEach((message) => {
              if (seenIdsRef.current.has(message.id)) return;
              seenIdsRef.current.add(message.id);
              next.push(message);
            });
            return next.slice(-MAX_MESSAGES);
          });
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [broadcasterId]);

  useEffect(() => {
    if (!broadcasterId) return;
    const unsubscribe = subscribeCrossWindowLiveChat((payload) => {
      if (payload.broadcasterId !== broadcasterId) return;
      setMessages((current) => {
        if (seenIdsRef.current.has(payload.message.id)) return current;
        seenIdsRef.current.add(payload.message.id);
        const nextMessage: LiveChatMessageOut = {
          id: payload.message.id,
          broadcaster_id: broadcasterId,
          author_id: payload.message.authorId,
          author_name: payload.message.authorName,
          author_avatar: payload.message.authorAvatar,
          content: payload.message.content,
          created_at: payload.message.createdAt,
          highlight: payload.message.highlight ?? false,
          grade_short: payload.message.gradeShort ?? null,
        };
        return [...current, nextMessage].slice(-MAX_MESSAGES);
      });
      lastCreatedAtRef.current = payload.message.createdAt;
      setStatus("ready");
    });
    return () => {
      unsubscribe?.();
    };
  }, [broadcasterId]);

  useEffect(() => {
    if (!broadcasterId || !isStreamerPopout) {
      setViewers([]);
      setIsViewerListOpen(false);
      return;
    }
    const unsubscribe = subscribeCrossWindowLiveViewers(
      broadcasterId,
      (payload) => {
        setViewers(payload.viewers);
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [broadcasterId, isStreamerPopout]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const visibleMessages = useMemo(() => messages.slice(-MAX_MESSAGES), [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || !broadcasterId || !user || sending) return;
    setSending(true);
    try {
      const created = await apiPostLiveChat({
        broadcasterId,
        content: value,
        clientId: generateId("msg"),
        gradeShort: myGradeShort,
      });
      setMessages((current) => {
        if (seenIdsRef.current.has(created.id)) return current;
        seenIdsRef.current.add(created.id);
        return [...current, created].slice(-MAX_MESSAGES);
      });
      lastCreatedAtRef.current = created.created_at;
      setInput("");
      setStatus("ready");
    } catch {
      setStatus("offline");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_38%),linear-gradient(180deg,#120f1f_0%,#09070f_100%)] text-ivory">
      <header className="flex items-center gap-3 border-b border-gold-400/20 bg-night-950/70 px-4 py-3 backdrop-blur-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-400/35 bg-gold-500/10 text-gold-200">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg text-gold-100">
            Chat live Vaelyndra
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ivory/45">
            Fenetre pop-out PC
          </p>
        </div>
        {isStreamerPopout ? (
          <button
            type="button"
            onClick={() => setIsViewerListOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-ivory/10 bg-night-900/55 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold-300/40 hover:text-gold-200"
            aria-label={
              isViewerListOpen
                ? "Masquer les spectateurs du live"
                : "Afficher les spectateurs du live"
            }
            aria-pressed={isViewerListOpen}
            title="Voir qui regarde le live"
          >
            <Users className="h-3.5 w-3.5 text-gold-300" />
            {viewers.length}
          </button>
        ) : null}
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            status === "ready" ? "bg-emerald-400" : "bg-amber-300"
          }`}
          aria-label={status === "ready" ? "Connecte" : "En attente"}
          title={status === "ready" ? "Connecte" : "En attente"}
        />
      </header>

      {isStreamerPopout && isViewerListOpen ? (
        <div className="border-b border-gold-400/15 bg-night-950/70 px-3 py-3 backdrop-blur-md">
          {viewers.length === 0 ? (
            <p className="rounded-xl border border-ivory/10 bg-night-900/55 px-3 py-3 text-xs text-ivory/60">
              Aucun viewer humain connecté pour le moment.
            </p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {viewers.map((viewer) => (
                <div
                  key={viewer.userId}
                  className="flex items-center gap-3 rounded-xl border border-ivory/10 bg-night-900/55 px-3 py-2"
                >
                  <img
                    src={viewer.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full border border-gold-300/25 object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gold-100">
                      {viewer.username}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ivory/45">
                      Regarde le live
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
        style={{ overscrollBehavior: "contain" }}
      >
        {visibleMessages.length === 0 ? (
          <div className="rounded-2xl border border-ivory/10 bg-night-950/45 px-4 py-3 text-sm text-ivory/70 backdrop-blur-md">
            {status === "offline"
              ? "Connexion au chat en attente..."
              : "Les messages apparaitront ici pendant le live."}
          </div>
        ) : (
          visibleMessages.map((message) => (
            <article
              key={message.id}
              className={`rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-md ${
                message.highlight
                  ? "border-gold-300/35 bg-gold-500/16"
                  : "border-ivory/10 bg-night-950/58"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <img
                  src={message.author_avatar}
                  alt=""
                  className="h-8 w-8 rounded-full border border-gold-300/30 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {message.grade_short ? (
                      <span className="rounded bg-gold-500/20 px-1 font-mono text-[10px] font-semibold text-gold-100">
                        [{message.grade_short}]
                      </span>
                    ) : null}
                    <span className="truncate font-semibold text-gold-100">
                      {message.author_name}
                    </span>
                    {message.highlight ? (
                      <Crown className="h-3 w-3 text-gold-200" />
                    ) : null}
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ivory/45">
                    {formatTime(message.created_at)}
                  </p>
                </div>
              </div>
              <p className="break-words text-sm leading-snug text-ivory/95">
                {message.content}
              </p>
            </article>
          ))
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-gold-400/15 bg-night-950/75 px-3 py-3 backdrop-blur-md"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            user ? "Ecris dans le chat..." : "Connecte-toi pour ecrire..."
          }
          maxLength={240}
          disabled={!user || sending}
          className="flex-1 rounded-full border border-ivory/10 bg-night-900/75 px-4 py-2 text-sm text-ivory outline-none placeholder:text-ivory/35 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!user || !input.trim() || sending}
          className="inline-flex items-center gap-1 rounded-full bg-gold-shine px-4 py-2 text-sm font-semibold text-night-950 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
