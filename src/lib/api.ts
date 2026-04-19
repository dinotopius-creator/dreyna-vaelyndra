/**
 * Client HTTP minimal pour l'API Vaelyndra (posts / commentaires / réactions).
 *
 * Base URL configurable via `VITE_API_URL` au build. À défaut on tape le
 * backend Fly.io de prod — ce qui permet au site déployé sur devinapps.com
 * (multi-appareils) de partager un seul fil d'actualité.
 */
import type { CommunityPost, Comment } from "../types";

const BASE = (
  import.meta.env.VITE_API_URL ??
  "https://vaelyndra-backend-qjfhvenc.fly.dev"
).replace(/\/$/, "");

interface AuthorPayload {
  author_id: string;
  author_name: string;
  author_avatar: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(
      res.status,
      `API ${init.method ?? "GET"} ${path} → ${res.status} ${text}`,
    );
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export async function apiListPosts(): Promise<CommunityPost[]> {
  return (await request<CommunityPost[]>("/posts")) ?? [];
}

export async function apiCreatePost(input: {
  author: AuthorPayload;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<CommunityPost> {
  const body = {
    ...input.author,
    content: input.content,
    image_url: input.imageUrl,
    video_url: input.videoUrl,
  };
  return (await request<CommunityPost>("/posts", {
    method: "POST",
    body: JSON.stringify(body),
  })) as CommunityPost;
}

export async function apiDeletePost(
  postId: string,
  userId: string,
): Promise<void> {
  await request<null>(
    `/posts/${encodeURIComponent(postId)}?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function apiToggleReaction(
  postId: string,
  userId: string,
  emoji: string,
): Promise<CommunityPost> {
  return (await request<CommunityPost>(
    `/posts/${encodeURIComponent(postId)}/reactions`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId, emoji }),
    },
  )) as CommunityPost;
}

export async function apiAddComment(
  postId: string,
  input: { author: AuthorPayload; content: string },
): Promise<Comment> {
  return (await request<Comment>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        ...input.author,
        content: input.content,
      }),
    },
  )) as Comment;
}

export async function apiDeleteComment(
  postId: string,
  commentId: string,
  userId: string,
): Promise<void> {
  await request<null>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(
      commentId,
    )}?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

// --- Profils utilisateur (avatar, inventaire, bourses) --------------------

/**
 * Profil serveur renvoyé par les endpoints /users.
 *
 * - `avatarUrl` : URL de l'avatar principal (SVG DiceBear, ou .glb légacy)
 * - `avatarImageUrl` : vignette 2D utilisée dans la navbar, les posts, le chat
 * - `inventory` / `equipped` : items possédés / équipés (ids opaque string)
 * - `lueurs` : monnaie gratuite (daily claim, events)
 *
 * Sylvins (monnaie premium) — split anti-fraude :
 * - `sylvinsPaid` : solde acheté en € via Stripe (seul pot retirable)
 * - `sylvinsPromo` : solde gratuit (admin top-up, events, cadeaux reçus
 *   depuis un pot promo). Dépensable mais non retirable.
 * - `sylvins` : somme `sylvinsPaid + sylvinsPromo` (solde total à afficher
 *   dans l'UI pour la dépense ; la distinction paid/promo ne concerne que
 *   le cashout).
 * Idem pour les recettes streamer : `earningsPaid` seul alimente le
 * retrait Stripe Connect ; `earningsPromo` reste utilisable uniquement
 * pour dépenser dans la plateforme.
 */
export interface UserProfileDto {
  id: string;
  username: string;
  avatarImageUrl: string;
  avatarUrl: string | null;
  inventory: string[];
  equipped: Record<string, string>;
  lueurs: number;
  sylvins: number;
  sylvinsEarnings: number;
  sylvinsPaid: number;
  sylvinsPromo: number;
  earningsPaid: number;
  earningsPromo: number;
  lastDailyAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyClaimDto {
  granted: number;
  already_claimed: boolean;
  profile: UserProfileDto;
}

export async function apiUpsertProfile(input: {
  id: string;
  username: string;
  avatarImageUrl: string;
}): Promise<UserProfileDto> {
  return (await request<UserProfileDto>("/users", {
    method: "POST",
    body: JSON.stringify({
      id: input.id,
      username: input.username,
      avatar_image_url: input.avatarImageUrl,
    }),
  })) as UserProfileDto;
}

export async function apiGetProfile(userId: string): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}`,
  )) as UserProfileDto;
}

export async function apiUpdateAvatar(
  userId: string,
  patch: { avatarUrl?: string | null; avatarImageUrl?: string },
): Promise<UserProfileDto> {
  // Patch partiel : on n'envoie que les champs réellement fournis, sinon le
  // serveur considèrerait `avatar_url: null` comme un ordre d'effacement et
  // effacerait le .glb de l'utilisateur à la prochaine maj de vignette.
  const body: Record<string, string | null> = {};
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;
  if (patch.avatarImageUrl !== undefined)
    body.avatar_image_url = patch.avatarImageUrl;
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/avatar`,
    { method: "PATCH", body: JSON.stringify(body) },
  )) as UserProfileDto;
}

export async function apiUpdateInventory(
  userId: string,
  patch: { inventory?: string[]; equipped?: Record<string, string> },
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/inventory`,
    { method: "PATCH", body: JSON.stringify(patch) },
  )) as UserProfileDto;
}

export async function apiApplyWalletDelta(
  userId: string,
  delta: {
    lueurs?: number;
    /**
     * Delta "total" (ancien champ). En débit, consomme le pot PROMO du
     * serveur en priorité puis déborde sur PAID. En crédit, tombe
     * intégralement dans PROMO (sécurité : créditer le pot retirable
     * passe obligatoirement par `sylvins_paid` explicite).
     */
    sylvins?: number;
    sylvins_earnings?: number;
    /** Crédit/débit explicite du pot PAID Sylvins (retirable). */
    sylvins_paid?: number;
    /** Crédit/débit explicite du pot PROMO Sylvins (non retirable). */
    sylvins_promo?: number;
    /** Crédit/débit explicite des earnings PAID streamer. */
    earnings_paid?: number;
    /** Crédit/débit explicite des earnings PROMO streamer. */
    earnings_promo?: number;
    reason?: string;
  },
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/wallet`,
    { method: "POST", body: JSON.stringify(delta) },
  )) as UserProfileDto;
}

export interface GiftTransferDto {
  sender: UserProfileDto;
  receiver: UserProfileDto;
  consumed_promo: number;
  consumed_paid: number;
}

/**
 * Transfert atomique de Sylvins (cadeau live). Le serveur consomme le pot
 * PROMO du sender en priorité et crédite le receiver sur les pots miroirs
 * (promo→promo, paid→paid) : impossible de blanchir un solde promo en
 * cashable via un complice.
 */
export async function apiGiftSylvins(input: {
  senderId: string;
  receiverId: string;
  amount: number;
  reason?: string;
}): Promise<GiftTransferDto> {
  return (await request<GiftTransferDto>(
    `/users/${encodeURIComponent(input.senderId)}/gift-sylvins`,
    {
      method: "POST",
      body: JSON.stringify({
        receiver_id: input.receiverId,
        amount: input.amount,
        reason: input.reason,
      }),
    },
  )) as GiftTransferDto;
}

export async function apiDailyClaim(userId: string): Promise<DailyClaimDto> {
  return (await request<DailyClaimDto>(
    `/users/${encodeURIComponent(userId)}/daily-claim`,
    { method: "POST" },
  )) as DailyClaimDto;
}
