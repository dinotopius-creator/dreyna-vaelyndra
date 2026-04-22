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
  mode: "screen" | "android-screen" | "camera" | "twitch";
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
  mode?: "screen" | "android-screen" | "camera" | "twitch";
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

export async function apiCreateNativeBroadcastToken(): Promise<{
  token: string;
  expires_at: string;
}> {
  return (await request<{ token: string; expires_at: string }>(
    "/live/native/broadcast-token",
    { method: "POST" },
  )) as { token: string; expires_at: string };
}

export interface NativeIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface NativeLiveSignalOut {
  session_id: string;
  broadcaster_id: string;
  viewer_id: string;
  offer_sdp: string;
  answer_sdp: string;
  viewer_ice: NativeIceCandidate[];
  broadcaster_ice: NativeIceCandidate[];
  created_at: string;
  updated_at: string;
}

export async function apiCreateNativeLiveOffer(input: {
  broadcasterId: string;
  offerSdp: string;
}): Promise<NativeLiveSignalOut> {
  return (await request<NativeLiveSignalOut>("/live/native/offers", {
    method: "POST",
    body: JSON.stringify({
      broadcaster_id: input.broadcasterId,
      offer_sdp: input.offerSdp,
    }),
  })) as NativeLiveSignalOut;
}

export async function apiGetNativeLiveOffer(
  sessionId: string,
): Promise<NativeLiveSignalOut> {
  return (await request<NativeLiveSignalOut>(
    `/live/native/offers/${encodeURIComponent(sessionId)}`,
  )) as NativeLiveSignalOut;
}

export async function apiAddNativeViewerIce(input: {
  sessionId: string;
  candidate: NativeIceCandidate;
}): Promise<void> {
  await request<NativeLiveSignalOut>(
    `/live/native/offers/${encodeURIComponent(input.sessionId)}/viewer-ice`,
    {
      method: "POST",
      body: JSON.stringify({ candidate: input.candidate }),
    },
  );
}

// ---------------------------------------------------------------------------
// Modération live (mute / kick) — PR Q
// ---------------------------------------------------------------------------

export type LiveModerationAction = "mute" | "kick";

export interface LiveModerationState {
  muted_until: string | null;
  kicked_until: string | null;
}

/**
 * Applique une sanction (mute ou kick) à `targetUserId` sur le live du
 * user connecté. Nécessite d'être authentifié ; le backend vérifie
 * aussi que l'appelant n'essaie pas de se modérer lui-même.
 */
export async function apiModerateLive(input: {
  targetUserId: string;
  action: LiveModerationAction;
  durationSeconds: number;
}): Promise<LiveModerationState> {
  return (await request<LiveModerationState>("/live/moderate", {
    method: "POST",
    body: JSON.stringify({
      target_user_id: input.targetUserId,
      action: input.action,
      duration_seconds: input.durationSeconds,
    }),
  })) as LiveModerationState;
}

/** Annule manuellement une sanction active. */
export async function apiUnmoderateLive(input: {
  targetUserId: string;
  action: LiveModerationAction;
}): Promise<void> {
  const params = new URLSearchParams({
    target_user_id: input.targetUserId,
    action: input.action,
  });
  await request<null>(`/live/moderate?${params.toString()}`, {
    method: "DELETE",
  });
}

/**
 * Retourne les éventuelles sanctions actives du user connecté sur le
 * live de `broadcasterId`. Utilisé par le viewer pour savoir s'il est
 * muté/expulsé (polling ~30 s).
 */
export async function apiMyModerationState(
  broadcasterId: string,
): Promise<LiveModerationState> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId });
  return (await request<LiveModerationState>(
    `/live/moderation/me?${params.toString()}`,
  )) as LiveModerationState;
}

// ---------------------------------------------------------------------------
// Demandes de montée sur scène — PR #55 (notif temps réel broadcaster)
// ---------------------------------------------------------------------------

export type JoinStatus = "pending" | "accepted" | "refused";

export interface JoinRequestOut {
  id: number;
  broadcaster_id: string;
  user_id: string;
  username: string;
  avatar: string;
  creature_id: string;
  status: JoinStatus;
  requested_at: string;
  decided_at: string | null;
}

/** Viewer : demande à monter sur scène du live de `broadcasterId`. */
export async function apiRequestJoin(
  broadcasterId: string,
): Promise<JoinRequestOut> {
  return (await request<JoinRequestOut>(
    `/live/${encodeURIComponent(broadcasterId)}/join`,
    { method: "POST" },
  )) as JoinRequestOut;
}

/** Viewer : annule sa propre demande en attente. */
export async function apiCancelJoin(broadcasterId: string): Promise<void> {
  await request<null>(`/live/${encodeURIComponent(broadcasterId)}/join`, {
    method: "DELETE",
  });
}

/** Viewer : polle sa propre demande pour voir statut d'acceptation. */
export async function apiMyJoinRequest(
  broadcasterId: string,
): Promise<JoinRequestOut | null> {
  const res = await request<JoinRequestOut | null>(
    `/live/${encodeURIComponent(broadcasterId)}/join/me`,
  );
  return res ?? null;
}

/** Broadcaster : liste des demandes sur SON live (polled ~5 s). */
export async function apiListJoinRequests(): Promise<JoinRequestOut[]> {
  return (await request<JoinRequestOut[]>("/live/join-requests")) ?? [];
}

/** Broadcaster : accepte ou refuse une demande. */
export async function apiDecideJoinRequest(
  requestId: number,
  decision: "accepted" | "refused",
): Promise<JoinRequestOut> {
  return (await request<JoinRequestOut>(
    `/live/join-requests/${requestId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: decision }),
    },
  )) as JoinRequestOut;
}
