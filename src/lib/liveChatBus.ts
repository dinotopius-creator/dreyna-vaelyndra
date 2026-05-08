import type { ChatMessage, LiveViewerSummary } from "../types";

const CHANNEL_NAME = "vaelyndra-live-chat";
const VIEWERS_STORAGE_PREFIX = "vaelyndra-live-viewers:";

export interface CrossWindowLiveChatPayload {
  broadcasterId: string;
  message: ChatMessage;
}

export interface CrossWindowLiveViewersPayload {
  broadcasterId: string;
  viewers: LiveViewerSummary[];
}

function createChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function publishCrossWindowLiveChat(
  payload: CrossWindowLiveChatPayload,
): void {
  const channel = createChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      type: "live-chat",
      ...payload,
    });
  } catch {
    // silent
  } finally {
    channel.close();
  }
}

export function subscribeCrossWindowLiveChat(
  listener: (payload: CrossWindowLiveChatPayload) => void,
): (() => void) | null {
  const channel = createChannel();
  if (!channel) return null;
  const onMessage = (
    event: MessageEvent<
      CrossWindowLiveChatPayload & {
        type?: string;
      }
    >,
  ) => {
    if (!event.data) return;
    if (event.data.type !== "live-chat") return;
    listener({
      broadcasterId: event.data.broadcasterId,
      message: event.data.message,
    });
  };
  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}

function storageKey(broadcasterId: string) {
  return `${VIEWERS_STORAGE_PREFIX}${broadcasterId}`;
}

export function readCrossWindowLiveViewers(
  broadcasterId: string,
): LiveViewerSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(broadcasterId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LiveViewerSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function publishCrossWindowLiveViewers(
  payload: CrossWindowLiveViewersPayload,
): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        storageKey(payload.broadcasterId),
        JSON.stringify(payload.viewers),
      );
    } catch {
      // silent
    }
  }
  const channel = createChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      type: "live-viewers",
      ...payload,
    });
  } catch {
    // silent
  } finally {
    channel.close();
  }
}

export function subscribeCrossWindowLiveViewers(
  broadcasterId: string,
  listener: (payload: CrossWindowLiveViewersPayload) => void,
): (() => void) | null {
  if (typeof window !== "undefined") {
    const initial = readCrossWindowLiveViewers(broadcasterId);
    listener({ broadcasterId, viewers: initial });
  }
  const channel = createChannel();
  const onStorage =
    typeof window !== "undefined"
      ? (event: StorageEvent) => {
          if (event.key !== storageKey(broadcasterId)) return;
          listener({
            broadcasterId,
            viewers: readCrossWindowLiveViewers(broadcasterId),
          });
        }
      : null;
  if (!channel) {
    if (onStorage && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return null;
  }
  const onMessage = (
    event: MessageEvent<
      CrossWindowLiveViewersPayload & {
        type?: string;
      }
    >,
  ) => {
    if (!event.data) return;
    if (event.data.type !== "live-viewers") return;
    if (event.data.broadcasterId !== broadcasterId) return;
    listener({
      broadcasterId: event.data.broadcasterId,
      viewers: event.data.viewers,
    });
  };
  channel.addEventListener("message", onMessage);
  if (onStorage && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
    if (onStorage && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
