/**
 * Client HTTP minimal pour l'API Vaelyndra (posts / commentaires / réactions).
 *
 * Base URL configurable via `VITE_API_URL` au build. À défaut on tape le
 * backend Fly.io de prod — ce qui permet au site déployé sur devinapps.com
 * (multi-appareils) de partager un seul fil d'actualité.
 */
import type { CommunityPost, Comment, Creature } from "../types";

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
  /** PR G — item ids que l'utilisateur aimerait recevoir en cadeau. */
  wishlist: string[];
  lueurs: number;
  sylvins: number;
  sylvinsEarnings: number;
  sylvinsPaid: number;
  sylvinsPromo: number;
  earningsPaid: number;
  earningsPromo: number;
  lastDailyAt: string | null;
  /** Créature choisie (null si compte pré-PR A non encore migré). */
  creature: Creature | null;
  /** `user` (défaut), `animator` (badge 🎭), `admin` (badge 👑). */
  role: string;
  followersCount: number;
  followingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FollowerDto {
  id: string;
  username: string;
  avatarImageUrl: string;
  creature: Creature | null;
  role: string;
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
  /** Optionnel : envoyé uniquement au premier upsert (inscription). */
  creatureId?: string;
}): Promise<UserProfileDto> {
  return (await request<UserProfileDto>("/users", {
    method: "POST",
    body: JSON.stringify({
      id: input.id,
      username: input.username,
      avatar_image_url: input.avatarImageUrl,
      creature_id: input.creatureId,
    }),
  })) as UserProfileDto;
}

export async function apiListCreatures(): Promise<Creature[]> {
  return (await request<Creature[]>("/creatures")) ?? [];
}

export async function apiSetCreature(
  userId: string,
  creatureId: string,
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/creature`,
    { method: "PATCH", body: JSON.stringify({ creature_id: creatureId }) },
  )) as UserProfileDto;
}

export async function apiFollow(
  followerId: string,
  targetId: string,
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(targetId)}/follow`,
    { method: "POST", body: JSON.stringify({ follower_id: followerId }) },
  )) as UserProfileDto;
}

export async function apiUnfollow(
  followerId: string,
  targetId: string,
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(targetId)}/follow?follower_id=${encodeURIComponent(
      followerId,
    )}`,
    { method: "DELETE" },
  )) as UserProfileDto;
}

export async function apiListFollowers(
  userId: string,
): Promise<FollowerDto[]> {
  return (
    (await request<FollowerDto[]>(
      `/users/${encodeURIComponent(userId)}/followers`,
    )) ?? []
  );
}

export async function apiListFollowing(
  userId: string,
): Promise<FollowerDto[]> {
  return (
    (await request<FollowerDto[]>(
      `/users/${encodeURIComponent(userId)}/following`,
    )) ?? []
  );
}

export async function apiFollowStatus(
  userId: string,
  followerId: string,
): Promise<{ following: boolean }> {
  return (await request<{ following: boolean }>(
    `/users/${encodeURIComponent(userId)}/follow-status?follower_id=${encodeURIComponent(
      followerId,
    )}`,
  )) as { following: boolean };
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
// --- Wishlist (PR G) ------------------------------------------------------

/**
 * Ajoute un item à la wishlist d'un utilisateur. Idempotent côté serveur.
 */
export async function apiAddToWishlist(
  userId: string,
  itemId: string,
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/wishlist/${encodeURIComponent(
      itemId,
    )}`,
    { method: "POST" },
  )) as UserProfileDto;
}

/**
 * Retire un item de la wishlist. Idempotent côté serveur.
 */
export async function apiRemoveFromWishlist(
  userId: string,
  itemId: string,
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/wishlist/${encodeURIComponent(
      itemId,
    )}`,
    { method: "DELETE" },
  )) as UserProfileDto;
}

export interface GiftItemDto {
  sender: UserProfileDto;
  receiver: UserProfileDto;
  consumed_promo: number;
  consumed_paid: number;
}

/**
 * Offre un item cosmétique depuis la wishlist d'un autre utilisateur.
 * Le serveur :
 *   - vérifie que l'item est bien dans la wishlist du receiver,
 *   - vérifie que le receiver ne possède pas déjà l'item,
 *   - débite le sender (PROMO d'abord pour les Sylvins),
 *   - ajoute l'item à l'inventaire du receiver + le retire de sa wishlist.
 * Atomique.
 */
export async function apiGiftItem(input: {
  senderId: string;
  receiverId: string;
  itemId: string;
  price: number;
  currency: "lueurs" | "sylvins";
  reason?: string;
}): Promise<GiftItemDto> {
  return (await request<GiftItemDto>(
    `/users/${encodeURIComponent(input.senderId)}/gift-item`,
    {
      method: "POST",
      body: JSON.stringify({
        receiver_id: input.receiverId,
        item_id: input.itemId,
        price: input.price,
        currency: input.currency,
        reason: input.reason,
      }),
    },
  )) as GiftItemDto;
}

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

// --- Classement streamers + BFF -------------------------------------------

export interface CreatureDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface StreamerMiniDto {
  id: string;
  username: string;
  avatarImageUrl: string;
  creature: CreatureDto | null;
  role: string;
}

export interface StreamerLeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string;
  avatarImageUrl: string;
  totalSylvins: number;
  creature: CreatureDto | null;
  role: string;
}

export interface StreamerLeaderboardDto {
  week: "this" | "last";
  weekStart: string;
  weekEnd: string;
  entries: StreamerLeaderboardEntryDto[];
}

export interface BFFEntryDto {
  streamer: StreamerMiniDto;
  donor: StreamerMiniDto;
  totalSylvins: number;
}

/**
 * Classement hebdomadaire des streamers par Sylvins reçus.
 * - `week=this` (défaut) : semaine ISO en cours, mise à jour temps réel
 *   (chaque cadeau écrit une ligne de ledger côté backend).
 * - `week=last` : semaine précédente, figée.
 */
export async function apiGetStreamerLeaderboard(
  week: "this" | "last" = "this",
  limit = 50,
): Promise<StreamerLeaderboardDto> {
  return (await request<StreamerLeaderboardDto>(
    `/streamers/leaderboard?week=${week}&limit=${limit}`,
  )) as StreamerLeaderboardDto;
}

/**
 * Duos BFF : pour chaque streamer, son plus gros donateur.
 * `week="all"` par défaut (historique complet) — choix délibéré pour
 * refléter une relation stable plutôt qu'éphémère.
 */
export async function apiGetBFFs(
  week: "this" | "last" | "all" = "all",
  limit = 20,
): Promise<BFFEntryDto[]> {
  return (
    (await request<BFFEntryDto[]>(
      `/streamers/bff?week=${week}&limit=${limit}`,
    )) ?? []
  );
}

export async function apiDailyClaim(userId: string): Promise<DailyClaimDto> {
  return (await request<DailyClaimDto>(
    `/users/${encodeURIComponent(userId)}/daily-claim`,
    { method: "POST" },
  )) as DailyClaimDto;
}
