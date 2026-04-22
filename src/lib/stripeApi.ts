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

interface CheckoutSylvinsOut {
  url: string;
  session_id: string;
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
