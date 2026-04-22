import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useStore } from "./StoreContext";
import { useToast } from "./ToastContext";
import type { CommunityPost, User } from "../types";

export type NotificationKind =
  | "community_like"
  | "community_comment"
  | "community_mention"
  | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  url?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
}

export interface NotificationPreferences {
  inApp: boolean;
  browser: boolean;
  communityLikes: boolean;
  communityComments: boolean;
  mentions: boolean;
}

interface NotificationInput {
  id?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
}

interface NotificationsCtx {
  notifications: AppNotification[];
  unreadCount: number;
  preferences: NotificationPreferences;
  permission: NotificationPermission | "unsupported";
  pushNotification: (input: NotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotification: (id: string) => void;
  updatePreferences: (patch: Partial<NotificationPreferences>) => void;
  requestBrowserPermission: () => Promise<
    NotificationPermission | "unsupported"
  >;
}

const Ctx = createContext<NotificationsCtx | null>(null);

const DEFAULT_PREFERENCES: NotificationPreferences = {
  inApp: true,
  browser: false,
  communityLikes: true,
  communityComments: true,
  mentions: true,
};

const MAX_NOTIFICATIONS = 80;

function notificationsKey(userId: string) {
  return `vaelyndra_notifications_v1:${userId}`;
}

function preferencesKey(userId: string) {
  return `vaelyndra_notification_preferences_v1:${userId}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) ? parsed : ({ ...fallback, ...parsed } as T);
  } catch {
    return fallback;
  }
}

function getPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function normalizeToken(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_.-]/g, "");
}

function contentMentionsUser(content: string, user: User) {
  const targets = new Set(
    [user.handle, user.username, user.username.replace(/\s+/g, "")]
      .map(normalizeToken)
      .filter(Boolean),
  );
  if (targets.size === 0) return false;
  const matches = content.matchAll(/@([a-zA-Z0-9_.-]{2,40})/g);
  for (const match of matches) {
    if (targets.has(normalizeToken(match[1]))) return true;
  }
  return false;
}

function nameFor(
  userId: string,
  usersById: Map<string, User>,
  fallback = "Quelqu'un",
) {
  return usersById.get(userId)?.username ?? fallback;
}

function avatarFor(userId: string, usersById: Map<string, User>) {
  return usersById.get(userId)?.avatar;
}

function collectCommunityEvents(
  posts: CommunityPost[],
  currentUser: User,
  usersById: Map<string, User>,
) {
  const events: NotificationInput[] = [];

  posts.forEach((post) => {
    const postUrl = `/communaute#post-${post.id}`;

    if (post.authorId === currentUser.id) {
      Object.entries(post.reactions).forEach(([emoji, userIds]) => {
        userIds
          .filter((reactorId) => reactorId !== currentUser.id)
          .forEach((reactorId) => {
            const actorName = nameFor(reactorId, usersById);
            events.push({
              id: `community-like:${post.id}:${emoji}:${reactorId}`,
              kind: "community_like",
              title: "Nouveau like sur ta publication",
              body: `${actorName} a reagit ${emoji} a ta publication.`,
              url: postUrl,
              actorId: reactorId,
              actorName,
              actorAvatar: avatarFor(reactorId, usersById),
            });
          });
      });
    }

    if (
      post.authorId !== currentUser.id &&
      contentMentionsUser(post.content, currentUser)
    ) {
      events.push({
        id: `community-mention:${post.id}:${post.authorId}:${post.createdAt}`,
        kind: "community_mention",
        title: "Tu as ete identifie",
        body: `${post.authorName} t'a identifie dans une publication.`,
        url: postUrl,
        actorId: post.authorId,
        actorName: post.authorName,
        actorAvatar: post.authorAvatar,
      });
    }

    post.comments.forEach((comment) => {
      if (comment.authorId === currentUser.id) return;

      if (post.authorId === currentUser.id) {
        events.push({
          id: `community-comment:${post.id}:${comment.id}`,
          kind: "community_comment",
          title: "Nouveau commentaire",
          body: `${comment.authorName} a commente ta publication.`,
          url: postUrl,
          actorId: comment.authorId,
          actorName: comment.authorName,
          actorAvatar: comment.authorAvatar,
        });
      }

      if (contentMentionsUser(comment.content, currentUser)) {
        events.push({
          id: `community-comment-mention:${post.id}:${comment.id}`,
          kind: "community_mention",
          title: "Tu as ete identifie",
          body: `${comment.authorName} t'a identifie en commentaire.`,
          url: postUrl,
          actorId: comment.authorId,
          actorName: comment.authorName,
          actorAvatar: comment.authorAvatar,
        });
      }
    });
  });

  return events;
}

function isKindEnabled(
  kind: NotificationKind,
  preferences: NotificationPreferences,
) {
  if (kind === "community_like") return preferences.communityLikes;
  if (kind === "community_comment") return preferences.communityComments;
  if (kind === "community_mention") return preferences.mentions;
  return true;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, users } = useAuth();
  const { posts } = useStore();
  const { notify } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => getPermission());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedUserRef = useRef<string | null>(null);

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setPreferences(DEFAULT_PREFERENCES);
      seenEventIdsRef.current = new Set();
      bootstrappedUserRef.current = null;
      return;
    }

    const savedNotifications = readJson<AppNotification[]>(
      notificationsKey(user.id),
      [],
    );
    const savedPreferences = readJson<NotificationPreferences>(
      preferencesKey(user.id),
      DEFAULT_PREFERENCES,
    );
    setNotifications(savedNotifications);
    setPreferences(savedPreferences);
    seenEventIdsRef.current = new Set(
      savedNotifications.map((item) => item.id),
    );
    bootstrappedUserRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        notificationsKey(user.id),
        JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)),
      );
    } catch {
      // Le centre reste disponible en memoire si le stockage local refuse.
    }
  }, [notifications, user]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        preferencesKey(user.id),
        JSON.stringify(preferences),
      );
    } catch {
      // Preferences best-effort.
    }
  }, [preferences, user]);

  const emitBrowserNotification = useCallback(
    (notification: AppNotification) => {
      if (!preferences.browser) return;
      if (getPermission() !== "granted") return;

      try {
        const systemNotification = new Notification(notification.title, {
          body: notification.body,
          icon: notification.actorAvatar || "/favicon.svg",
          tag: notification.id,
          data: { url: notification.url },
        });
        systemNotification.onclick = () => {
          window.focus();
          if (notification.url) window.location.assign(notification.url);
          systemNotification.close();
        };
      } catch {
        // Certains WebViews mobiles exposent l'API sans autoriser l'affichage.
      }
    },
    [preferences.browser],
  );

  const pushNotification = useCallback(
    (input: NotificationInput) => {
      if (!preferences.inApp && !preferences.browser) return;
      if (!isKindEnabled(input.kind, preferences)) return;

      const notification: AppNotification = {
        ...input,
        id: input.id ?? `notification:${input.kind}:${Date.now()}`,
        createdAt: new Date().toISOString(),
      };

      if (preferences.inApp) {
        setNotifications((current) => {
          if (current.some((item) => item.id === notification.id))
            return current;
          return [notification, ...current].slice(0, MAX_NOTIFICATIONS);
        });
        notify(notification.title, "info");
      }

      emitBrowserNotification(notification);
    },
    [emitBrowserNotification, notify, preferences],
  );

  useEffect(() => {
    if (!user) return;
    const usersById = new Map(users.map((member) => [member.id, member]));
    const events = collectCommunityEvents(posts, user, usersById);

    if (bootstrappedUserRef.current !== user.id) {
      seenEventIdsRef.current = new Set([
        ...Array.from(seenEventIdsRef.current),
        ...events
          .map((event) => event.id)
          .filter((id): id is string => Boolean(id)),
      ]);
      bootstrappedUserRef.current = user.id;
      return;
    }

    events.forEach((event) => {
      if (!event.id || seenEventIdsRef.current.has(event.id)) return;
      seenEventIdsRef.current.add(event.id);
      pushNotification(event);
    });
  }, [posts, pushNotification, user, users]);

  const markRead = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id && !item.readAt
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: now })),
    );
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      setPreferences((current) => ({ ...current, ...patch }));
    },
    [],
  );

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported";
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      setPreferences((current) => ({ ...current, browser: true }));
    }
    return result;
  }, []);

  const value = useMemo<NotificationsCtx>(
    () => ({
      notifications,
      unreadCount: notifications.filter((item) => !item.readAt).length,
      preferences,
      permission,
      pushNotification,
      markRead,
      markAllRead,
      clearNotification,
      updatePreferences,
      requestBrowserPermission,
    }),
    [
      clearNotification,
      markAllRead,
      markRead,
      notifications,
      permission,
      preferences,
      pushNotification,
      requestBrowserPermission,
      updatePreferences,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useNotifications must be used in NotificationProvider");
  return ctx;
}
