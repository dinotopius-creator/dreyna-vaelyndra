import type { CommunityPost } from "../types";

export const COMMUNITY_DRAWING_CONTEST = {
  id: "drawing-contest-2026-06",
  slug: "concoursdessin",
  hashtag: "concoursdessin",
  title: "Concours de dessin lancé !",
  startsAt: "2026-06-18T00:00:00Z",
  endsAt: "2026-06-19T00:00:00Z",
  rewardLueurs: 1000,
  rewardFood: 6,
  notificationId: "official-event:drawing-contest",
  announcementPostId: "official-event:drawing-contest-post",
  bannerImage: "/contest/drawing-contest-banner.svg",
  rules: [
    "Le concours dure 24 heures.",
    "Participe avec une image de dessin.",
    "Ajoute exactement #concoursdessin.",
    "Le post avec le plus de likes gagne.",
    "Récompense : 1000 lueurs + 6 nourritures familier.",
  ],
} as const;

const HASHTAG_PATTERN = /(^|[^A-Za-z0-9_])#([A-Za-z0-9_À-ÖØ-öø-ÿ-]{2,80})/g;

export type SocialToken =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string; slug: string };

export function normalizeHashtag(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-z0-9_]+/g, "");
}

export function extractHashtags(content: string) {
  const tags = new Set<string>();
  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    const raw = match[2] ?? "";
    const slug = normalizeHashtag(raw);
    if (slug) tags.add(slug);
  }
  return Array.from(tags);
}

export function tokenizeSocialText(content: string): SocialToken[] {
  const tokens: SocialToken[] = [];
  let cursor = 0;

  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const raw = match[2] ?? "";
    const index = match.index ?? -1;
    if (index < 0) continue;

    const hashtagEnd = index + fullMatch.length;
    const slug = normalizeHashtag(raw);
    if (!slug) continue;

    if (cursor < index) {
      tokens.push({ type: "text", value: content.slice(cursor, index) });
    }
    if (prefix) {
      tokens.push({ type: "text", value: prefix });
    }
    tokens.push({ type: "hashtag", value: `#${slug}`, slug });
    cursor = hashtagEnd;
  }

  if (cursor < content.length) {
    tokens.push({ type: "text", value: content.slice(cursor) });
  }

  if (tokens.length === 0) {
    return [{ type: "text", value: content }];
  }

  return tokens;
}

export function isDrawingContestEntry(post: CommunityPost) {
  const hashtags = extractHashtags(post.content);
  const hasContestTag = hashtags.includes(COMMUNITY_DRAWING_CONTEST.hashtag);
  const hasImage = Boolean(post.imageUrl?.trim());
  const createdAt = new Date(post.createdAt).getTime();
  const startsAt = new Date(COMMUNITY_DRAWING_CONTEST.startsAt).getTime();
  const endsAt = new Date(COMMUNITY_DRAWING_CONTEST.endsAt).getTime();
  return hasContestTag && hasImage && createdAt >= startsAt && createdAt < endsAt;
}

export function drawingContestUrl() {
  return `/communaute/hashtag/${COMMUNITY_DRAWING_CONTEST.slug}`;
}

export function drawingContestEndsIn(now = Date.now()) {
  return Math.max(0, new Date(COMMUNITY_DRAWING_CONTEST.endsAt).getTime() - now);
}
