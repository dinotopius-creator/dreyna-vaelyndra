/**
 * Client HTTP pour le système de familiers (PR familiers#3).
 *
 * Le familier est une 3e entité du membre, indépendante de la créature
 * et de l'avatar 3D. Endpoints documentés dans
 * `backend/app/routers/familiars.py`.
 */
import { API_BASE, ApiError } from "./api";

async function familiarRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
  return (await res.json()) as T;
}

export interface FamiliarCatalogItem {
  id: string;
  name: string;
  tier: "free" | "premium";
  rarity: string;
  icon: string;
  color: string;
  tagline: string;
  description: string;
  priceSylvins: number;
  baseStats: Record<string, number>;
}

export interface OwnedFamiliar {
  id: number;
  familiarId: string;
  name: string;
  rarity: string;
  tier: "free" | "premium";
  icon: string;
  color: string;
  nickname: string | null;
  isActive: boolean;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  evolution: { id: string; name: string; min_level: number };
  stats: Record<string, number>;
  acquiredAt: string;
  lastActiveAt: string | null;
}

export interface FamiliarCollection {
  activeFamiliarId: string | null;
  activeUserFamiliarId: number | null;
  activeXp: number;
  activeLevel: number;
  owned: OwnedFamiliar[];
  switchCount: number;
  nextSwitchFree: boolean;
  switchPriceSylvins: number;
}

export async function fetchFamiliarsCatalog(): Promise<FamiliarCatalogItem[]> {
  return familiarRequest<FamiliarCatalogItem[]>("/familiers/catalog");
}

export async function fetchUserFamiliars(
  userId: string,
): Promise<FamiliarCollection> {
  return familiarRequest<FamiliarCollection>(
    `/users/${encodeURIComponent(userId)}/familiers`,
  );
}

export async function chooseFirstFamiliar(
  userId: string,
  familiarId: string,
): Promise<FamiliarCollection> {
  return familiarRequest<FamiliarCollection>(
    `/users/${encodeURIComponent(userId)}/familiers/onboarding`,
    { method: "POST", body: JSON.stringify({ familiarId }) },
  );
}

export async function buyFamiliar(
  userId: string,
  familiarId: string,
): Promise<FamiliarCollection> {
  return familiarRequest<FamiliarCollection>(
    `/users/${encodeURIComponent(userId)}/familiers/buy`,
    { method: "POST", body: JSON.stringify({ familiarId }) },
  );
}

export async function switchFamiliar(
  userId: string,
  familiarId: string,
): Promise<FamiliarCollection> {
  return familiarRequest<FamiliarCollection>(
    `/users/${encodeURIComponent(userId)}/familiers/switch`,
    { method: "POST", body: JSON.stringify({ familiarId }) },
  );
}

export async function setFamiliarNickname(
  userId: string,
  familiarUserId: number,
  nickname: string | null,
): Promise<OwnedFamiliar> {
  return familiarRequest<OwnedFamiliar>(
    `/users/${encodeURIComponent(userId)}/familiers/${familiarUserId}/nickname`,
    { method: "POST", body: JSON.stringify({ nickname }) },
  );
}

/** Libellés FR pour les paliers d'évolution. */
export const EVOLUTION_TIERS: Record<string, { label: string; emoji: string }> =
  {
    "tier-1-baby": { label: "Bébé", emoji: "🐣" },
    "tier-2-awakened": { label: "Éveillé", emoji: "✨" },
    "tier-3-mythic": { label: "Mythique", emoji: "🌟" },
    "tier-4-celestial": { label: "Céleste", emoji: "🪽" },
  };

/** Libellés FR pour les stats cosmétiques. */
export const STAT_LABELS: Record<
  string,
  { label: string; emoji: string; help: string }
> = {
  aura_sociale: {
    label: "Aura Sociale",
    emoji: "✨",
    help: "Améliore légèrement ta visibilité sociale.",
  },
  energie_live: {
    label: "Énergie Live",
    emoji: "🔥",
    help: "Anime tes lives d'effets bonus.",
  },
  recolte_lueurs: {
    label: "Récolte de Lueurs",
    emoji: "🌙",
    help: "Petits bonus de Lueurs à la moisson quotidienne.",
  },
  affinite_sylvaine: {
    label: "Affinité Sylvaine",
    emoji: "💎",
    help: "Petits effets cosmétiques premium.",
  },
  charisme: {
    label: "Charisme",
    emoji: "🪽",
    help: "Effets visuels qui rayonnent autour de toi.",
  },
};

/** Libellés FR pour les raretés (cohérent avec la boutique cosmétique). */
export const RARITY_LABELS: Record<string, string> = {
  commun: "Commun",
  rare: "Rare",
  epique: "Épique",
  legendaire: "Légendaire",
  mythique: "Mythique",
};
