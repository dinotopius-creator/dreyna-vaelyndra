/**
 * Client HTTP pour les endpoints `/stripe/*` du backend Vaelyndra.
 *
 * Flux attendu :
 * 1. Le client appelle `apiCreateSylvinsCheckout(productId)` avec l'id d'un
 *    `CatalogProduct` de catégorie "Sylvins".
 * 2. Le backend crée une Stripe Checkout Session et renvoie son `url`.
 * 3. Le frontend redirige `window.location.href = url` vers Stripe.
 * 4. Après paiement, Stripe redirige vers `/compte?payment=success`. Le
 *    webhook `POST /stripe/webhook` (déclenché en parallèle par Stripe vers
 *    notre backend) crédite `sylvins_paid` sur le profil.
 */
import { API_BASE, ApiError } from "./api";
import type { UserProfileDto } from "./api";

interface CheckoutSylvinsOut {
  url: string;
  session_id: string;
}

export interface StripeConnectStatusDto {
  accountId: string | null;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface StripeConnectLinkDto {
  url: string;
  accountId: string;
}

export interface StripePayoutDto {
  transferId: string;
  amountCents: number;
  earningsPaidConsumed: number;
  profile: UserProfileDto;
}

export async function apiCreateSylvinsCheckout(
  productId: string,
): Promise<CheckoutSylvinsOut> {
  const res = await fetch(`${API_BASE}/stripe/checkout/sylvins`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId }),
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
  return (await res.json()) as CheckoutSylvinsOut;
}

async function stripeJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
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
  return (await res.json()) as T;
}

export function apiGetStripeConnectStatus(): Promise<StripeConnectStatusDto> {
  return stripeJson<StripeConnectStatusDto>("/stripe/connect/status");
}

export function apiCreateStripeConnectOnboardingLink(): Promise<StripeConnectLinkDto> {
  return stripeJson<StripeConnectLinkDto>("/stripe/connect/onboarding", {
    method: "POST",
  });
}

export function apiCreateStripeConnectDashboardLink(): Promise<StripeConnectLinkDto> {
  return stripeJson<StripeConnectLinkDto>("/stripe/connect/dashboard", {
    method: "POST",
  });
}

export function apiWithdrawStripeEarnings(): Promise<StripePayoutDto> {
  return stripeJson<StripePayoutDto>("/stripe/payouts/withdraw", {
    method: "POST",
  });
}
