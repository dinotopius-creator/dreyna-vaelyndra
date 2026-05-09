import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Film,
  Image,
  MessageCircle,
  Send,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { PostComments } from "../components/PostComments";
import { ReportButton } from "../components/ReportButton";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { MemberSearch } from "../components/MemberSearch";
import { AvatarImage } from "../components/AvatarImage";
import { getOfficial } from "../data/officials";
import { formatRelative, parseVideoUrl } from "../lib/helpers";
import {
  apiCreatePost,
  apiDeletePost,
  apiGetProfile,
  apiToggleReaction,
} from "../lib/api";

const MOCK_COMMUNITY_USER_IDS = new Set([
  "user-lyria",
  "user-caelum",
  "user-mira",
  "user-aeris",
  "user-sylas",
  "user-thalia",
]);

const QUICK_EMOJIS = ["✨", "👑", "🌿", "⚔️", "🌙", "🔮"];

function recommendationWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const today = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return `${date.getUTCFullYear()}-${Math.floor((day + start.getUTCDay()) / 7)}`;
}

function weeklyRecommendationHash(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function Community() {
  const { posts, dispatch } = useStore();
  const { user, users, isQueen } = useAuth();
  const { notify } = useToast();
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [profileAvatars, setProfileAvatars] = useState<Record<string, string>>(
    {},
  );

  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );
  const recommendedMembers = useMemo(() => {
    const weekKey = recommendationWeekKey();
    const byUser = new Map<
      string,
      {
        id: string;
        username: string;
        avatar: string;
        postCount: number;
        liveCount: number;
        latestActivity: number;
        weeklyRank: number;
      }
    >();

    function isRealCandidate(userId: string) {
      return Boolean(userId) && !MOCK_COMMUNITY_USER_IDS.has(userId);
    }

    for (const post of posts) {
      if (!isRealCandidate(post.authorId) || post.authorId === user?.id)
        continue;
      const current = byUser.get(post.authorId);
      const profile = usersById.get(post.authorId);
      byUser.set(post.authorId, {
        id: post.authorId,
        username: current?.username || post.authorName,
        avatar: current?.avatar || profile?.avatar || post.authorAvatar,
        liveCount: current?.liveCount ?? 0,
        postCount: (current?.postCount ?? 0) + 1,
        weeklyRank:
          current?.weeklyRank ??
          weeklyRecommendationHash(`${weekKey}:${post.authorId}`),
        latestActivity: Math.max(
          current?.latestActivity ?? 0,
          new Date(post.createdAt).getTime(),
        ),
      });
    }

    return [...byUser.values()]
      .filter((member) => member.postCount >= 2)
      .sort((a, b) => {
        const scoreA = a.liveCount * 4 + a.postCount;
        const scoreB = b.liveCount * 4 + b.postCount;
        return (
          b.weeklyRank - a.weeklyRank ||
          scoreB - scoreA ||
          b.latestActivity - a.latestActivity
        );
      })
      .slice(0, 6);
  }, [posts, user?.id, usersById]);

  useEffect(() => {
    const authorIds = new Set<string>();
    posts.forEach((post) => {
      if (post.authorId) authorIds.add(post.authorId);
      post.comments.forEach((comment) => {
        if (comment.authorId) authorIds.add(comment.authorId);
      });
    });
    const missingIds = Array.from(authorIds).filter(
      (userId) => !profileAvatars[userId],
    );
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.allSettled(missingIds.map((userId) => apiGetProfile(userId))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          const avatar = result.value.avatarImageUrl?.trim();
          if (!avatar) return;
          next[missingIds[index]] = avatar;
        });
        if (Object.keys(next).length === 0) return;
        setProfileAvatars((current) => ({ ...current, ...next }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [posts, profileAvatars]);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connecte-toi pour publier.", "info");
      return;
    }
    if (!draft.trim()) return;
    const cleanedVideo = videoUrl.trim();
    if (cleanedVideo) {
      const parsed = parseVideoUrl(cleanedVideo);
      if (parsed && parsed.kind === "unknown") {
        notify(
          "URL vidéo non reconnue. Utilisez YouTube, TikTok ou un .mp4/.webm.",
          "error",
        );
        return;
      }
    }
    try {
      const post = await apiCreatePost({
        author: {
          author_id: user.id,
          author_name: user.username,
          author_avatar: user.avatar,
        },
        content: draft.trim(),
        imageUrl: imageUrl.trim() || undefined,
        videoUrl: cleanedVideo || undefined,
      });
      dispatch({ type: "addPost", post });
      setDraft("");
      setImageUrl("");
      setVideoUrl("");
      notify("Publication envoyée ✨");
    } catch (err) {
      console.warn(err);
      notify("La publication n'a pas pu être envoyée. Réessaie.", "error");
    }
  }

  async function react(postId: string, emoji: string) {
    if (!user) {
      notify("Connectez-vous pour réagir.", "info");
      return;
    }
    // Optimiste : on maj le reducer immédiatement, puis on confirme via l'API.
    // Si l'API échoue, on resynchronise avec l'état renvoyé par le backend.
    dispatch({ type: "reactPost", postId, emoji, userId: user.id });
    try {
      const fresh = await apiToggleReaction(postId, user.id, emoji);
      dispatch({ type: "replacePost", post: fresh });
    } catch (err) {
      console.warn(err);
      // Rollback : on retoggle localement pour annuler l'optimiste.
      dispatch({ type: "reactPost", postId, emoji, userId: user.id });
      notify("Réaction perdue en route. Réessayez.", "error");
    }
  }

  async function removePost(postId: string) {
    if (!user) return;
    try {
      await apiDeletePost(postId, user.id);
      dispatch({ type: "deletePost", id: postId });
    } catch (err) {
      console.warn(err);
      notify("Suppression refusée.", "error");
    }
  }

  function profileHref(authorId: string) {
    return `/u/${authorId}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <SectionHeading
        eyebrow="Fil communautaire"
        title={
          <>
            Le <span className="text-mystic">fil</span> de Vaelyndra
          </>
        }
        subtitle="Poste tes créations, pensées et annonces. Tous les membres se croisent ici."
      />

      {/* PR S — barre de recherche des membres par @handle ou pseudo. */}
      <div className="mt-8 mx-auto max-w-2xl">
        <MemberSearch />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr,320px]">
        <div>
          <form onSubmit={publish} className="card-royal p-5">
            <div className="flex gap-3">
              <AvatarImage
                candidates={[user?.avatar]}
                fallbackSeed={user?.id ?? "anon"}
                alt="Vous"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
              />
              <div className="flex-1 space-y-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    user
                      ? "Partage quelque chose avec la communauté…"
                      : "Connecte-toi pour poster…"
                  }
                  rows={3}
                  className="glass-input resize-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Image className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                    <input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="URL d'image (optionnel)"
                      className="glass-input pl-9"
                    />
                  </div>
                  <div className="relative flex-1 min-w-[200px]">
                    <Film className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="URL vidéo YouTube / TikTok / MP4 (optionnel)"
                      className="glass-input pl-9"
                    />
                  </div>
                  <button type="submit" className="btn-gold">
                    <Send className="h-4 w-4" /> Publier
                  </button>
                </div>
              </div>
            </div>
          </form>

          <ul className="mt-6 space-y-4">
            {sorted.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card-royal p-5"
              >
                <header className="flex items-start gap-3">
                  <Link
                    to={profileHref(p.authorId)}
                    className="shrink-0"
                    title={`Voir le profil de ${p.authorName}`}
                    >
                      <AvatarImage
                        candidates={[
                          profileAvatars[p.authorId],
                          usersById.get(p.authorId)?.avatar,
                          p.authorAvatar,
                        ]}
                        fallbackSeed={p.authorId || p.authorName}
                        alt={p.authorName}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40 transition hover:ring-gold-400/70"
                    />
                  </Link>
                  <div className="flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        to={profileHref(p.authorId)}
                        className="font-display text-gold-200 transition hover:text-gold-300"
                      >
                        {p.authorName}
                      </Link>
                      {(() => {
                        const off = getOfficial(p.authorId);
                        return (
                          <UserBadges
                            role={off?.role}
                            creatureId={off?.creatureId}
                          />
                        );
                      })()}
                      <span className="text-xs text-ivory/40">
                        {formatRelative(p.createdAt)}
                      </span>
                    </p>
                    {/* PR S — @handle sous le pseudo de l'auteur. */}
                    <Link
                      to={profileHref(p.authorId)}
                      className="transition hover:opacity-80"
                    >
                      <Handle handle={p.authorHandle} />
                    </Link>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/85">
                      {p.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {user && user.id !== p.authorId && (
                      <ReportButton
                        targetType="post"
                        targetId={p.id}
                        targetLabel={`Post de ${p.authorName}`}
                        targetUrl={`/communaute#post-${p.id}`}
                        compact
                      />
                    )}
                    {(user?.id === p.authorId || isQueen) && (
                      <button
                        onClick={() => removePost(p.id)}
                        className="text-ivory/40 hover:text-rose-300"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </header>
                {p.imageUrl && (
                  <img
                    src={p.imageUrl}
                    alt="Illustration du post"
                    className="mt-4 max-h-[400px] w-full rounded-xl object-cover"
                  />
                )}
                {p.videoUrl && <PostVideo url={p.videoUrl} />}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {QUICK_EMOJIS.map((e) => {
                    const count = p.reactions[e]?.length ?? 0;
                    const active = user
                      ? p.reactions[e]?.includes(user.id)
                      : false;
                    return (
                      <button
                        key={e}
                        onClick={() => react(p.id, e)}
                        className={`rounded-full border px-3 py-1 text-sm transition ${
                          active
                            ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                            : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40"
                        }`}
                      >
                        {e}
                        {count > 0 && (
                          <span className="ml-1 text-xs">{count}</span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setOpenComments((s) => ({ ...s, [p.id]: !s[p.id] }))
                    }
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-1 text-sm text-ivory/70 transition hover:border-gold-400/40 hover:text-gold-200"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Commenter
                    {p.comments.length > 0 && (
                      <span className="text-xs text-gold-300">
                        {p.comments.length}
                      </span>
                    )}
                  </button>
                </div>
                {openComments[p.id] && (
                  <PostComments
                    postId={p.id}
                    comments={p.comments}
                    postAuthorId={p.authorId}
                    avatarOverrides={profileAvatars}
                  />
                )}
              </motion.li>
            ))}
            {sorted.length === 0 && (
              <li className="text-center text-sm text-ivory/50">
                Silence... Le fil attend la première voix.
              </li>
            )}
          </ul>
        </div>

        <aside className="space-y-6">
          {recommendedMembers.length > 0 && (
            <section className="card-royal p-5">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-gold-300" />
                <h3 className="font-display text-lg text-gold-200">
                  Recommandés par Vaelyndra
                </h3>
              </div>
              <p className="mt-1 text-xs text-ivory/55">
                Cette semaine, la plateforme met en avant des vrais membres
                actifs dans le fil.
              </p>
              <ul className="mt-4 space-y-3">
                {recommendedMembers.map((member) => (
                  <li key={member.id}>
                    <Link
                      to={profileHref(member.id)}
                      className="group flex items-center gap-3 rounded-2xl border border-royal-500/25 bg-night-900/45 p-3 transition hover:border-gold-400/50"
                    >
                      <AvatarImage
                        candidates={[profileAvatars[member.id], member.avatar]}
                        fallbackSeed={member.id}
                        alt={member.username}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/35"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm text-gold-200 group-hover:text-gold-100">
                          {member.username}
                        </p>
                        <p className="text-[11px] text-ivory/55">
                          {member.liveCount > 0
                            ? "A lancé un live récemment"
                            : `${member.postCount} publications récentes`}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="card-royal p-5">
            <h3 className="font-display text-lg text-gold-200">
              Règles du réseau
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-ivory/75">
              <li>✦ Respect pour chaque membre.</li>
              <li>✦ Pas de haine, pas de spam.</li>
              <li>✦ Crée, inspire, fais briller Vaelyndra.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PostVideo({ url }: { url: string }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  if (parsed.kind === "youtube" || parsed.kind === "tiktok") {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border border-royal-500/30 bg-night-800">
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <iframe
            src={parsed.embedUrl}
            title={`Vidéo ${parsed.kind}`}
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
        className="mt-4 max-h-[500px] w-full rounded-xl border border-royal-500/30 bg-night-800"
      >
        <source src={parsed.src} />
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
    );
  }

  return (
    <a
      href={parsed.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-1.5 text-xs text-gold-200 underline hover:text-gold-100"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Ouvrir la vidéo
    </a>
  );
}
