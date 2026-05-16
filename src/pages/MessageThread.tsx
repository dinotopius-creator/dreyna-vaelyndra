import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Paperclip, X, FileText } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMessages } from "../contexts/MessagesContext";
import { useToast } from "../contexts/ToastContext";
import { apiGetProfile, type UserProfileDto } from "../lib/api";
import { MessageAttachmentPreview } from "../components/MessageAttachmentPreview";
import type { MessageAttachment } from "../types";
import {
  validateFile,
  fileToBase64,
  formatFileSize,
  generateAttachmentId,
  isImageFile,
  FileValidationError,
} from "../lib/fileUtils";
import { moderateFile } from "../lib/contentModeration";

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
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastThreadKeyRef = useRef<string>("");
  const lastMessageCountRef = useRef(0);

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

  function scrollToLatest(behavior: ScrollBehavior = "auto") {
    const list = listRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end", behavior });
        list.scrollTop = list.scrollHeight;
      });
    });
  }

  // Quand on ouvre un nouveau fil, on doit arriver tout en bas, même si
  // le rendu final dépend d'images/pièces jointes mesurées après paint.
  useLayoutEffect(() => {
    const threadKey = thread.map((message) => message.id).join("|");
    const threadChanged = threadKey !== lastThreadKeyRef.current;
    const addedMessages = thread.length > lastMessageCountRef.current;

    if (!threadLoading && (threadChanged || addedMessages)) {
      scrollToLatest(threadChanged ? "auto" : "smooth");
    }

    lastThreadKeyRef.current = threadKey;
    lastMessageCountRef.current = thread.length;
  }, [thread, threadLoading]);

  const otherName = otherProfile?.username ?? "Membre";
  const otherAvatar = otherProfile?.avatarImageUrl ?? "";

  const lastSeen = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      const m = thread[i];
      if (m.sender_id === user?.id && m.read_at) return m.read_at;
    }
    return null;
  }, [thread, user]);

  /** Gestion du fichier sélectionné */
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;

    setAttachmentLoading(true);
    try {
      // 1. Validation (taille, type MIME, extension)
      validateFile(file);

      // 2. Modération du contenu
      const modResult = await moderateFile(file);

      // 3. Conversion base64
      const base64Data = await fileToBase64(file);

      const attachment: MessageAttachment = {
        id: generateAttachmentId(),
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        base64Data,
        createdAt: new Date().toISOString(),
        flagged: modResult.flagged,
      };

      if (modResult.flagged) {
        notify(
          `⚠️ Fichier signalé : ${modResult.reason ?? "contenu potentiellement problématique"}. L'envoi est bloqué.`,
          "error",
        );
        return;
      }

      setPendingAttachment(attachment);
    } catch (err) {
      if (err instanceof FileValidationError) {
        notify(`Fichier invalide : ${err.message}`, "error");
      } else {
        notify("Impossible de charger ce fichier.", "error");
      }
    } finally {
      setAttachmentLoading(false);
    }
  };

  const removePendingAttachment = () => setPendingAttachment(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if ((!content && !pendingAttachment) || sending) return;
    setSending(true);
    try {
      await sendMessage(content, pendingAttachment ?? undefined);
      setDraft("");
      setPendingAttachment(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Envoi impossible.";
      notify(msg, "error");
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  const canSend = (draft.trim().length > 0 || pendingAttachment !== null) && !sending && !attachmentLoading;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col px-0 sm:h-[calc(100vh-4.5rem)] sm:px-5 sm:py-6">
      <header className="flex items-center gap-3 border-b border-royal-500/20 bg-night-800/60 px-3 py-3 sm:rounded-t-2xl sm:px-4">
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
        className="flex-1 overflow-y-auto bg-night-900/40 px-3 py-4 sm:rounded-b-none sm:px-4 sm:py-5"
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
              const attachments = m.attachments ?? [];
              return (
                <li
                  key={m.id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  {/* Pièces jointes */}
                  {attachments.length > 0 && (
                    <div className="mb-1 max-w-[85%] sm:max-w-[78%]">
                      {attachments.map((att) => (
                        <MessageAttachmentPreview key={att.id} attachment={att} />
                      ))}
                    </div>
                  )}

                  {/* Bulle de message (uniquement si du texte réel, pas juste le fallback nom de fichier) */}
                  {m.content && !(attachments.length > 0 && m.content === `📎 ${attachments[0]?.filename}`) && (
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[78%] sm:px-4 ${
                        mine
                          ? "bg-gold-500/15 text-ivory border border-gold-400/40"
                          : "bg-night-800/70 text-ivory border border-royal-500/30"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  )}

                  {/* Horodatage */}
                  <p
                    className={`mt-0.5 text-[10px] px-1 ${
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
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone de composition */}
      <div className="border-t border-royal-500/20 bg-night-800/80 px-4 py-3 sm:rounded-b-2xl">

        {/* Aperçu pièce jointe en attente */}
        {pendingAttachment && (
          <div className="mb-2">
            {isImageFile(pendingAttachment.mimeType) ? (
              <div className="relative inline-block">
                <img
                  src={`data:${pendingAttachment.mimeType};base64,${pendingAttachment.base64Data}`}
                  alt={pendingAttachment.filename}
                  className="max-h-32 rounded-lg border border-gold-400/40 object-cover"
                />
                <button
                  onClick={removePendingAttachment}
                  className="absolute -right-2 -top-2 rounded-full bg-rose-500/90 p-1 text-ivory hover:brightness-110"
                  aria-label="Supprimer la pièce jointe"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-royal-500/30 bg-night-900/60 px-3 py-2">
                <FileText className="h-4 w-4 flex-none text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ivory">{pendingAttachment.filename}</p>
                  <p className="text-[10px] text-ivory/50">{formatFileSize(pendingAttachment.size)}</p>
                </div>
                <button
                  onClick={removePendingAttachment}
                  className="rounded-full bg-rose-500/90 p-1 text-ivory hover:brightness-110"
                  aria-label="Supprimer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Indication de chargement */}
        {attachmentLoading && (
          <div className="mb-2 flex items-center gap-2 text-xs text-ivory/60">
            <span className="animate-spin">✦</span> Analyse du fichier en cours…
          </div>
        )}

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          {/* Bouton trombone */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachmentLoading || sending}
            title="Joindre un fichier (images, PDF, documents — max 10 Mo)"
            className="flex-none rounded-full border border-royal-500/30 p-2 text-ivory/60 transition hover:border-gold-400/60 hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pendingAttachment ? "Ajouter un message (optionnel)…" : "Écrire un message…"}
            maxLength={2000}
            className="flex-1 rounded-full border border-royal-500/30 bg-night-900/60 px-4 py-2.5 text-sm text-ivory placeholder:text-ivory/40 focus:border-gold-400/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold-shine px-4 py-2 text-xs font-semibold text-night-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Envoyer
          </button>
        </form>

        {/* Légende formats acceptés */}
        <p className="mt-1.5 text-[10px] text-ivory/30 text-center">
          Formats acceptés : images (JPG, PNG, GIF, WebP), PDF, TXT, DOC, DOCX, ZIP · Max 10 Mo
        </p>
      </div>
    </div>
  );
}
