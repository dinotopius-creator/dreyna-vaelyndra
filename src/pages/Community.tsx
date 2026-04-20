import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Film,
  Image,
  MessageCircle,
  Radio,
  Send,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { PostComments } from "../components/PostComments";
import { UserBadges } from "../components/UserBadges";
import { StreamerLeaderboard } from "../components/StreamerLeaderboard";
import { BFFModule } from "../components/BFFModule";
import { DREYNA_PROFILE } from "../data/mock";
import { getOfficial } from "../data/officials";
import { formatRelative, parseVideoUrl } from "../lib/helpers";
import {
  apiCreatePost,
  apiDeletePost,
  apiToggleReaction,
} from "../lib/api";

const QUICK_EMOJIS = ["✨", "👑", "🌿", "⚔️", "🌙", "🔮"];

export function Community() {
  const { posts, dispatch } = useStore();
  const { user, isQueen } = useAuth();
  const { liveRegistry } = useLive();
  const { notify } = useToast();
  const activeLives = useMemo(
    () =>
      Object.values(liveRegistry).sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [liveRegistry],
  );
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [openComments, setOpenComments] = useState<Record<string, boolean>>(
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

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connectez-vous pour publier dans la cour.", "info");
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
      notify("Votre parole brille dans la cour 🌟");
    } catch (err) {
      console.warn(err);
      notify("Le parchemin n'a pas pu être envoyé. Réessayez.", "error");
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
      notify("Suppression refusée par le royaume.", "error");
    }
  }

  function profileHref(authorId: string) {
    return authorId === DREYNA_PROFILE.id ? "/dreyna" : `/u/${authorId}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <SectionHeading
        eyebrow="La Cour"
        title={<>Le <span className="text-mystic">fil</span> de Vaelyndra</>}
        subtitle="Partagez vos serments, créations et pensées. La reine passe ici chaque jour."
      />

      {activeLives.length > 0 && (
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
                  <div className="flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-display text-gold-200">
                        {l.username}
                      </span>
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
          <form
            onSubmit={publish}
            className="card-royal p-5"
          >
            <div className="flex gap-3">
              <img
                src={
                  user?.avatar ??
                  "https://i.pravatar.cc/150?u=anon"
                }
                alt="Vous"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
              />
              <div className="flex-1 space-y-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    user
                      ? "Dites quelque chose à la cour..."
                      : "Connectez-vous pour poster..."
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
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/85">
                      {p.content}
                    </p>
                  </div>
                  {(user?.id === p.authorId || isQueen) && (
                    <button
                      onClick={() => removePost(p.id)}
                      className="text-ivory/40 hover:text-rose-300"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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
          <StreamerLeaderboard />
          <BFFModule />

          <div className="card-royal p-5">
            <h3 className="font-display text-lg text-gold-200">
              Règles de la cour
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-ivory/75">
              <li>✦ Respect pour chaque elfe du royaume.</li>
              <li>✦ Aucun sort de haine, ni de spam obscur.</li>
              <li>✦ Créez, inspirez, illuminez Vaelyndra.</li>
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
