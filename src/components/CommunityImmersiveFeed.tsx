import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Heart,
  MessageCircle,
  Newspaper,
  Plus,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { AvatarImage } from "./AvatarImage";
import { Handle } from "./Handle";
import { RichMentionText, buildMentionLookup } from "./RichMentionText";
import { UserBadges } from "./UserBadges";
import StreamerGradeBadge from "./StreamerGradeBadge";
import { formatRelative, parsePostImageUrl, parseVideoUrl } from "../lib/helpers";
import { getOfficial } from "../data/officials";
import type { CommunityPost } from "../types";

export type CommunityTab = "following" | "for-you" | "trending" | "news" | "media" | "text";

type ProfileSummary = {
  username?: string | null;
  handle?: string | null;
  avatarImageUrl?: string | null;
  grade?: any;
  role?: string;
  creature?: { id?: string } | null;
  isFollowing?: boolean;
  following?: boolean;
};

interface CommunityImmersiveFeedProps {
  posts: CommunityPost[];
  usersById: Map<
    string,
    { id: string; username: string; avatar?: string; handle?: string | null; creatureId?: string }
  >;
  profilesById: Record<string, ProfileSummary>;
  currentUserId?: string | null;
  mentionTargets: ReturnType<typeof buildMentionLookup>;
  onLike: (postId: string) => void;
  onShare: (post: CommunityPost) => void;
  onSave: (postId: string) => void;
  onOpenComposer: () => void;
  onOpenComments: (postId: string) => void;
  savedPostIds: Set<string>;
  activeTab: CommunityTab;
  onChangeTab: (tab: CommunityTab) => void;
  leaderboard?: Array<{
    id: string;
    username: string;
    handle: string | null;
    avatarImageUrl: string;
    score: number;
    postCount: number;
    commentCount: number;
    reactionCount: number;
    grade?: any;
  }>;
  weeklyLabel?: string;
}

const TAB_META: Record<CommunityTab, { label: string; icon: typeof Users }> = {
  following: { label: "Suivis", icon: Users },
  "for-you": { label: "Pour toi", icon: Sparkles },
  trending: { label: "Tendance", icon: TrendingUp },
  news: { label: "Actualité", icon: Newspaper },
  media: { label: "Photos/Vidéos", icon: Sparkles },
  text: { label: "Posts texte", icon: MessageCircle },
};

function getPostScore(post: CommunityPost) {
  const likes = Object.values(post.reactions ?? {}).reduce(
    (total, users) => total + users.length,
    0,
  );
  return likes + post.comments.length * 2 + (post.videoUrl ? 3 : 0);
}

function hasMedia(post: CommunityPost) {
  return Boolean(post.imageUrl || post.videoUrl);
}

function isTextOnlyPost(post: CommunityPost) {
  return !hasMedia(post);
}

function isPhotoPost(post: CommunityPost) {
  return Boolean(post.imageUrl && !post.videoUrl);
}

function isVideoPost(post: CommunityPost) {
  return Boolean(post.videoUrl);
}

function isMediaPost(post: CommunityPost) {
  return hasMedia(post);
}

function isNewsPost(post: CommunityPost) {
  return Boolean(
    post.officialLabel ||
      /top|oracle|annonce|événement|evenement|actualité|news/i.test(
        `${post.content} ${post.authorName} ${post.postType ?? ""}`,
      ),
  );
}

function mediaTitle(post: CommunityPost) {
  if (isVideoPost(post)) return "Vidéo";
  if (isPhotoPost(post)) return "Photo";
  return "Média";
}

export function CommunityImmersiveFeed({
  posts,
  usersById,
  profilesById,
  currentUserId,
  mentionTargets,
  onLike,
  onShare,
  onSave,
  onOpenComposer,
  onOpenComments,
  savedPostIds,
  activeTab,
  onChangeTab,
  leaderboard = [],
  weeklyLabel,
}: CommunityImmersiveFeedProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const fullscreenSocialMode =
    location.pathname === "/social/play" || location.pathname === "/communaute";

  const filteredPosts = useMemo(() => {
    if (activeTab === "following") {
      return posts.filter((post) => {
        const profile = profilesById[post.authorId];
        return Boolean(
          profile?.isFollowing || profile?.following || post.authorId === currentUserId,
        );
      });
    }

    if (activeTab === "trending") {
      return [...posts]
        .sort((a, b) => getPostScore(b) - getPostScore(a))
        .slice(0, Math.max(8, posts.length));
    }

    if (activeTab === "news") return posts.filter(isNewsPost);
    if (activeTab === "media") return posts.filter(isMediaPost);
    if (activeTab === "text") return posts.filter(isTextOnlyPost);

    return [...posts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activeTab, currentUserId, posts, profilesById]);

  const feedEntries = useMemo<
    Array<
      | {
          kind: "news";
          id: string;
          title: string;
          subtitle: string;
          body: string;
        }
      | { kind: "post"; id: string; post: CommunityPost }
    >
  >(() => {
    if (activeTab === "news") {
      const top = leaderboard[0];
      return [
        {
          id: "news-top5",
          kind: "news",
          title: "Top 5 les plus actifs",
          subtitle: weeklyLabel ?? "Classement live de la semaine",
          body: top
            ? `${top.username} domine actuellement la communauté avec ${top.score} points.`
            : "Aucun classement disponible pour le moment.",
        },
        {
          id: "news-oracle",
          kind: "news",
          title: "Oracle des runes",
          subtitle: "Rituels, indices et nouveautés communautaires",
          body:
            "Une carte dédiée à l’Oracle des runes peut accueillir les annonces, rituels et révélations de Vaelyndra.",
        },
      ];
    }

    return filteredPosts.map((post) => ({ kind: "post" as const, id: post.id, post }));
  }, [activeTab, filteredPosts, leaderboard, weeklyLabel]);

  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col overflow-hidden bg-night-950 text-ivory">
      <div className="sticky top-0 z-30 border-b border-white/8 bg-night-950/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 pb-3 pt-3 sm:px-5">
          <div className="flex items-center gap-3">
            {fullscreenSocialMode && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/70 transition hover:border-gold-400/40 hover:text-gold-100"
                aria-label="Quitter le Social"
              >
                ←
              </button>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-gold-300/80">
                Communauté
              </p>
              <h1 className="font-display text-2xl text-gold-100">Feed immersif</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenComposer}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold-shine px-4 py-2.5 text-sm font-semibold text-night-900"
          >
            <Plus className="h-4 w-4" />
            Créer
          </button>
        </div>

        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-3 sm:px-5">
          {(Object.keys(TAB_META) as CommunityTab[]).map((tab) => {
            const Icon = TAB_META[tab].icon;
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onChangeTab(tab)}
                className={clsx(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition",
                  active
                    ? "border-gold-400/60 bg-gold-500/15 text-gold-200 shadow-[0_0_0_1px_rgba(250,204,21,0.12)]"
                    : "border-white/10 bg-white/5 text-ivory/70 hover:border-gold-400/30 hover:text-gold-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {TAB_META[tab].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-full overflow-y-auto overflow-x-hidden scroll-smooth snap-y snap-mandatory">
        {feedEntries.length === 0 && activeTab === "following" ? (
          <div className="mx-auto flex min-h-[calc(100vh-160px)] max-w-3xl items-center px-3 py-8 text-center text-ivory/65">
            <div className="panel-app w-full p-6">
              <p className="font-display text-2xl text-gold-100">Suivez des membres pour voir leurs posts ici.</p>
              <p className="mt-2 text-sm">Découvrez le feed Pour toi ou les tendances pour remplir votre fil.</p>
            </div>
          </div>
        ) : null}

        {feedEntries.map((entry) => {
          if (entry.kind === "news") {
            return (
              <section
                key={entry.id}
                className="min-h-[calc(100vh-160px)] snap-start px-3 py-4 sm:px-5"
              >
                <div className="mx-auto flex h-full max-w-3xl items-center">
                  <div className="panel-app w-full overflow-hidden p-5 sm:p-7">
                    <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/20 bg-gold-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      Actualité
                    </div>
                    <h2 className="mt-4 font-display text-3xl text-gold-100">{entry.title}</h2>
                    <p className="mt-2 text-sm text-ivory/65">{entry.subtitle}</p>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-ivory/82">{entry.body}</p>

                    {entry.id === "news-top5" && leaderboard.length > 0 && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {leaderboard.slice(0, 5).map((member, rank) => (
                          <Link
                            key={member.id}
                            to={`/u/${member.id}`}
                            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-night-900/40 p-3 transition hover:border-gold-400/40"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500/15 text-sm font-bold text-gold-200">
                              {rank + 1}
                            </div>
                            <AvatarImage
                              candidates={[member.avatarImageUrl]}
                              fallbackSeed={member.id}
                              alt={member.username}
                              className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/30"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-sm text-gold-100">
                                {member.username}
                              </p>
                              <p className="text-xs text-ivory/55">{member.score} points</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {entry.id === "news-oracle" && (
                      <div className="mt-5 rounded-3xl border border-gold-400/20 bg-gradient-to-br from-gold-500/10 via-night-900/50 to-royal-500/10 p-4">
                        <p className="text-sm text-gold-100">
                          Oracle des runes prêt à accueillir les annonces, rituels et révélations
                          de la communauté.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          }

          const post = entry.post;
          const profile = profilesById[post.authorId];
          const author = usersById.get(post.authorId);
          const displayName = profile?.username || author?.username || post.authorName;
          const displayHandle = profile?.handle ?? author?.handle ?? post.authorHandle ?? null;
          const avatar = profile?.avatarImageUrl || author?.avatar || post.authorAvatar;
          const grade = profile?.grade ?? post.authorGrade ?? null;
          const media = post.imageUrl ? parsePostImageUrl(post.imageUrl) : null;
          const video = post.videoUrl ? parseVideoUrl(post.videoUrl) : null;
          const liked = currentUserId
            ? Object.values(post.reactions ?? {}).some((users) => users.includes(currentUserId))
            : false;
          const saved = savedPostIds.has(post.id);
          const reactionCount = Object.values(post.reactions ?? {}).reduce(
            (sum, users) => sum + users.length,
            0,
          );
          const isMedia = isMediaPost(post);

          if (!isMedia || activeTab === "text") {
            return (
              <section
                key={post.id}
                id={`post-${post.id}`}
                className="snap-start px-3 py-4 sm:px-5"
              >
                <div className="mx-auto flex min-h-[calc(100vh-160px)] max-w-3xl items-stretch">
                  <article className="panel-app relative flex w-full overflow-hidden rounded-[28px] border border-white/8 bg-night-950/80 p-4 shadow-[0_30px_60px_rgba(0,0,0,0.38)] sm:p-6">
                    <div className="relative flex w-full flex-col justify-between">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <AvatarImage
                            candidates={[avatar, post.authorAvatar]}
                            fallbackSeed={post.authorId}
                            alt={displayName}
                            className="h-12 w-12 rounded-full object-cover ring-2 ring-gold-400/35"
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/u/${post.authorId}`}
                              className="block truncate font-display text-lg text-gold-100"
                            >
                              {displayName}
                            </Link>
                            <Handle handle={displayHandle} size="xs" />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {grade && <StreamerGradeBadge grade={grade} size="sm" />}
                              <UserBadges
                                role={profile?.role ?? getOfficial(post.authorId)?.role}
                                creatureId={
                                  profile?.creature?.id ??
                                  author?.creatureId ??
                                  getOfficial(post.authorId)?.creatureId
                                }
                              />
                              <span className="text-[11px] uppercase tracking-[0.22em] text-ivory/45">
                                {formatRelative(post.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row gap-3">
                          <FeedAction
                            icon={<Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} />}
                            label={liked ? "Aimé" : "Like"}
                            active={liked}
                            onClick={() => onLike(post.id)}
                            count={reactionCount}
                          />
                          <FeedAction
                            icon={<MessageCircle className="h-5 w-5" />}
                            label="Com."
                            onClick={() => onOpenComments(post.id)}
                            count={post.comments.length}
                          />
                          <FeedAction
                            icon={
                              saved ? (
                                <BookmarkCheck className="h-5 w-5" />
                              ) : (
                                <Bookmark className="h-5 w-5" />
                              )
                            }
                            label={saved ? "Sauvé" : "Save"}
                            active={saved}
                            onClick={() => onSave(post.id)}
                          />
                          <FeedAction
                            icon={<Share2 className="h-5 w-5" />}
                            label="Partager"
                            onClick={() => onShare(post)}
                          />
                        </div>
                      </div>

                      <div className="mt-8 flex-1">
                        <div className="max-w-2xl space-y-3">
                          <RichMentionText
                            content={post.content}
                            mentionsByHandle={mentionTargets}
                            profileHref={(authorId) => `/u/${authorId}`}
                            className="text-lg leading-8 text-white sm:text-xl sm:leading-8"
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            );
          }

          return (
            <section key={post.id} id={`post-${post.id}`} className="snap-start px-0 py-0">
              <div className="relative h-[calc(100vh-88px)] min-h-[620px] w-full overflow-hidden">
                <div className="absolute inset-0">
                  {video?.kind ? (
                    <video
                      src={post.videoUrl}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      autoPlay
                      preload="metadata"
                    />
                  ) : media?.kind === "image" ? (
                    <img
                      src={media.src}
                      alt="Media du post"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_40%),linear-gradient(180deg,#020617,#0f172a)]" />
                  )}
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/20 to-night-950/35" />

                <div className="absolute inset-0 flex flex-col justify-between px-3 py-4 sm:px-5 sm:py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-full border border-white/10 bg-night-950/35 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-ivory/70 backdrop-blur-sm">
                      {mediaTitle(post)}
                    </div>
                    <div className="inline-flex rounded-full border border-white/10 bg-night-950/35 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-ivory/70 backdrop-blur-sm">
                      Plein écran
                    </div>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-4">
                    <div className="max-w-[62%] space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <AvatarImage
                          candidates={[avatar, post.authorAvatar]}
                          fallbackSeed={post.authorId}
                          alt={displayName}
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-gold-400/35"
                        />
                        <div className="min-w-0">
                          <Link
                            to={`/u/${post.authorId}`}
                            className="block truncate font-display text-lg text-gold-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                          >
                            {displayName}
                          </Link>
                          <Handle handle={displayHandle} size="xs" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {grade && <StreamerGradeBadge grade={grade} size="sm" />}
                        <UserBadges
                          role={profile?.role ?? getOfficial(post.authorId)?.role}
                          creatureId={
                            profile?.creature?.id ??
                            author?.creatureId ??
                            getOfficial(post.authorId)?.creatureId
                          }
                        />
                        <span className="text-[11px] uppercase tracking-[0.22em] text-ivory/70">
                          {formatRelative(post.createdAt)}
                        </span>
                      </div>
                      <RichMentionText
                        content={post.content}
                        mentionsByHandle={mentionTargets}
                        profileHref={(authorId) => `/u/${authorId}`}
                        className="max-w-xl text-[15px] leading-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] sm:text-lg sm:leading-7"
                      />
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <FeedAction
                        icon={<Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} />}
                        label={liked ? "Aimé" : "Like"}
                        active={liked}
                        onClick={() => onLike(post.id)}
                        count={reactionCount}
                      />
                      <FeedAction
                        icon={<MessageCircle className="h-5 w-5" />}
                        label="Com."
                        onClick={() => onOpenComments(post.id)}
                        count={post.comments.length}
                      />
                      <FeedAction
                        icon={
                          saved ? (
                            <BookmarkCheck className="h-5 w-5" />
                          ) : (
                            <Bookmark className="h-5 w-5" />
                          )
                        }
                        label={saved ? "Sauvé" : "Save"}
                        active={saved}
                        onClick={() => onSave(post.id)}
                      />
                      <FeedAction
                        icon={<Share2 className="h-5 w-5" />}
                        label="Partager"
                        onClick={() => onShare(post)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FeedAction({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-full border px-3 py-2 text-xs backdrop-blur-sm transition active:scale-[0.98]",
        active
          ? "border-gold-400/50 bg-gold-500/15 text-gold-200"
          : "border-white/10 bg-night-950/45 text-ivory/75 hover:border-gold-400/35 hover:text-gold-100",
      )}
      aria-label={label}
    >
      {icon}
      <span className="mt-1 leading-none">{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="mt-0.5 text-[10px] text-ivory/50">{count}</span>
      ) : null}
    </button>
  );
}
