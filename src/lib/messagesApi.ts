/**
 * Client HTTP pour les endpoints `/messages/*` (DMs 1-to-1).
 *
 * Envoie `credentials: "include"` pour transmettre le cookie de session
 * HttpOnly depuis `www.vaelyndra.com` vers `api.vaelyndra.com`.
 */
import { API_BASE, ApiError } from "./api";

export interface DirectMessageDto {
  id: number;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface ConversationDto {
  other_user_id: string;
  other_username: string;
  other_avatar: string;
  last_message: DirectMessageDto;
  unread_count: number;
}

async function messagesRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API_BASE}/messages${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail =
        typeof body?.detail === "string"
          ? body.detail
          : JSON.stringify(body?.detail ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export async function apiListConversations(): Promise<ConversationDto[]> {
  return (await messagesRequest<ConversationDto[]>("/conversations")) ?? [];
}

export async function apiGetThread(
  otherUserId: string,
  limit = 200,
): Promise<DirectMessageDto[]> {
  return (
    (await messagesRequest<DirectMessageDto[]>(
      `/${encodeURIComponent(otherUserId)}?limit=${limit}`,
    )) ?? []
  );
}

export async function apiSendMessage(
  otherUserId: string,
  content: string,
): Promise<DirectMessageDto> {
  return (await messagesRequest<DirectMessageDto>(
    `/${encodeURIComponent(otherUserId)}`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  )) as DirectMessageDto;
}

export async function apiGetUnreadCount(): Promise<number> {
  const r = await messagesRequest<{ count: number }>("/unread-count");
  return r?.count ?? 0;
}

export type MessagesStreamEvent =
  | {
      type: "message";
      conversation_key: string;
      message: DirectMessageDto;
    }
  | {
      type: "read";
      conversation_key: string;
      reader_id: string;
      read_at: string;
      message_ids: number[];
    };

/**
 * Ouvre un EventSource sur le flux SSE. Le callback `onEvent` est appelé
 * pour chaque event reçu (nouveau message ou accusé de lecture). Retourne
 * une fonction de cleanup qui ferme la connexion.
 *
 * Nota : `EventSource` ne supporte pas `credentials: "include"` par défaut,
 * mais `withCredentials = true` active bien l'envoi du cookie en CORS.
 */
export function apiSubscribeMessages(
  onEvent: (event: MessagesStreamEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const url = `${API_BASE}/messages/stream/subscribe`;
  const es = new EventSource(url, { withCredentials: true });
  es.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data) as MessagesStreamEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed frames
    }
  };
  if (onError) es.onerror = onError;
  return () => es.close();
}
