/**
 * Client HTTP pour les endpoints `/auth/*` de l'API Vaelyndra.
 *
 * Tous les appels envoient `credentials: "include"` pour que le cookie
 * `vaelyndra_session` (HttpOnly, SameSite=Lax) soit transmis de
 * `www.vaelyndra.com` vers `api.vaelyndra.com`.
 *
 * Le BASE est partagé avec `api.ts` via export `API_BASE`.
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
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export interface AuthMe {
  id: string;
  username: string;
  /** PR S — `@handle` public, `null` tant que le backfill startup n'a pas passé. */
  handle: string | null;
  /** PR S — ISO du dernier changement de handle (cooldown 30 j). */
  handle_updated_at: string | null;
  avatar_image_url: string;
  avatar_url: string | null;
  creature_id: string | null;
  role: string;
  lueurs: number;
  sylvins_promo: number;
  sylvins_paid: number;
  earnings_promo: number;
  earnings_paid: number;
  created_at: string;
  updated_at: string;
  email: string | null;
  email_verified: boolean;
  totp_enabled: boolean;
}

export interface AuthLoginResponse {
  status: string;
  session_id: string;
  user: AuthMe;
}

export interface AuthSessionDto {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  current: boolean;
}

export interface LoginAttemptDto {
  id: number;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface TwoFASetupResponse {
  secret: string;
  uri: string;
  qr_png_base64: string;
}

export interface TwoFAEnableResponse {
  status: string;
  recovery_codes: string[];
  message: string;
}

export async function authRegister(input: {
  email: string;
  username: string;
  password: string;
  creatureId?: string;
}): Promise<{ status: string; message: string }> {
  return (await authRequest<{ status: string; message: string }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        username: input.username,
        password: input.password,
        creature_id: input.creatureId,
      }),
    },
  )) as { status: string; message: string };
}

export async function authVerifyEmail(
  token: string,
): Promise<{ status: string; message: string }> {
  return (await authRequest<{ status: string; message: string }>(
    "/auth/verify-email",
    { method: "POST", body: JSON.stringify({ token }) },
  )) as { status: string; message: string };
}

export async function authResendVerification(email: string): Promise<void> {
  await authRequest<null>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function authLogin(input: {
  email: string;
  password: string;
  totpCode?: string;
  recoveryCode?: string;
}): Promise<AuthLoginResponse> {
  return (await authRequest<AuthLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      totp_code: input.totpCode,
      recovery_code: input.recoveryCode,
    }),
  })) as AuthLoginResponse;
}

export async function authLogout(): Promise<void> {
  try {
    await authRequest<null>("/auth/logout", { method: "POST" });
  } catch {
    // Ne pas bloquer l'UI si le logout serveur échoue — on nettoiera côté client.
  }
}

export async function authMe(): Promise<AuthMe | null> {
  try {
    return (await authRequest<AuthMe>("/auth/me")) as AuthMe;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function authChangePassword(input: {
  oldPassword: string;
  newPassword: string;
}): Promise<{ status: string; revoked_sessions: number }> {
  return (await authRequest<{ status: string; revoked_sessions: number }>(
    "/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({
        old_password: input.oldPassword,
        new_password: input.newPassword,
      }),
    },
  )) as { status: string; revoked_sessions: number };
}

export async function authChangeEmail(input: {
  password: string;
  newEmail: string;
}): Promise<{ status: string; message: string }> {
  return (await authRequest<{ status: string; message: string }>(
    "/auth/change-email",
    {
      method: "POST",
      body: JSON.stringify({
        password: input.password,
        new_email: input.newEmail,
      }),
    },
  )) as { status: string; message: string };
}

export async function authRequestPasswordReset(email: string): Promise<void> {
  await authRequest<null>("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function authResetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  await authRequest<null>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      new_password: input.newPassword,
    }),
  });
}

export async function authListSessions(): Promise<AuthSessionDto[]> {
  const r = (await authRequest<{ sessions: AuthSessionDto[] }>(
    "/auth/sessions",
  )) as { sessions: AuthSessionDto[] };
  return r.sessions;
}

export async function authRevokeSession(
  sessionId: string,
): Promise<{ status: string; current_revoked: boolean }> {
  return (await authRequest<{ status: string; current_revoked: boolean }>(
    `/auth/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  )) as { status: string; current_revoked: boolean };
}

export async function authRevokeOtherSessions(): Promise<{
  status: string;
  revoked: number;
}> {
  return (await authRequest<{ status: string; revoked: number }>(
    "/auth/sessions/revoke-others",
    { method: "POST" },
  )) as { status: string; revoked: number };
}

export async function authLoginHistory(): Promise<LoginAttemptDto[]> {
  const r = (await authRequest<{ attempts: LoginAttemptDto[] }>(
    "/auth/login-history",
  )) as { attempts: LoginAttemptDto[] };
  return r.attempts;
}

export async function auth2FASetup(): Promise<TwoFASetupResponse> {
  return (await authRequest<TwoFASetupResponse>("/auth/2fa/setup", {
    method: "POST",
  })) as TwoFASetupResponse;
}

export async function auth2FAEnable(
  code: string,
): Promise<TwoFAEnableResponse> {
  return (await authRequest<TwoFAEnableResponse>("/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  })) as TwoFAEnableResponse;
}

export async function auth2FADisable(input: {
  password: string;
  code: string;
}): Promise<void> {
  await authRequest<null>("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password: input.password, code: input.code }),
  });
}

export async function authDeleteAccount(input: {
  password: string;
  totpCode?: string;
}): Promise<void> {
  await authRequest<null>("/auth/account/delete", {
    method: "POST",
    body: JSON.stringify({
      password: input.password,
      totp_code: input.totpCode,
    }),
  });
}
