import type { AppNotification } from "../contexts/NotificationsContext";

export function resolveNotificationUrl(notification: AppNotification) {
  if (notification.url) return notification.url;
  if (notification.entityType === "community_comment" && notification.commentId) {
    return `/communaute#comment-${notification.commentId}`;
  }
  if (
    (notification.entityType === "community_post" ||
      notification.entityType === "official_event") &&
    notification.postId
  ) {
    return `/communaute#post-${notification.postId}`;
  }
  if (notification.entityType === "live" && notification.liveId) {
    return `/live/${notification.liveId}`;
  }
  if (notification.entityType === "admin_request" && notification.entityId) {
    return `/admin?tab=requests#request-${notification.entityId}`;
  }
  if (notification.entityType === "profile" && notification.actorId) {
    return `/u/${notification.actorId}`;
  }
  return "/communaute";
}
