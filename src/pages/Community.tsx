import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Film,
  Image,
  MessageCircle,
  Radio,
  Send,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { PostComments } from "../components/PostComments";
import { ReportButton } from "../components/ReportButton";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { MemberSearch } from "../components/MemberSearch";
import { StreamerLeaderboard } from "../components/StreamerLeaderboard";
import { BFFModule } from "../components/BFFModule";
import {
  LIVE_CATEGORIES,
  getLiveCategory,
  type LiveCategoryId,
} from "../data/liveCategories";
import { getOfficial } from "../data/officials";
import { formatRelative, parseVideoUrl } from "../lib/helpers";
import { apiCreatePost, apiDeletePost, apiToggleReaction } from "../lib/api";

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
  const { user, isQueen } = useAuth();
  const { liveRegistry } = useLive();
  const { notify } = useToast();
  const allLives = useMemo(
    () =>
      Object.values(liveRegistry).sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [liveRegistry],
  );
  // Filtre optionnel par catégorie. `null` = aucun filtre (tous les lives).
  // La liste des catégories proposées se limite à celles effectivement
  // représentées dans le registre, pour éviter d'afficher un filtre qui
  // donnerait zéro résultat.
  const [categoryFilter, setCategoryFilter] = useState<LiveCategoryId | null>(
    null,
  );
  const availableCategories = useMemo(() => {
    const seen = new Set<LiveCategoryId>();
    for (const l of allLives) seen.add(getLiveCategory(l.category).id);
    return LIVE_CATEGORIES.filter((c) => seen.has(c.id));
  }, [allLives]);
  // Auto-reset si la catégorie sélectionnée a disparu (dernier streamer
  // de cette catégorie a quitté son live). Sans ça, l'utilisateur
  // resterait bloqué sur un filtre qui renvoie 0 résultat.
  useEffect(() => {
    if (!categoryFilter) return;
    if (!availableCategories.some((c) => c.id === categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [availableCategories, categoryFilter]);
  const activeLives = useMemo(() => {
    if (!categoryFilter) return allLives;
    return allLives.filter(
      (l) => getLiveCategory(l.category).id === categoryFilter,
    );
  }, [allLives, categoryFilter]);
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

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

    for (const live of allLives) {
      if (!isRealCandidate(live.userId) || live.userId === user?.id) continue;
      const current = byUser.get(live.userId);
      byUser.set(live.userId, {
        id: live.userId,
        username: live.username,
        avatar: live.avatar,
        postCount: current?.postCount ?? 0,
        liveCount: (current?.liveCount ?? 0) + 1,
        weeklyRank:
          current?.weeklyRank ??
          weeklyRecommendationHash(`${weekKey}:${live.userId}`),
        latestActivity: Math.max(
          current?.latestActivity ?? 0,
          new Date(live.startedAt).getTime(),
        ),
      });
    }

    for (const post of posts) {
      if (!isRealCandidate(post.authorId) || post.authorId === user?.id)
        continue;
      const current = byUser.get(post.authorId);
      byUser.set(post.authorId, {
        id: post.authorId,
        username: current?.username || post.authorName,
        avatar: current?.avatar || post.authorAvatar,
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
      .filter((member) => member.liveCount >= 1 || member.postCount >= 2)
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
  }, [allLives, posts, user?.id]);

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

      {allLives.length > 0 && (
        <section className="mt-10 card-royal p-5">
          <header className="mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4 animate-pulse text-rose-300" />
            <h3 className="font-display text-lg text-gold-200">
              Lives en cours
            </h3>
            <span className="ml-auto text-[11px] uppercase tracking-[0.22em] text-ivory/50">
              {activeLives.length} membre
              {activeLives.length > 1 ? "s" : ""} en direct
            </span>
          </header>
          {availableCategories.length >= 2 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] transition ${
                  categoryFilter === null
                    ? "border-gold-400/60 bg-gold-400/15 text-gold-100"
                    : "border-royal-500/30 text-ivory/60 hover:text-ivory"
                }`}
              >
                Toutes
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter(c.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] transition ${
                    categoryFilter === c.id
                      ? "border-gold-400/60 bg-gold-400/15 text-gold-100"
                      : "border-royal-500/30 text-ivory/60 hover:text-ivory"
                  }`}
                >
                  <span aria-hidden>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <ul className="grid gap-3 md:grid-cols-2">
            {activeLives.map((l) => (
              <li key={l.userId}>
                <Link
                  to={`/live/${l.userId}`}
                  className="group flex items-start gap-3 rounded-xl border border-royal-500/30 bg-night-900/40 p-4 transition hover:border-gold-400/50"
                >
                  <div className="relative">
                    <img
                      src={l.avatar}
                      alt={l.username}
                      className="h-12 w-12 rounded-full object-cover ring-2 ring-rose-400/60"
                    />
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-night-900 bg-rose-500 px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-[0.14em] text-ivory">
                      Live
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-display text-gold-200">
                        {l.username}
                      </span>
                      {(() => {
                        const cat = getLiveCategory(l.category);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] ${cat.chipClass}`}
                          >
                            <span aria-hidden>{cat.icon}</span>
                            {cat.label}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-ivory/50">
                        {formatRelative(l.startedAt)}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-1 font-display text-sm text-ivory/90">
                      {l.title || `${l.username} est en direct`}
                    </p>
                    {l.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-ivory/60">
                        {l.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gold-300/80 group-hover:text-gold-200">
                      Rejoindre le live →
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr,320px]">
        <div>
          <form onSubmit={publish} className="card-royal p-5">
            <div className="flex gap-3">
              <img
                src={user?.avatar ?? "https://i.pravatar.cc/150?u=anon"}
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
                    <img
                      src={p.authorAvatar}
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
                actifs en live ou dans le fil.
              </p>
              <ul className="mt-4 space-y-3">
                {recommendedMembers.map((member) => (
                  <li key={member.id}>
                    <Link
                      to={profileHref(member.id)}
                      className="group flex items-center gap-3 rounded-2xl border border-royal-500/25 bg-night-900/45 p-3 transition hover:border-gold-400/50"
                    >
                      <img
                        src={
                          member.avatar ||
                          `https://i.pravatar.cc/150?u=${member.id}`
                        }
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
          <StreamerLeaderboard />
          <BFFModule />

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
