/**
 * Cache local des pièces jointes (base64) persisté en localStorage.
 * Le backend ne stockant que le texte, on conserve les données d'image
 * côté client, indexées par ID de message.
 */
import type { MessageAttachment } from '../types';

const STORAGE_KEY = 'vaelyndra_msg_attachments';
const MAX_ENTRIES = 200; // évite de saturer le localStorage

function load(): Record<string, MessageAttachment[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(store: Record<string, MessageAttachment[]>) {
  try {
    // Garde seulement les MAX_ENTRIES entrées les plus récentes
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const toDelete = keys.slice(0, keys.length - MAX_ENTRIES);
      toDelete.forEach((k) => delete store[k]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage plein → on ignore silencieusement
  }
}

export function saveAttachment(messageId: number, attachment: MessageAttachment) {
  const store = load();
  store[String(messageId)] = [attachment];
  save(store);
}

export function getAttachments(messageId: number): MessageAttachment[] {
  return load()[String(messageId)] ?? [];
}

/** Fusionne les pièces jointes du cache dans une liste de messages. */
export function mergeAttachments<T extends { id: number; attachments?: MessageAttachment[] }>(
  messages: T[],
): T[] {
  const store = load();
  return messages.map((m) => {
    const cached = store[String(m.id)] ?? [];
    if (cached.length === 0) return m;
    return { ...m, attachments: [...(m.attachments ?? []), ...cached] };
  });
}
