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
import { mergeAttachments } from "../lib/attachmentStore";
import { useAuth } from "./AuthContext";

interface MessagesCtx {
  conversations: ConversationDto[];
  unreadCount: number;
  /** Messages du fil courant (chargé par `openThread`), ordre chronologique. */
  thread: DirectMessageDto[];
  threadOtherId: string | null;
  threadLoading: boolean;
  threadError: string | null;
  /** Indique s'il existe encore des messages plus anciens à charger. */
  threadHasMore: boolean;
  /** En cours de chargement d'une page d'historique. */
  threadLoadingMore: boolean;
  /** Ouvre un fil avec un autre user (charge + marque lus + écoute SSE). */
  openThread: (otherUserId: string) => Promise<void>;
  /** Charge la tranche précédente du fil courant (anciens messages). */
  loadOlderMessages: () => Promise<void>;
  /** Ferme le fil courant (libère la ref interne). */
  closeThread: () => void;
  /** Envoie un message dans le fil courant. Lève en cas d'erreur. */
  sendMessage: (content: string, attachment?: import('../types').MessageAttachment) => Promise<void>;
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
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [threadLoadingMore, setThreadLoadingMore] = useState(false);

  const threadOtherRef = useRef<string | null>(null);
  // Taille de page utilisée pour la pagination. Si le backend renvoie
  // exactement `PAGE_SIZE` messages, on suppose qu'il en reste d'autres
  // à charger.
  const PAGE_SIZE = 200;

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
      setThreadHasMore(false);
      setThreadLoadingMore(false);
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
          setThread((t) => {
            if (t.some((m) => m.id === message.id)) return t;
            const [enriched] = mergeAttachments([message]);
            return [...t, enriched];
          });
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
      setThreadHasMore(false);
      setThreadLoadingMore(false);
      try {
        const rows = await apiGetThread(otherUserId, { limit: PAGE_SIZE });
        // Un switch rapide A → B peut inverser l'ordre d'arrivée des
        // réponses : si on est déjà passé à un autre fil, on ignore cette
        // réponse pour ne pas écraser les messages du fil actuel.
        if (threadOtherRef.current !== otherUserId) return;
        setThread(mergeAttachments(rows));
        // S'il y a exactement une page pleine, on suppose qu'il en
        // reste d'autres à charger (l'UI proposera "Charger plus
        // anciens").
        setThreadHasMore(rows.length >= PAGE_SIZE);
        // Les messages reçus viennent d'être marqués lus côté backend →
        // on resynchronise le badge et la liste.
        await Promise.all([refreshUnread(), refreshConversations()]);
      } catch (err) {
        if (threadOtherRef.current !== otherUserId) return;
        setThread([]);
        setThreadError(
          err instanceof Error ? err.message : "Impossible de charger le fil.",
        );
      } finally {
        if (threadOtherRef.current === otherUserId) {
          setThreadLoading(false);
        }
      }
    },
    [refreshUnread, refreshConversations],
  );

  const loadOlderMessages = useCallback(async () => {
    const otherId = threadOtherRef.current;
    if (!otherId) return;
    // On utilise l'état React courant via une lecture fonctionnelle pour
    // éviter de dépendre d'une closure périmée.
    let oldestId: number | null = null;
    setThread((current) => {
      if (current.length > 0) oldestId = current[0].id;
      return current;
    });
    if (oldestId === null || oldestId <= 0) return;
    setThreadLoadingMore(true);
    try {
      const rows = await apiGetThread(otherId, {
        limit: PAGE_SIZE,
        beforeId: oldestId,
      });
      if (threadOtherRef.current !== otherId) return;
      if (rows.length === 0) {
        setThreadHasMore(false);
        return;
      }
      const enriched = mergeAttachments(rows);
      setThread((current) => {
        const existing = new Set(current.map((m) => m.id));
        const fresh = enriched.filter((m) => !existing.has(m.id));
        return [...fresh, ...current];
      });
      setThreadHasMore(rows.length >= PAGE_SIZE);
    } catch {
      // Silencieux : on n'écrase pas le fil déjà chargé.
    } finally {
      if (threadOtherRef.current === otherId) {
        setThreadLoadingMore(false);
      }
    }
  }, []);

  const closeThread = useCallback(() => {
    threadOtherRef.current = null;
    setThreadOtherId(null);
    setThread([]);
    setThreadError(null);
    setThreadHasMore(false);
    setThreadLoadingMore(false);
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachment?: import('../types').MessageAttachment) => {
      const otherId = threadOtherRef.current;
      if (!otherId) throw new Error("Aucun fil ouvert.");
      const trimmed = content.trim();
      if (!trimmed && !attachment) return;
      // Le backend accepte maintenant un contenu vide quand une pièce
      // jointe est présente (cf. backend.routers.messages). On envoie
      // l'attachment au serveur qui le persiste, donc le destinataire
      // recevra bien le fichier (avant : seul l'émetteur l'avait en
      // localStorage et l'autre voyait `📎 nom.jpeg` en texte).
      const msg = await apiSendMessage(otherId, trimmed, attachment);
      // La réponse serveur contient déjà `attachments` ; on garde
      // l'objet local comme fallback au cas où le backend ne les
      // renverrait pas (ancienne version déployée).
      const msgWithAtt =
        msg.attachments && msg.attachments.length > 0
          ? msg
          : attachment
            ? { ...msg, attachments: [attachment] }
            : msg;
      setThread((t) => (t.some((m) => m.id === msgWithAtt.id) ? t : [...t, msgWithAtt]));
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
      threadHasMore,
      threadLoadingMore,
      openThread,
      loadOlderMessages,
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
      threadHasMore,
      threadLoadingMore,
      openThread,
      loadOlderMessages,
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
