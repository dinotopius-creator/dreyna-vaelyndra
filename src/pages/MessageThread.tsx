import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMessages } from "../contexts/MessagesContext";
import { useToast } from "../contexts/ToastContext";
import { apiGetProfile, type UserProfileDto } from "../lib/api";

function formatHourMinute(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MessageThread() {
  const { userId = "" } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const {
    thread,
    threadLoading,
    threadError,
    openThread,
    closeThread,
    sendMessage,
  } = useMessages();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [otherProfile, setOtherProfile] = useState<UserProfileDto | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/connexion", { replace: true });
      return;
    }
    if (!userId || userId === user.id) {
      navigate("/messages", { replace: true });
      return;
    }
    openThread(userId);
    apiGetProfile(userId)
      .then((p) => setOtherProfile(p))
      .catch(() => setOtherProfile(null));
    return () => {
      closeThread();
    };
  }, [user, userId, navigate, openThread, closeThread]);

  // Auto-scroll vers le bas à chaque nouveau message du fil.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const otherName = otherProfile?.username ?? "Membre";
  const otherAvatar = otherProfile?.avatarImageUrl ?? "";

  const lastSeen = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      const m = thread[i];
      if (m.sender_id === user?.id && m.read_at) return m.read_at;
    }
    return null;
  }, [thread, user]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendMessage(content);
      setDraft("");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Envoi impossible.";
      notify(msg, "error");
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto flex h-[calc(100vh-4.5rem)] max-w-3xl flex-col px-0 sm:px-5 sm:py-6">
      <header className="flex items-center gap-3 border-b border-royal-500/20 bg-night-800/60 px-4 py-3 sm:rounded-t-2xl">
        <Link
          to="/messages"
          className="rounded-full border border-royal-500/30 p-2 text-ivory/70 hover:text-gold-200"
          aria-label="Retour aux conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link
          to={`/u/${encodeURIComponent(userId)}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {otherAvatar ? (
            <img
              src={otherAvatar}
              alt={otherName}
              className="h-10 w-10 rounded-full border border-gold-400/30 object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full border border-gold-400/30 bg-night-700" />
          )}
          <div className="min-w-0">
            <p className="truncate font-regal text-sm font-semibold text-ivory">
              {otherName}
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-ivory/50">
              Conversation privée
            </p>
          </div>
        </Link>
      </header>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto bg-night-900/40 px-4 py-5 sm:rounded-b-none"
      >
        {threadLoading && thread.length === 0 ? (
          <p className="text-center text-xs text-ivory/50">Chargement…</p>
        ) : threadError ? (
          <p className="text-center text-xs text-rose-300/80">{threadError}</p>
        ) : thread.length === 0 ? (
          <p className="mt-10 text-center text-xs text-ivory/50">
            Début de la conversation. Envoie le premier message !
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.map((m) => {
              const mine = m.sender_id === user.id;
              const showReadBelow =
                mine && m.read_at !== null && m.read_at === lastSeen;
              return (
                <li
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-gold-500/15 text-ivory border border-gold-400/40"
                        : "bg-night-800/70 text-ivory border border-royal-500/30"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        mine ? "text-gold-100/70" : "text-ivory/50"
                      }`}
                    >
                      {formatHourMinute(m.created_at)}
                      {mine &&
                        (showReadBelow
                          ? ` · Vu à ${formatHourMinute(m.read_at ?? "")}`
                          : m.read_at === null
                            ? " · Envoyé"
                            : "")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-royal-500/20 bg-night-800/80 px-4 py-3 sm:rounded-b-2xl"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Écrire un message…"
          maxLength={2000}
          className="flex-1 rounded-full border border-royal-500/30 bg-night-900/60 px-4 py-2 text-sm text-ivory placeholder:text-ivory/40 focus:border-gold-400/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-gold-shine px-4 py-2 text-xs font-semibold text-night-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Envoyer
        </button>
      </form>
    </div>
  );
}
