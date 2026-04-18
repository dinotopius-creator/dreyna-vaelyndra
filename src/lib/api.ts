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
    throw new Error(
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
 * - `avatarUrl` : URL .glb (Ready Player Me) pour le rendu 3D
 * - `avatarImageUrl` : rendu 2D (.png) utilisé dans la navbar, les posts, le chat
 * - `inventory` / `equipped` : items possédés / équipés (ids opaque string)
 * - `lueurs` (monnaie gratuite) / `sylvins` (premium) / `sylvinsEarnings` (part streamer)
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
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/avatar`,
    {
      method: "PATCH",
      body: JSON.stringify({
        avatar_url: patch.avatarUrl ?? null,
        avatar_image_url: patch.avatarImageUrl,
      }),
    },
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
    sylvins?: number;
    sylvins_earnings?: number;
    reason?: string;
  },
): Promise<UserProfileDto> {
  return (await request<UserProfileDto>(
    `/users/${encodeURIComponent(userId)}/wallet`,
    { method: "POST", body: JSON.stringify(delta) },
  )) as UserProfileDto;
}

export async function apiDailyClaim(userId: string): Promise<DailyClaimDto> {
  return (await request<DailyClaimDto>(
    `/users/${encodeURIComponent(userId)}/daily-claim`,
    { method: "POST" },
  )) as DailyClaimDto;
}
