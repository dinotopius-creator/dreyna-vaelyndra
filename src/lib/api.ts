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
