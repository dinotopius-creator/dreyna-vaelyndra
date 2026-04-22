import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Crown, Gift, MessageCircle, Sparkles } from "lucide-react";
import { apiListLiveChat, type LiveChatMessageOut } from "../lib/liveApi";

const MAX_MESSAGES = 80;
const POLL_MS = 1_500;

function isGiftLike(content: string) {
  const lower = content.toLowerCase();
  return (
    lower.includes("a offert") ||
    lower.includes("sylvin") ||
    lower.includes("sort ") ||
    lower.includes("invoque")
  );
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function LiveObsChatOverlay() {
  const { broadcasterId = "" } = useParams<{ broadcasterId?: string }>();
  const [messages, setMessages] = useState<LiveChatMessageOut[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">(
    "loading",
  );
  const lastCreatedAtRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
          const last = incoming[incoming.length - 1];
          lastCreatedAtRef.current = last.created_at;
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

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [broadcasterId]);

  const visibleMessages = useMemo(() => messages.slice(-18), [messages]);

  return (
    <div className="min-h-screen bg-transparent p-4 text-ivory">
      <div className="flex h-[calc(100vh-2rem)] flex-col justify-end">
        <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-gold-300/25 bg-night-950/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-100 backdrop-blur-md">
          <MessageCircle className="h-3.5 w-3.5" />
          Chat Vaelyndra
          <span
            className={
              status === "ready"
                ? "h-2 w-2 rounded-full bg-emerald-400"
                : "h-2 w-2 rounded-full bg-amber-300"
            }
          />
        </div>

        {visibleMessages.length === 0 ? (
          <div className="w-fit max-w-[28rem] rounded-2xl border border-ivory/10 bg-night-950/45 px-4 py-3 text-sm text-ivory/70 backdrop-blur-md">
            {status === "offline"
              ? "Chat en attente du live..."
              : "Les messages du chat apparaitront ici."}
          </div>
        ) : (
          <ul className="flex max-w-[34rem] flex-col gap-2">
            {visibleMessages.map((message) => (
              <li
                key={message.id}
                className={[
                  "rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-md",
                  reduced ? "" : "animate-[fadeIn_220ms_ease-out]",
                  isGiftLike(message.content)
                    ? "border-gold-300/40 bg-gold-500/20 text-gold-50"
                    : message.highlight
                      ? "border-fuchsia-300/35 bg-fuchsia-500/18 text-ivory"
                      : "border-ivory/10 bg-night-950/58 text-ivory",
                ].join(" ")}
              >
                <div className="mb-1 flex items-center gap-2">
                  <img
                    src={message.author_avatar}
                    alt=""
                    className="h-7 w-7 rounded-full border border-gold-300/35 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {message.grade_short && (
                        <span className="rounded bg-gold-500/20 px-1 font-mono text-[10px] font-semibold text-gold-100">
                          [{message.grade_short}]
                        </span>
                      )}
                      <span className="truncate font-semibold text-gold-100">
                        {message.author_name}
                      </span>
                      {message.highlight && (
                        <Crown className="h-3 w-3 text-gold-200" />
                      )}
                      {isGiftLike(message.content) &&
                        (message.content.toLowerCase().includes("a offert") ? (
                          <Gift className="h-3.5 w-3.5 text-gold-100" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-gold-100" />
                        ))}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ivory/45">
                      {formatTime(message.created_at)}
                    </p>
                  </div>
                </div>
                <p className="break-words text-sm leading-snug drop-shadow">
                  {message.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
