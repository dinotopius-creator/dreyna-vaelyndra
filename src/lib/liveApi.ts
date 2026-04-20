/**
 * Client HTTP pour le registre serveur des lives en cours (`/live/*`).
 *
 * Contexte : avant ce client, le "liveRegistry" côté front vivait en
 * localStorage. Un broadcaster sur un browser A ne voyait pas les lives
 * d'un broadcaster sur un browser B. Ce client fait le pont avec la
 * table `LiveSession` côté backend (cf. `backend/app/routers/live.py`).
 */
import { API_BASE, ApiError } from "./api";

export interface LiveSessionOut {
  broadcaster_id: string;
  broadcaster_name: string;
  broadcaster_avatar: string;
  title: string;
  description: string;
  category: string;
  mode: "screen" | "camera" | "twitch";
  twitch_channel: string;
  started_at: string;
  last_heartbeat_at: string;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
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

/** Liste publique des lives en cours (heartbeat récent < 90 s). */
export async function apiListLive(): Promise<LiveSessionOut[]> {
  return (await request<LiveSessionOut[]>("/live")) ?? [];
}

export interface LiveHeartbeatInput {
  title?: string;
  description?: string;
  category?: string;
  mode?: "screen" | "camera" | "twitch";
  twitchChannel?: string;
}

/**
 * Upsert le live du user connecté + refresh heartbeat.
 *
 * Le premier appel crée l'entrée (= début du live public). Les appels
 * suivants (périodicité 30 s côté caller) la maintiennent fraîche. Le
 * backend ignore l'entrée si elle n'a pas été refreshée depuis 90 s,
 * ce qui protège contre les onglets qui crashent sans passer par
 * `apiStopLive`.
 */
export async function apiLiveHeartbeat(
  input: LiveHeartbeatInput,
): Promise<LiveSessionOut> {
  return (await request<LiveSessionOut>("/live/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      title: input.title ?? "",
      description: input.description ?? "",
      category: input.category ?? "autre",
      mode: input.mode ?? "screen",
      twitch_channel: input.twitchChannel ?? "",
    }),
  })) as LiveSessionOut;
}

/** Arrêt explicite du live du user connecté (bouton Stop ou unload). */
export async function apiStopLive(): Promise<void> {
  await request<null>("/live/stop", { method: "DELETE" });
}
