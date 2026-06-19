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
import { apiGetProfile, type UserProfileDto } from "../lib/api";
import { fetchReceivedFamiliarGifts } from "../lib/familiarsApi";
import { resolveNotificationUrl } from "../lib/notificationRoutes";
import { playNotificationSound } from "../lib/notificationSounds";
import { COMMUNITY_DRAWING_CONTEST, drawingContestUrl } from "../data/communityContest";

export type NotificationKind =
  | "community_like"
  | "community_comment"
  | "community_mention"
  | "official_event"
  | "live_mention"
  | "admin_request"
  | "familiar_gift"
  | "system";

export type NotificationEntityType =
  | "community_post"
  | "community_comment"
  | "live"
  | "official_event"
  | "admin_request"
  | "profile"
  | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  url?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  parentEntityId?: string;
  communityId?: string;
  communityName?: string;
  postId?: string;
  postTitle?: string;
  commentId?: string;
  liveId?: string;
  liveTitle?: string;
  eventId?: string;
  locationLabel?: string;
  priority?: "normal" | "mention" | "important";
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface NotificationPreferences {
  inApp: boolean;
  browser: boolean;
  communityLikes: boolean;
  communityComments: boolean;
  mentions: boolean;
  familiarGifts: boolean;
  vibration: boolean;
  sounds: boolean;
}

interface NotificationInput {
  id?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  parentEntityId?: string;
  communityId?: string;
  communityName?: string;
  postId?: string;
  postTitle?: string;
  commentId?: string;
  liveId?: string;
  liveTitle?: string;
  eventId?: string;
  locationLabel?: string;
  priority?: "normal" | "mention" | "important";
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  actionLabel?: string;
  actionUrl?: string;
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
  familiarGifts: true,
  vibration: true,
  sounds: true,
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

function excerpt(value: string, fallback: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 52 ? `${clean.slice(0, 49)}...` : clean;
}

function vibrateForNotification(notification: AppNotification) {
  if (
    typeof window === "undefined" ||
    !("vibrate" in navigator) ||
    typeof navigator.vibrate !== "function"
  ) {
    return;
  }

  const target = resolveNotificationUrl(notification);
  const current = `${window.location.pathname}${window.location.hash}`;
  if (current === target) return;

  try {
    if (notification.priority === "mention") {
      navigator.vibrate([80, 40, 80]);
      return;
    }
    navigator.vibrate(notification.priority === "important" ? [100, 40, 60] : 90);
  } catch {
    // Fallback silencieux : certains navigateurs/WebViews refusent la vibration.
  }
}

function shouldFetchProfileAvatar(avatar: string | null | undefined) {
  if (!avatar) return true;
  const trimmed = avatar.trim();
  if (!trimmed) return true;
  if (/i\.pravatar\.cc/i.test(trimmed)) return true;
  if (trimmed === "/favicon.svg") return true;
  if (trimmed.startsWith("/")) return true;
  return false;
}

function findCommunityTarget(event: NotificationInput, posts: CommunityPost[]) {
  const commentId = event.url?.match(/#comment-([^#?]+)/)?.[1];
  const postIdFromUrl = event.url?.match(/#post-([^#?]+)/)?.[1];
  const post =
    posts.find((entry) => entry.id === postIdFromUrl) ??
    posts.find((entry) =>
      commentId
        ? entry.comments.some((comment) => comment.id === commentId)
        : false,
    );
  const comment = commentId
    ? post?.comments.find((entry) => entry.id === commentId)
    : undefined;
  return { post, comment, commentId };
}

function enrichCommunityEvent(
  event: NotificationInput,
  posts: CommunityPost[],
): NotificationInput {
  const { post, comment, commentId } = findCommunityTarget(event, posts);
  if (!post) return event;

  const postTitle = excerpt(post.content, "Publication communauté");
  const isOfficialEvent = post.postType === "official_event";
  const communityName = isOfficialEvent ? "Événements Vaelyndra" : "Vaelyndra";
  const actorName = event.actorName ?? "Un membre";

  if (event.kind === "community_mention" && comment) {
    return {
      ...event,
      title: `${actorName} vous a identifié`,
      body: `${actorName} vous a identifié dans un commentaire sous « ${postTitle} ».`,
      entityType: "community_comment",
      entityId: comment.id,
      parentEntityId: post.id,
      postId: post.id,
      postTitle,
      commentId: comment.id,
      communityId: "vaelyndra",
      communityName,
      locationLabel: "Mention en commentaire",
      priority: "mention",
    };
  }

  if (event.kind === "community_mention") {
    return {
      ...event,
      title: `${actorName} vous a identifié`,
      body: `${actorName} vous a identifié dans une publication de la communauté ${communityName}.`,
      entityType: isOfficialEvent ? "official_event" : "community_post",
      entityId: post.id,
      postId: post.id,
      postTitle,
      communityId: "vaelyndra",
      communityName,
      locationLabel: isOfficialEvent ? "Événement Vaelyndra" : "Fil communauté",
      priority: "mention",
    };
  }

  if (event.kind === "community_comment" && comment) {
    const isReply = Boolean(comment.replyToAuthorId);
    return {
      ...event,
      title: isReply
        ? `${actorName} a répondu à votre commentaire`
        : `${actorName} a commenté votre publication`,
      body: isReply
        ? `${actorName} a répondu à votre commentaire sous « ${postTitle} ».`
        : `${actorName} a commenté votre publication « ${postTitle} ».`,
      entityType: "community_comment",
      entityId: comment.id,
      parentEntityId: post.id,
      postId: post.id,
      postTitle,
      commentId: comment.id,
      communityId: "vaelyndra",
      communityName,
      locationLabel: isReply ? "Réponse à votre commentaire" : "Commentaire communauté",
    };
  }

  if (event.kind === "community_like") {
    const likedComment = commentId ? comment : undefined;
    return {
      ...event,
      title: likedComment
        ? `${actorName} a aimé votre commentaire`
        : `${actorName} a réagi à votre publication`,
      body: likedComment
        ? `${actorName} a aimé votre commentaire sous « ${postTitle} ».`
        : `${actorName} a réagi à votre publication dans le fil communauté.`,
      entityType: likedComment ? "community_comment" : "community_post",
      entityId: likedComment?.id ?? post.id,
      parentEntityId: likedComment ? post.id : undefined,
      postId: post.id,
      postTitle,
      commentId: likedComment?.id,
      communityId: "vaelyndra",
      communityName,
      locationLabel: likedComment ? "Commentaire communauté" : "Fil communauté",
    };
  }

  return event;
}

function collectCommunityEvents(
  posts: CommunityPost[],
  currentUser: User,
  usersById: Map<string, User>,
  profilesById: Map<string, UserProfileDto>,
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
            const profileAvatar = profilesById.get(reactorId)?.avatarImageUrl;
            events.push({
              id: `community-like:${post.id}:${emoji}:${reactorId}`,
              kind: "community_like",
              title: "Nouveau like sur ta publication",
              body: `${actorName} a réagi ${emoji} à ta publication.`,
              url: postUrl,
              actionLabel: "Voir le post",
              actionUrl: postUrl,
              actorId: reactorId,
              actorName,
              actorAvatar: profileAvatar || avatarFor(reactorId, usersById),
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
          title: "Tu as été identifié",
          body: `${post.authorName} t'a identifié dans une publication.`,
          url: postUrl,
          actionLabel: "Voir le post",
          actionUrl: postUrl,
          actorId: post.authorId,
          actorName: post.authorName,
          actorAvatar:
            profilesById.get(post.authorId)?.avatarImageUrl ||
            avatarFor(post.authorId, usersById) ||
          post.authorAvatar,
      });
    }

    post.comments.forEach((comment) => {
      const commentUrl = `/communaute#comment-${comment.id}`;

      if (comment.authorId === currentUser.id) {
        comment.likes
          .filter((likerId) => likerId !== currentUser.id)
          .forEach((likerId) => {
            const actorName = nameFor(likerId, usersById);
            const profileAvatar = profilesById.get(likerId)?.avatarImageUrl;
            events.push({
              id: `community-comment-like:${post.id}:${comment.id}:${likerId}`,
              kind: "community_like",
              title: "Nouveau like sur ton commentaire",
              body: `${actorName} a aimé ton commentaire.`,
              url: commentUrl,
              actionLabel: "Voir le commentaire",
              actionUrl: commentUrl,
              actorId: likerId,
              actorName,
              actorAvatar: profileAvatar || avatarFor(likerId, usersById),
            });
          });
      }

      if (comment.authorId === currentUser.id) return;

      if (post.authorId === currentUser.id) {
        events.push({
          id: `community-comment:${post.id}:${comment.id}`,
          kind: "community_comment",
          title: "Nouveau commentaire",
          body: `${comment.authorName} a commenté ta publication.`,
          url: commentUrl,
          actionLabel: "Voir le commentaire",
          actionUrl: commentUrl,
          actorId: comment.authorId,
          actorName: comment.authorName,
          actorAvatar:
            profilesById.get(comment.authorId)?.avatarImageUrl ||
            avatarFor(comment.authorId, usersById) || comment.authorAvatar,
        });
      }

      if (comment.replyToAuthorId === currentUser.id) {
        events.push({
          id: `community-comment-reply:${post.id}:${comment.id}`,
          kind: "community_comment",
          title: "Nouvelle réponse",
          body: `${comment.authorName} a répondu à ton commentaire.`,
          url: commentUrl,
          actionLabel: "Voir la réponse",
          actionUrl: commentUrl,
          actorId: comment.authorId,
          actorName: comment.authorName,
          actorAvatar:
            profilesById.get(comment.authorId)?.avatarImageUrl ||
            avatarFor(comment.authorId, usersById) || comment.authorAvatar,
        });
      }

      if (contentMentionsUser(comment.content, currentUser)) {
        events.push({
          id: `community-comment-mention:${post.id}:${comment.id}`,
          kind: "community_mention",
          title: "Tu as été identifié",
          body: `${comment.authorName} t'a identifié en commentaire.`,
          url: commentUrl,
          actionLabel: "Voir le commentaire",
          actionUrl: commentUrl,
          actorId: comment.authorId,
          actorName: comment.authorName,
          actorAvatar:
            profilesById.get(comment.authorId)?.avatarImageUrl ||
            avatarFor(comment.authorId, usersById) || comment.authorAvatar,
        });
      }
    });
  });

  return events.map((event) => enrichCommunityEvent(event, posts));
}

function isKindEnabled(
  kind: NotificationKind,
  preferences: NotificationPreferences,
) {
  if (kind === "community_like") return preferences.communityLikes;
  if (kind === "community_comment") return preferences.communityComments;
  if (kind === "community_mention") return preferences.mentions;
  if (kind === "familiar_gift") return preferences.familiarGifts;
  return true;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, users } = useAuth();
  const { posts } = useStore();
  const { notify } = useToast();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, UserProfileDto>>(
    {},
  );
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => getPermission());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const deliveredNotificationIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedUserRef = useRef<string | null>(null);
  const giftsBootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      seenEventIdsRef.current = new Set();
      deliveredNotificationIdsRef.current = new Set();
      bootstrappedUserRef.current = null;
      giftsBootstrappedRef.current = null;
      const reset = window.setTimeout(() => {
        setNotifications([]);
        setPreferences(DEFAULT_PREFERENCES);
        setProfilesById({});
        setPermission(getPermission());
      }, 0);
      return () => window.clearTimeout(reset);
    }

    const savedNotifications = readJson<AppNotification[]>(
      notificationsKey(userId),
      [],
    );
    const savedPreferences = readJson<NotificationPreferences>(
      preferencesKey(userId),
      DEFAULT_PREFERENCES,
    );
    seenEventIdsRef.current = new Set(
      savedNotifications.map((item) => item.id),
    );
    deliveredNotificationIdsRef.current = new Set(
      savedNotifications.map((item) => item.id),
    );
    bootstrappedUserRef.current = null;
    giftsBootstrappedRef.current = null;
    const bootstrap = window.setTimeout(() => {
      setNotifications(savedNotifications);
      setPreferences(savedPreferences);
      setProfilesById({});
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    const candidateIds = new Set<string>();
    notifications.forEach((notification) => {
      if (notification.actorId && shouldFetchProfileAvatar(notification.actorAvatar)) {
        candidateIds.add(notification.actorId);
      }
    });
    posts.forEach((post) => {
      if (post.authorId && shouldFetchProfileAvatar(post.authorAvatar)) {
        candidateIds.add(post.authorId);
      }
      post.comments.forEach((comment) => {
        if (comment.authorId && shouldFetchProfileAvatar(comment.authorAvatar)) {
          candidateIds.add(comment.authorId);
        }
      });
      Object.values(post.reactions).forEach((userIds) => {
        userIds.forEach((userId) => {
          if (userId) candidateIds.add(userId);
        });
      });
    });
    const missingIds = Array.from(candidateIds).filter(
      (userId) => !profilesById[userId],
    );
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.allSettled(missingIds.map((userId) => apiGetProfile(userId))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, UserProfileDto> = {};
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          next[missingIds[index]] = result.value;
        });
        if (Object.keys(next).length === 0) return;
        setProfilesById((current) => ({ ...current, ...next }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [notifications, posts, profilesById, user]);

  useEffect(() => {
    if (!user) return;
    if (Object.keys(profilesById).length === 0) return;
    const sync = window.setTimeout(() => {
      setNotifications((current) => {
        let changed = false;
        const next = current.map((notification) => {
          const actorId = notification.actorId;
          if (!actorId) return notification;
          const profileAvatar = profilesById[actorId]?.avatarImageUrl?.trim();
          if (!profileAvatar || profileAvatar === notification.actorAvatar) {
            return notification;
          }
          changed = true;
          return { ...notification, actorAvatar: profileAvatar };
        });
        return changed ? next : current;
      });
    }, 0);
    return () => window.clearTimeout(sync);
  }, [profilesById, user]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        notificationsKey(user.id),
        JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)),
      );
    } catch {
      // Le centre reste disponible en mémoire si le stockage local refuse.
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
          data: { url: resolveNotificationUrl(notification) },
        });
        systemNotification.onclick = () => {
          window.focus();
          window.location.assign(resolveNotificationUrl(notification));
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

      if (deliveredNotificationIdsRef.current.has(notification.id)) {
        return;
      }
      deliveredNotificationIdsRef.current.add(notification.id);

      if (preferences.inApp) {
        setNotifications((current) => {
          if (current.some((item) => item.id === notification.id))
            return current;
          return [notification, ...current].slice(0, MAX_NOTIFICATIONS);
        });
        notify(notification.title, "info");
        if (preferences.vibration) {
          vibrateForNotification(notification);
        }
        if (preferences.sounds) {
          playNotificationSound();
        }
      }

      emitBrowserNotification(notification);
    },
    [emitBrowserNotification, notify, preferences],
  );

  useEffect(() => {
    if (!user) return;
    const usersById = new Map(users.map((member) => [member.id, member]));
    const profileMap = new Map(Object.entries(profilesById));
    const events = collectCommunityEvents(posts, user, usersById, profileMap);
    const eventsById = new Map(
      events
        .filter((event) => event.id)
        .map((event) => [event.id as string, event]),
    );

    const sync = window.setTimeout(() => {
      setNotifications((current) => {
        let changed = false;
        const next = current.map((notification) => {
          const event = eventsById.get(notification.id);
          if (!event) return notification;
          const updated = {
            ...notification,
            title: event.title,
            body: event.body,
            url: event.url ?? notification.url,
            actorId: event.actorId ?? notification.actorId,
            actorName: event.actorName ?? notification.actorName,
            actorAvatar: event.actorAvatar ?? notification.actorAvatar,
          };
          if (
            updated.title === notification.title &&
            updated.body === notification.body &&
            updated.url === notification.url &&
            updated.actorId === notification.actorId &&
            updated.actorName === notification.actorName &&
            updated.actorAvatar === notification.actorAvatar
          ) {
            return notification;
          }
          changed = true;
          return updated;
        });
        return changed ? next : current;
      });
    }, 0);

    if (bootstrappedUserRef.current !== user.id) {
      seenEventIdsRef.current = new Set([
        ...Array.from(seenEventIdsRef.current),
        ...events
          .map((event) => event.id)
          .filter((id): id is string => Boolean(id)),
      ]);
      bootstrappedUserRef.current = user.id;
      return () => window.clearTimeout(sync);
    }

    const notify = window.setTimeout(() => {
      events.forEach((event) => {
        if (!event.id || seenEventIdsRef.current.has(event.id)) return;
        seenEventIdsRef.current.add(event.id);
        pushNotification(event);
      });
    }, 0);
    return () => {
      window.clearTimeout(sync);
      window.clearTimeout(notify);
    };
  }, [posts, profilesById, pushNotification, user, users]);

  useEffect(() => {
    if (!user) return;
    const endsAt = new Date(COMMUNITY_DRAWING_CONTEST.endsAt).getTime();
    if (Date.now() >= endsAt) return;
    const id = COMMUNITY_DRAWING_CONTEST.notificationId;
    if (seenEventIdsRef.current.has(id)) return;
    seenEventIdsRef.current.add(id);
    pushNotification({
      id,
      kind: "official_event",
      title: "Concours de dessin lancé !",
      body:
        "Crée un post avec ton dessin et ajoute #concoursdessin pour participer. Le post avec le plus de likes dans 24h00 gagne 1000 lueurs et 6 nourritures familier.",
      url: drawingContestUrl(),
      entityType: "official_event",
      entityId: COMMUNITY_DRAWING_CONTEST.id,
      postId: COMMUNITY_DRAWING_CONTEST.announcementPostId,
      postTitle: COMMUNITY_DRAWING_CONTEST.title,
      communityId: "vaelyndra",
      communityName: "Communauté Vaelyndra",
      locationLabel: "Annonce officielle",
      priority: "important",
      actionLabel: "Voir le concours",
      actionUrl: drawingContestUrl(),
    });
  }, [pushNotification, user]);

  // Offrandes Sylvins reçues sur le familier : pas dérivables des posts,
  // on poll un endpoint dédié. La dédup passe par `seenEventIdsRef`
  // (réamorcé depuis les notifications persistées) : une offrande déjà
  // notifiée lors d'une session précédente ne re-notifie pas, mais une
  // offrande reçue hors-ligne est bien signalée à la prochaine connexion.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    const poll = async () => {
      let gifts;
      try {
        gifts = await fetchReceivedFamiliarGifts(userId);
      } catch {
        return;
      }
      if (cancelled) return;

      // Premier passage pour ce membre : on marque les offrandes déjà
      // existantes comme vues sans spammer (évite un déluge de toasts au
      // chargement, surtout pour les offrandes antérieures à cette
      // fonctionnalité). Les offrandes suivantes notifieront en direct.
      if (giftsBootstrappedRef.current !== userId) {
        gifts.forEach((gift) =>
          seenEventIdsRef.current.add(`familiar-gift:${gift.id}`),
        );
        giftsBootstrappedRef.current = userId;
        return;
      }

      // L'API renvoie du plus récent au plus ancien : on traite à l'envers
      // pour que la plus récente finisse en tête de la pile.
      [...gifts].reverse().forEach((gift) => {
        const id = `familiar-gift:${gift.id}`;
        if (seenEventIdsRef.current.has(id)) return;
        seenEventIdsRef.current.add(id);
        const profileUrl = `/u/${gift.senderId}`;
        pushNotification({
          id,
          kind: "familiar_gift",
          title: "Offrande à ton familier 🎁",
          body: `${gift.senderName} a offert ${gift.amount} Sylvins à ton familier (+${gift.xpGranted} XP).`,
          url: profileUrl,
          entityType: "profile",
          entityId: gift.senderId,
          locationLabel: "Profil du membre",
          priority: "important",
          actionLabel: "Offrir en retour",
          actionUrl: profileUrl,
          actorId: gift.senderId,
          actorName: gift.senderName,
          actorAvatar: gift.senderAvatar || undefined,
        });
      });
    };

    poll();
    const interval = window.setInterval(poll, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pushNotification, user]);

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
