import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Heart,
  MessageCircle,
  Newspaper,
  Plus,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Search,
  Wand2,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AvatarImage } from "./AvatarImage";
import { MemberSearch } from "./MemberSearch";
import { Handle } from "./Handle";
import { RichMentionText, buildMentionLookup } from "./RichMentionText";
import { UserBadges } from "./UserBadges";
import StreamerGradeBadge from "./StreamerGradeBadge";
import { WeeklyRankingCountdown } from "./WeeklyRankingCountdown";
import { ReportButton } from "./ReportButton";
import { formatRelative, parsePostImageUrl, parseVideoUrl } from "../lib/helpers";
import {
  COMMUNITY_DRAWING_CONTEST,
  formatContestCountdown,
  isDrawingContestEntry,
} from "../data/communityContest";
import { getOfficial } from "../data/officials";
import type { StreamerGradeDto } from "../lib/api";
import type { CommunityPost } from "../types";

export type CommunityTab = "following" | "for-you" | "trending" | "news" | "media" | "text";

type ProfileSummary = {
  username?: string | null;
  handle?: string | null;
  avatarImageUrl?: string | null;
  grade?: StreamerGradeDto | null;
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
  onDeletePost?: (postId: string) => void;
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
    grade?: StreamerGradeDto | null;
  }>;
  weeklyLabel?: string;
  weekStartIso?: string | null;
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
  onDeletePost,
  savedPostIds,
  activeTab,
  onChangeTab,
  leaderboard = [],
  weeklyLabel,
  weekStartIso,
}: CommunityImmersiveFeedProps) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [likeBurst, setLikeBurst] = useState<{ postId: string; token: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [audibleVideoPostId, setAudibleVideoPostId] = useState<string | null>(null);
  const [pendingDeletePostId, setPendingDeletePostId] = useState<string | null>(null);
  const tapDownRef = useRef<{ postId: string; x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ postId: string | null; time: number } | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const fullscreenSocialMode = false;
  useEffect(() => {
    return () => {
      if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  function triggerLikeBurst(postId: string) {
    setLikeBurst((current) => ({ postId, token: (current?.token ?? 0) + 1 }));
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(() => {
      setLikeBurst((current) => (current?.postId === postId ? null : current));
      burstTimerRef.current = null;
    }, 2000);
  }

  function handleMediaTap(postId: string, liked: boolean, timestamp: number) {
    const now = timestamp;
    const last = lastTapRef.current;
    if (last && last.postId === postId && now - last.time <= 320) {
      lastTapRef.current = null;
      triggerLikeBurst(postId);
      if (!liked) onLike(postId);
      return;
    }
    lastTapRef.current = { postId, time: now };
    window.setTimeout(() => {
      if (lastTapRef.current?.postId === postId && now === lastTapRef.current.time) {
        lastTapRef.current = null;
      }
    }, 340);
  }

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

  const visiblePosts = useMemo(() => {
    if (filteredPosts.length > 0) return filteredPosts;
    if (posts.length === 0) return filteredPosts;
    if (activeTab === "news") return filteredPosts;
    return [...posts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activeTab, filteredPosts, posts]);

  const contestEntries = useMemo(
    () => posts.filter(isDrawingContestEntry),
    [posts],
  );

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
          id: "news-contest",
          kind: "news",
          title: "Concours de dessin",
          subtitle: "Actualité communautaire",
          body: top
            ? `Le concours #concoursdessin récompense le post le plus liké avec 1000 lueurs et 6 nourritures familier.`
            : "Le concours #concoursdessin met les dessins de la communauté en avant pendant 24h00.",
        },
        {
          id: "news-top10",
          kind: "news",
          title: "Top 10 les plus actifs",
          subtitle: weeklyLabel ?? "Classement live de la semaine",
          body: top
            ? `${top.username} domine actuellement la communauté avec ${top.score} points. Monte au classement avec des posts, des likes, des commentaires et de l'activité régulière.`
            : "Aucun classement disponible pour le moment. Publie, commente et réagis pour faire apparaître les premiers profils.",
        },
        {
          id: "news-oracle",
          kind: "news",
          title: "Oracle des runes",
          subtitle: "Rituels, indices et accès direct",
          body:
            "L’Oracle reste accessible depuis cette interface. Lance un rituel, consulte ton statut quotidien et retrouve le gameplay mystique comme avant.",
        },
      ];
    }

    return visiblePosts.map((post) => ({ kind: "post" as const, id: post.id, post }));
  }, [activeTab, leaderboard, weeklyLabel, visiblePosts]);

  return (
    <div className="relative h-[100dvh] min-h-0 overflow-hidden bg-night-950 text-ivory">
      <div className="absolute inset-x-0 top-0 z-30 border-b border-white/8 bg-night-950/68 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 pt-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-2">
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

          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => setSearchOpen((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/75 transition hover:border-gold-400/40 hover:text-gold-100"
              aria-label="Rechercher"
            >
              <Search className="h-5 w-5" />
            </button>
            {fullscreenSocialMode && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/75 transition hover:border-gold-400/40 hover:text-gold-100"
                aria-label="Quitter le Social"
              >
                ←
              </button>
            )}
            <button
              type="button"
              onClick={onOpenComposer}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              aria-label="Créer"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="social-feed-scroll h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth snap-y snap-mandatory touch-pan-y"
        style={{
          WebkitOverflowScrolling: "touch",
          paddingTop: "4.55rem",
          paddingBottom: "calc(7.5rem + env(safe-area-inset-bottom))",
          scrollPaddingBottom: "calc(7.5rem + env(safe-area-inset-bottom))",
        }}
      >
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
              <section key={entry.id} className="h-[calc(100dvh-5.25rem)] snap-start px-0 py-0">
                <div className="mx-auto flex h-full w-full max-w-none items-center px-0">
                  <div className="panel-app w-full overflow-hidden rounded-none border-0 p-4 sm:p-7">
                    <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/20 bg-gold-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      Actualité
                    </div>
                    <h2 className="mt-4 font-display text-3xl text-gold-100">{entry.title}</h2>
                    <p className="mt-2 text-sm text-ivory/65">{entry.subtitle}</p>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-ivory/82">{entry.body}</p>

                    {entry.id === "news-top10" && leaderboard.length > 0 && (
                      <div className="mt-5 space-y-4">
                        <div className="rounded-3xl border border-gold-400/20 bg-night-900/45 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">
                                Comment entrer dans le top
                              </p>
                              <p className="mt-1 text-sm leading-6 text-ivory/78">
                                Plus tu postes, commentes, likes et relances l’activité, plus ton score monte.
                              </p>
                            </div>
                            {weekStartIso ? (
                              <div className="max-w-[240px]">
                                <WeeklyRankingCountdown
                                  weekStartIso={weekStartIso}
                                  active
                                  compact
                                  showWeekRange={false}
                                  label="Fin de semaine dans"
                                  completeLabel="Classement hebdo clos"
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ivory/70">
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Publier un post
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Commenter régulièrement
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Réagir avec des likes
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                              Participer aux événements
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {leaderboard.slice(0, 10).map((member, rank) => (
                            <Link
                              key={member.id}
                              to={`/u/${member.id}`}
                              className="group rounded-3xl border border-white/8 bg-gradient-to-br from-night-900/75 to-night-950/40 p-4 transition hover:border-gold-400/40"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500/15 text-sm font-bold text-gold-200">
                                  {rank + 1}
                                </div>
                                <AvatarImage
                                  candidates={[member.avatarImageUrl]}
                                  fallbackSeed={member.id}
                                  alt={member.username}
                                  className="h-11 w-11 rounded-full object-cover ring-2 ring-gold-400/30"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-display text-base text-gold-100 group-hover:text-gold-50">
                                    {member.username}
                                  </p>
                                  <p className="text-xs text-ivory/55">
                                    {member.score} points • {member.postCount} posts
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ivory/65">
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                                      {member.commentCount} commentaires
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                                      {member.reactionCount} likes
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                                      Score actif
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                        <div className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm text-ivory/78">
                          <p className="font-semibold text-cyan-100">
                            Récompenses hebdomadaires
                          </p>
                          <p className="mt-1 leading-6">
                            Le top 5 reçoit une mise en avant sociale et les 3 premiers cumulent des récompenses
                            de Lueurs selon le classement hebdomadaire.
                          </p>
                        </div>
                      </div>
                    )}

                    {entry.id === "news-contest" && (
                      <div className="mt-5 overflow-hidden rounded-[32px] border border-gold-400/20 bg-night-950/55 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
                        <div className="relative min-h-[18rem] overflow-hidden">
                          <div
                            className="absolute inset-0 bg-cover bg-center opacity-90"
                            style={{
                              backgroundImage: `linear-gradient(180deg, rgba(4,6,15,0.04), rgba(4,6,15,0.78)), url(${COMMUNITY_DRAWING_CONTEST.bannerImage})`,
                            }}
                          />
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.18),transparent_35%),linear-gradient(135deg,rgba(7,5,11,0.15),rgba(7,5,11,0.72))]" />
                          <div className="relative flex h-full flex-col justify-end p-5 sm:p-6">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300/35 bg-gold-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-100">
                                <Sparkles className="h-3.5 w-3.5" />
                                Concours officiel
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-100">
                                #concoursdessin
                              </span>
                            </div>
                            <h2 className="mt-4 max-w-3xl font-display text-3xl text-gold-100 sm:text-4xl">
                              {COMMUNITY_DRAWING_CONTEST.title}
                            </h2>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-ivory/78 sm:text-base">
                              Poste ton dessin avec <span className="font-semibold text-gold-100">#concoursdessin</span>.
                              Le post le plus liké gagne <span className="font-semibold text-gold-100">1000 lueurs</span> et{" "}
                              <span className="font-semibold text-gold-100">6 nourritures familier</span>.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                              <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-night-950/60 px-4 py-2 text-sm text-ivory/80">
                                <Trophy className="h-4 w-4 text-gold-200" />
                                {contestEntries.length} participant{contestEntries.length > 1 ? "s" : ""}
                              </span>
                              <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-night-950/60 px-4 py-2 text-sm text-ivory/80">
                                <CalendarClock className="h-4 w-4 text-gold-200" />
                                {formatContestCountdown(Math.max(0, new Date(COMMUNITY_DRAWING_CONTEST.endsAt).getTime() - now))}
                              </span>
                              <Link
                                to="/communaute/hashtag/concoursdessin"
                                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gold-500/20 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/30"
                              >
                                Voir les participations
                              </Link>
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-4 border-t border-white/8 bg-night-950/45 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr),360px]">
                          <div className="space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">
                              Comment participer
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {COMMUNITY_DRAWING_CONTEST.rules.map((rule) => (
                                <div
                                  key={rule}
                                  className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3 text-sm leading-6 text-ivory/78"
                                >
                                  {rule}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-[28px] border border-gold-400/20 bg-gradient-to-br from-gold-500/10 via-night-900/45 to-royal-500/10 p-4">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">
                              Top 1 à 10
                            </p>
                            <div className="mt-3 grid gap-2">
                              {leaderboard.slice(0, 10).map((member, rank) => (
                                <Link
                                  key={member.id}
                                  to={`/u/${member.id}`}
                                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-night-950/45 px-3 py-2 transition hover:border-gold-400/40"
                                >
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-400/20 bg-gold-500/10 text-xs font-bold text-gold-100">
                                    {rank + 1}
                                  </div>
                                  <AvatarImage
                                    candidates={[member.avatarImageUrl]}
                                    fallbackSeed={member.id}
                                    alt={member.username}
                                    className="h-9 w-9 rounded-full object-cover ring-2 ring-gold-400/25"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-display text-sm text-gold-100">
                                      {member.username}
                                    </p>
                                    <p className="text-[11px] text-ivory/55">
                                      {member.score} pts • {member.reactionCount} likes
                                    </p>
                                  </div>
                                </Link>
                              ))}
                              {leaderboard.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-ivory/55">
                                  Aucun top disponible pour le moment.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {entry.id === "news-oracle" && (
                      <div className="mt-5 rounded-3xl border border-gold-400/20 bg-gradient-to-br from-gold-500/10 via-night-900/50 to-royal-500/10 p-4">
                        <p className="text-sm leading-6 text-gold-100">
                          L’Oracle des runes est utilisable depuis son onglet dédié. Tu peux y relancer
                          tes rituels quotidiens, consulter ton statut et voir les derniers retours.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            to="/oracle"
                            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gold-500/20 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/30"
                          >
                            <Wand2 className="h-4 w-4" />
                            Jouer à l’Oracle
                          </Link>
                          <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-ivory/70">
                            3 tentatives / jour
                          </span>
                        </div>
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
                className="h-[calc(100dvh-5.25rem)] snap-start px-0 py-0"
              >
                <div className="mx-auto flex h-full w-full max-w-none items-stretch px-0">
                  <article className="panel-app relative flex h-full w-full overflow-hidden rounded-none border-0 bg-night-950/80 p-4 shadow-[0_30px_60px_rgba(0,0,0,0.38)] sm:rounded-[28px] sm:border sm:border-white/8 sm:p-6">
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

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:gap-3">
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
            <section
              key={post.id}
              id={`post-${post.id}`}
              className="h-[calc(100dvh-5.25rem)] snap-start px-0 py-0"
            >
              <div
                className="relative h-full w-full overflow-hidden"
                onPointerDown={(event) => {
                  if (event.button !== 0 && event.pointerType === "mouse") return;
                  tapDownRef.current = {
                    postId: post.id,
                    x: event.clientX,
                    y: event.clientY,
                    time: Date.now(),
                  };
                }}
                onPointerUp={(event) => {
                  const down = tapDownRef.current;
                  if (!down || down.postId !== post.id) return;
                  tapDownRef.current = null;
                  const travel = Math.hypot(event.clientX - down.x, event.clientY - down.y);
                  const heldFor = Date.now() - down.time;
                  if (travel > 14 || heldFor > 650) return;
                  handleMediaTap(post.id, liked, event.timeStamp);
                }}
                onPointerCancel={() => {
                  tapDownRef.current = null;
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  triggerLikeBurst(post.id);
                  if (!liked) onLike(post.id);
                }}
              >
                <div className="absolute inset-0">
                  {video?.kind ? (
                    <div className="relative h-full w-full">
                      <video
                        src={post.videoUrl}
                        className="h-full w-full object-cover"
                        muted={audibleVideoPostId !== post.id}
                        loop
                        playsInline
                        autoPlay
                        preload="metadata"
                        controls
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAudibleVideoPostId((current) =>
                            current === post.id ? null : post.id,
                          );
                        }}
                        className="absolute right-3 top-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-night-950/70 px-3 py-2 text-xs text-ivory/90 backdrop-blur-md transition hover:border-gold-400/45 hover:text-gold-100"
                      >
                        {audibleVideoPostId === post.id ? (
                          <>
                            <Volume2 className="h-4 w-4" />
                            Son
                          </>
                        ) : (
                          <>
                            <VolumeX className="h-4 w-4" />
                            Muet
                          </>
                        )}
                      </button>
                    </div>
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

                {likeBurst?.postId === post.id && (
                  <div
                    key={likeBurst.token}
                    className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
                  >
                    <div className="flex flex-col items-center gap-2 rounded-full border border-white/10 bg-night-950/35 px-6 py-5 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md animate-[socialLikeBurst_2s_ease-out_forwards]">
                      <Heart className="h-20 w-20 text-rose-400 drop-shadow-[0_0_18px_rgba(244,63,94,0.45)]" fill="currentColor" />
                      <span className="text-sm font-semibold text-white/92">Tu as aimé le post</span>
                    </div>
                  </div>
                )}

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

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:items-end sm:gap-3">
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
                      {currentUserId && currentUserId === post.authorId ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeletePostId(post.id)}
                          className="inline-flex min-h-11 w-full min-w-0 flex-col items-center justify-center rounded-full border border-white/10 bg-night-950/45 px-3 py-2 text-xs text-rose-200 backdrop-blur-sm transition hover:border-rose-300/40 hover:text-rose-100"
                          aria-label="Supprimer mon post"
                        >
                          <Trash2 className="h-5 w-5" />
                          <span className="mt-1 leading-none">Suppr.</span>
                        </button>
                      ) : (
                        <ReportButton
                          targetType="post"
                          targetId={post.id}
                          targetLabel={`Post de ${displayName}`}
                          targetUrl={`/communaute#post-${post.id}`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {searchOpen && (
        <div className="absolute inset-0 z-40 bg-night-950/80 backdrop-blur-md">
          <div className="absolute inset-x-0 top-0 border-b border-white/8 bg-night-950/85 px-4 py-3">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">Recherche sociale</p>
                <h2 className="font-display text-xl text-gold-100">Trouver un membre ou un post</h2>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ivory/75"
                aria-label="Fermer la recherche"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mx-auto mt-20 max-w-2xl px-4">
            <MemberSearch />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/communaute/hashtag/concoursdessin"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gold-400/25 bg-gold-500/10 px-4 py-2 text-sm text-gold-100"
              >
                <Sparkles className="h-4 w-4" />
                #concoursdessin
              </Link>
              <button
                type="button"
                onClick={onOpenComposer}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-ivory/80"
              >
                <Plus className="h-4 w-4" />
                Nouveau post
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePostId && (
        <div className="absolute inset-0 z-50 bg-night-950/82 backdrop-blur-md">
          <div className="flex h-full w-full items-end justify-center p-4 sm:items-center">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-night-950 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                Suppression du post
              </p>
              <h2 className="mt-2 font-display text-2xl text-gold-100">
                Supprimer définitivement ce post ?
              </h2>
              <p className="mt-3 text-sm leading-6 text-ivory/75">
                Cette action retire le post du feed, du profil et des pages liées.
                Elle est irréversible.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingDeletePostId(null)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75 transition hover:border-white/20 hover:text-ivory"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = pendingDeletePostId;
                    setPendingDeletePostId(null);
                    if (targetId) onDeletePost?.(targetId);
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
        "inline-flex min-h-11 w-full min-w-0 flex-col items-center justify-center rounded-full border px-3 py-2 text-xs backdrop-blur-sm transition active:scale-[0.98]",
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
