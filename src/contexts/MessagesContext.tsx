import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiGetThread,
  apiGetUnreadCount,
  apiListConversations,
  apiSendMessage,
  apiSubscribeMessages,
  type ConversationDto,
  type DirectMessageDto,
  type MessagesStreamEvent,
} from "../lib/messagesApi";
import { useAuth } from "./AuthContext";

interface MessagesCtx {
  conversations: ConversationDto[];
  unreadCount: number;
  /** Messages du fil courant (chargé par `openThread`), ordre chronologique. */
  thread: DirectMessageDto[];
  threadOtherId: string | null;
  threadLoading: boolean;
  threadError: string | null;
  /** Ouvre un fil avec un autre user (charge + marque lus + écoute SSE). */
  openThread: (otherUserId: string) => Promise<void>;
  /** Ferme le fil courant (libère la ref interne). */
  closeThread: () => void;
  /** Envoie un message dans le fil courant. Lève en cas d'erreur. */
  sendMessage: (content: string) => Promise<void>;
  /** Re-fetch la liste de conversations (ex. pull-to-refresh). */
  refreshConversations: () => Promise<void>;
}

const Ctx = createContext<MessagesCtx | null>(null);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [thread, setThread] = useState<DirectMessageDto[]>([]);
  const [threadOtherId, setThreadOtherId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const threadOtherRef = useRef<string | null>(null);

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    try {
      const list = await apiListConversations();
      setConversations(list);
    } catch {
      // Silencieux : on garde l'état précédent.
    }
  }, [user]);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const n = await apiGetUnreadCount();
      setUnreadCount(n);
    } catch {
      /* idem */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      // Déconnexion : reset synchrone de l'état local pour ne pas laisser
      // fuiter des données DM entre comptes quand on change d'utilisateur.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConversations([]);
      setUnreadCount(0);
      setThread([]);
      setThreadOtherId(null);
      threadOtherRef.current = null;
      return;
    }
    refreshConversations();
    refreshUnread();
  }, [user, refreshConversations, refreshUnread]);

  // Abonnement SSE pour les events temps réel. Tant que l'user est
  // connecté, on garde un flux ouvert et on met à jour les états locaux.
  useEffect(() => {
    if (!user) return;
    const handle = (event: MessagesStreamEvent) => {
      if (event.type === "message") {
        const { message } = event;
        const otherId =
          message.sender_id === user.id
            ? message.recipient_id
            : message.sender_id;
        // Si le fil ouvert correspond, on l'enrichit.
        if (threadOtherRef.current === otherId) {
          setThread((t) =>
            t.some((m) => m.id === message.id) ? t : [...t, message],
          );
        }
        // Incrémente le badge si je reçois un message et que je ne suis pas
        // en train de lire le fil correspondant.
        if (
          message.recipient_id === user.id &&
          threadOtherRef.current !== otherId
        ) {
          setUnreadCount((n) => n + 1);
        }
        // Rafraîchit silencieusement la liste de convos pour que l'aperçu
        // + l'ordre soient à jour.
        refreshConversations();
      } else if (event.type === "read") {
        // L'autre user a lu mes messages → patcher `read_at` dans le thread
        // courant s'il correspond.
        const ids = new Set(event.message_ids);
        setThread((t) =>
          t.map((m) =>
            ids.has(m.id) && m.read_at === null
              ? { ...m, read_at: event.read_at }
              : m,
          ),
        );
      }
    };
    const unsubscribe = apiSubscribeMessages(handle);
    return () => unsubscribe();
  }, [user, refreshConversations]);

  const openThread = useCallback(
    async (otherUserId: string) => {
      threadOtherRef.current = otherUserId;
      setThreadOtherId(otherUserId);
      setThreadLoading(true);
      setThreadError(null);
      try {
        const rows = await apiGetThread(otherUserId);
        setThread(rows);
        // Les messages reçus viennent d'être marqués lus côté backend →
        // on resynchronise le badge et la liste.
        await Promise.all([refreshUnread(), refreshConversations()]);
      } catch (err) {
        setThread([]);
        setThreadError(
          err instanceof Error ? err.message : "Impossible de charger le fil.",
        );
      } finally {
        setThreadLoading(false);
      }
    },
    [refreshUnread, refreshConversations],
  );

  const closeThread = useCallback(() => {
    threadOtherRef.current = null;
    setThreadOtherId(null);
    setThread([]);
    setThreadError(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const otherId = threadOtherRef.current;
      if (!otherId) throw new Error("Aucun fil ouvert.");
      const trimmed = content.trim();
      if (!trimmed) return;
      const msg = await apiSendMessage(otherId, trimmed);
      // Optimisme : on push localement immédiatement. Le serveur va aussi
      // nous renvoyer l'event SSE — on dédoublonne par id.
      setThread((t) => (t.some((m) => m.id === msg.id) ? t : [...t, msg]));
      refreshConversations();
    },
    [refreshConversations],
  );

  const value = useMemo<MessagesCtx>(
    () => ({
      conversations,
      unreadCount,
      thread,
      threadOtherId,
      threadLoading,
      threadError,
      openThread,
      closeThread,
      sendMessage,
      refreshConversations,
    }),
    [
      conversations,
      unreadCount,
      thread,
      threadOtherId,
      threadLoading,
      threadError,
      openThread,
      closeThread,
      sendMessage,
      refreshConversations,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMessages() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMessages must be used in MessagesProvider");
  return ctx;
}
