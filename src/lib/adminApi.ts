/**
 * Client HTTP pour les endpoints `/admin/*` et `/reports`.
 *
 * Tous les appels envoient `credentials: "include"` pour que le cookie
 * de session HttpOnly soit transmis. Les endpoints admin exigent
 * `UserProfile.role === "admin"` côté serveur ; le client doit donc
 * planquer l'UI si l'utilisateur connecté n'est pas admin (défense en
 * profondeur : même si le bouton est caché, le backend refusera 403).
 */
import { API_BASE, ApiError } from "./api";

async function authRequest<T>(
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

// --- Types -----------------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  avatarImageUrl: string;
  email: string | null;
  role: string;
  creatureId: string | null;
  lueurs: number;
  sylvinsPromo: number;
  sylvinsPaid: number;
  earningsPromo: number;
  earningsPaid: number;
  createdAt: string;
  bannedAt: string | null;
  bannedReason: string | null;
  activeSessions: number;
  reportsAgainstCount: number;
}

export type WalletPot =
  | "lueurs"
  | "sylvins_promo"
  | "sylvins_paid"
  | "earnings_promo"
  | "earnings_paid";

export const WALLET_POT_LABELS: Record<WalletPot, string> = {
  lueurs: "Lueurs (monnaie gratuite)",
  sylvins_promo: "Sylvins promo (non retirables)",
  sylvins_paid: "Sylvins payés (retirables)",
  earnings_promo: "Earnings promo streamer",
  earnings_paid: "Earnings payés streamer (retirables)",
};

export interface AuditLogEntry {
  id: number;
  actorId: string;
  actorUsername: string;
  targetId: string;
  targetUsername: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type ReportTargetType = "user" | "live" | "post" | "comment";
export type ReportReason =
  | "spam"
  | "harcelement"
  | "contenu_sensible"
  | "triche"
  | "usurpation"
  | "autre";
export type ReportStatus = "open" | "resolved" | "rejected";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam / pub",
  harcelement: "Harcèlement / insultes",
  contenu_sensible: "Contenu sexuel / violent",
  triche: "Triche / exploit",
  usurpation: "Usurpation d'identité",
  autre: "Autre",
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  user: "Profil",
  live: "Live",
  post: "Publication",
  comment: "Commentaire",
};

export interface ReportEntry {
  id: number;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  targetUrl: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReportStats {
  total: number;
  byStatus: Record<ReportStatus, number>;
  byType: Record<ReportTargetType, number>;
}

// --- Admin : utilisateurs --------------------------------------------------

export async function adminListUsers(
  search?: string,
): Promise<AdminUser[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return (
    (await authRequest<AdminUser[]>(`/admin/users${qs}`)) ?? []
  );
}

export async function adminGetUser(userId: string): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}`,
  )) as AdminUser;
}

export async function adminAdjustWallet(
  userId: string,
  body: { pot: WalletPot; delta: number; reason: string },
): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/wallet/adjust`,
    { method: "POST", body: JSON.stringify(body) },
  )) as AdminUser;
}

export async function adminSetRole(
  userId: string,
  role: string,
  reason?: string,
): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/role`,
    { method: "POST", body: JSON.stringify({ role, reason }) },
  )) as AdminUser;
}

export async function adminBanUser(
  userId: string,
  reason: string,
): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/ban`,
    { method: "POST", body: JSON.stringify({ reason }) },
  )) as AdminUser;
}

export async function adminResetPassword(
  userId: string,
  body: { newPassword: string; reason: string },
): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      body: JSON.stringify({
        new_password: body.newPassword,
        reason: body.reason,
      }),
    },
  )) as AdminUser;
}

export async function adminUnbanUser(userId: string): Promise<AdminUser> {
  return (await authRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/ban`,
    { method: "DELETE" },
  )) as AdminUser;
}

export async function adminListAuditLog(params?: {
  targetId?: string;
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const search = new URLSearchParams();
  if (params?.targetId) search.set("target_id", params.targetId);
  if (params?.action) search.set("action", params.action);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString() ? `?${search.toString()}` : "";
  return (
    (await authRequest<AuditLogEntry[]>(`/admin/audit-log${qs}`)) ?? []
  );
}

// --- Reports ---------------------------------------------------------------

export async function createReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  targetUrl?: string;
  reason: ReportReason;
  description?: string;
}): Promise<{ id: number; createdAt: string }> {
  return (await authRequest<{ id: number; createdAt: string }>(`/reports`, {
    method: "POST",
    body: JSON.stringify(input),
  })) as { id: number; createdAt: string };
}

export async function adminListReports(params?: {
  status?: ReportStatus;
  targetType?: ReportTargetType;
}): Promise<ReportEntry[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.targetType) search.set("target_type", params.targetType);
  const qs = search.toString() ? `?${search.toString()}` : "";
  return (
    (await authRequest<ReportEntry[]>(`/admin/reports${qs}`)) ?? []
  );
}

export async function adminReportsStats(): Promise<ReportStats> {
  return (await authRequest<ReportStats>(`/admin/reports/stats`)) as ReportStats;
}

export async function adminSetReportStatus(
  reportId: number,
  status: ReportStatus,
): Promise<ReportEntry> {
  return (await authRequest<ReportEntry>(
    `/admin/reports/${reportId}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  )) as ReportEntry;
}
