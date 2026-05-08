import type { ChatMessage } from "../types";

const CHANNEL_NAME = "vaelyndra-live-chat";

export interface CrossWindowLiveChatPayload {
  broadcasterId: string;
  message: ChatMessage;
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
    channel.postMessage(payload);
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
  const onMessage = (event: MessageEvent<CrossWindowLiveChatPayload>) => {
    if (!event.data) return;
    listener(event.data);
  };
  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}
