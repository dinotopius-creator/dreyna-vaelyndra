import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, ImageIcon, Plus, Trophy } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { Handle } from "../components/Handle";
import { CommunityContestBanner } from "../components/CommunityContestBanner";
import { RichSocialText } from "../components/RichSocialText";
import { buildMentionLookup } from "../components/RichMentionText";
import { getOfficial } from "../data/officials";
import {
  COMMUNITY_DRAWING_CONTEST,
  drawingContestEndsIn,
  extractHashtags,
  isDrawingContestEntry,
} from "../data/communityContest";
import { formatRelative, parsePostImageUrl, parseVideoUrl } from "../lib/helpers";
import { UserBadges } from "../components/UserBadges";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { apiSettleDrawingContest } from "../lib/api";

function reactionCount(post: { reactions: Record<string, string[]> }) {
  const unique = new Set<string>();
  Object.values(post.reactions).forEach((ids) => ids.forEach((id) => unique.add(id)));
  return unique.size;
}

export function CommunityHashtag() {
  const { posts } = useStore();
  const { users } = useAuth();
  const usersById = useMemo(
    () => new Map(users.map((entry) => [entry.id, entry])),
    [users],
  );

  const mentionTargets = useMemo(() => {
    return buildMentionLookup(
      users.map((entry) => ({
        userId: entry.id,
        handle: entry.handle ?? null,
        username: entry.username,
      })),
    );
  }, [users]);

  const rankedEntries = useMemo(() => {
    return [...posts]
      .filter((post) => extractHashtags(post.content).includes(COMMUNITY_DRAWING_CONTEST.hashtag))
      .filter((post) => isDrawingContestEntry(post))
      .sort((a, b) => {
        const likesDiff = reactionCount(b) - reactionCount(a);
        if (likesDiff !== 0) return likesDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [posts]);

  const countdown = drawingContestEndsIn();
  const active = countdown > 0;

  useEffect(() => {
    if (active) return;
    void apiSettleDrawingContest().catch(() => {
      /* best effort */
    });
  }, [active]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          to="/communaute"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-night-900/60 px-4 py-2 text-sm text-ivory/75 transition hover:border-gold-300/45 hover:text-gold-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour Social
        </Link>
        <Link
          to="/communaute"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gold-300/30 bg-gold-500/10 px-4 py-2 text-sm text-gold-100 transition hover:border-gold-300/60"
        >
          <Plus className="h-4 w-4" />
          Créer un post
        </Link>
      </div>

      <SectionHeading
        eyebrow="#concoursdessin"
        title="Concours de dessin"
        subtitle="Tous les posts participants sont regroupés ici. Le concours dure 24h et se clôture automatiquement."
      />

      <div className="mt-8 space-y-6">
        <CommunityContestBanner />

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
          <div className="card-royal p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ivory/70">
                <CalendarClock className="h-3.5 w-3.5 text-gold-200" />
                {active ? "Concours actif" : "Concours terminé"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ivory/70">
                <ImageIcon className="h-3.5 w-3.5 text-gold-200" />
                Image obligatoire
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ivory/70">
                <Trophy className="h-3.5 w-3.5 text-gold-200" />
                Classement par likes
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {COMMUNITY_DRAWING_CONTEST.rules.map((rule) => (
                <div
                  key={rule}
                  className="rounded-2xl border border-gold-300/15 bg-night-900/60 p-4 text-sm text-ivory/78"
                >
                  {rule}
                </div>
              ))}
            </div>
          </div>

          <aside className="card-royal p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-200/70">
              Top actuel
            </p>
            <p className="mt-2 font-display text-2xl text-gold-100">
              {rankedEntries[0]
                ? `${reactionCount(rankedEntries[0])} likes`
                : "Aucun participant"}
            </p>
            <p className="mt-2 text-sm text-ivory/70">
              {active
                ? `Il reste ${Math.max(0, Math.floor(countdown / 1000))} secondes avant la clôture.`
                : "Le concours est clos. Les participations restent visibles."}
            </p>
          </aside>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-gold-200">
              Participations
            </h2>
            <span className="text-xs text-ivory/55">
              {rankedEntries.length} publication{rankedEntries.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-4">
            {rankedEntries.map((post, index) => {
              const profile = usersById.get(post.authorId);
              const official = getOfficial(post.authorId);
              const displayName = profile?.username ?? post.authorName;
              const displayHandle = profile?.handle ?? post.authorHandle ?? null;
              const displayAvatar = profile?.avatar ?? post.authorAvatar;
              return (
                <article
                  key={post.id}
                  id={`post-${post.id}`}
                  className="card-royal overflow-hidden p-5"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold-300/30 bg-gold-500/10 text-sm font-semibold text-gold-100">
                      #{index + 1}
                    </div>
                    <AvatarImage
                      candidates={[displayAvatar, post.authorAvatar]}
                      fallbackSeed={post.authorId}
                      alt={displayName}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-300/30"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/u/${post.authorId}`}
                          className="font-display text-gold-200"
                        >
                          {displayName}
                        </Link>
                        {post.authorGrade && (
                          <StreamerGradeBadge
                            grade={post.authorGrade}
                            size="sm"
                          />
                        )}
                        <UserBadges
                          role={official?.role}
                          creatureId={official?.creatureId}
                        />
                        {isDrawingContestEntry(post) && (
                          <span className="inline-flex items-center rounded-full border border-emerald-300/25 bg-emerald-500/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                            Participation concours
                          </span>
                        )}
                      </div>
                      <Handle handle={displayHandle} />
                      <p className="mt-1 text-xs text-ivory/45">
                        {formatRelative(post.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl text-gold-100">
                        {reactionCount(post)} likes
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-night-950/60 p-4">
                    <RichSocialText
                      content={post.content}
                      mentionsByHandle={mentionTargets}
                      profileHref={(userId) => `/u/${userId}`}
                      className="whitespace-pre-wrap break-words text-sm leading-6 text-ivory/85"
                    />
                  </div>

                  {post.imageUrl && (
                    (() => {
                      const parsed = parsePostImageUrl(post.imageUrl);
                      const src =
                        parsed && parsed.kind === "image" ? parsed.src : post.imageUrl;
                      return (
                        <img
                          src={src}
                          alt="Dessin du concours"
                          className="mt-4 max-h-[480px] w-full rounded-2xl object-cover"
                        />
                      );
                    })()
                  )}

                  {post.videoUrl && <ContestVideo url={post.videoUrl} />}
                </article>
              );
            })}
            {rankedEntries.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-white/10 bg-night-900/40 p-8 text-center text-sm text-ivory/60">
                Aucun post éligible n'a encore été publié. Ajoute une image et
                #concoursdessin pour apparaître ici.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ContestVideo({ url }: { url: string }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;
  if (parsed.kind === "youtube" || parsed.kind === "tiktok") {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-night-900">
        <div className="relative w-full pt-[56.25%]">
          <iframe
            src={parsed.embedUrl}
            title="Contest video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    );
  }
  if (parsed.kind === "file") {
    return (
      <video
        controls
        preload="metadata"
        className="mt-4 max-h-[500px] w-full rounded-2xl border border-white/10 bg-night-900"
      >
        <source src={parsed.src} />
      </video>
    );
  }
  return null;
}
