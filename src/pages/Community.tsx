import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Film,
  Flame,
  Gift,
  Image,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  Trophy,
  Wand2,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { PostComments } from "../components/PostComments";
import { ReportButton } from "../components/ReportButton";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { MemberSearch } from "../components/MemberSearch";
import { AvatarImage } from "../components/AvatarImage";
import { RichMentionText, buildMentionLookup } from "../components/RichMentionText";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { getOfficial } from "../data/officials";
import {
  formatRelative,
  parsePostImageUrl,
  parseVideoUrl,
} from "../lib/helpers";
import {
  apiCreatePost,
  apiDeletePost,
  apiGetCommunityActivityLeaderboard,
  apiSyncCommunityActivityRewards,
  apiToggleReaction,
  apiGetProfile,
  apiSearchUsers,
  apiUploadCommunityImage,
  type UserProfileDto,
  type UserSearchHitDto,
  type StreamerGradeDto,
} from "../lib/api";
import { isImageFile, validateFile } from "../lib/fileUtils";


const QUICK_EMOJIS = ["✨", "👑", "🌿", "⚔️", "🌙", "🔮"];
const COMMUNITY_REWARD_BY_RANK: Record<number, number> = {
  1: 600,
  2: 450,
  3: 300,
};

export function Community() {
  const { posts, dispatch } = useStore();
  const { user, users, isQueen } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const location = useLocation();
  const usersById = useMemo(
    () => new Map(users.map((member) => [member.id, member])),
    [users],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<UserSearchHitDto[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [profilesById, setProfilesById] = useState<Record<string, UserProfileDto>>(
    {},
  );
  const [activityLeaderboard, setActivityLeaderboard] = useState<
    Array<{
      id: string;
      username: string;
      handle: string | null;
      avatarImageUrl: string;
      grade?: StreamerGradeDto | null;
      postCount: number;
      commentCount: number;
      reactionCount: number;
      score: number;
    }>
  >([]);

  const displayLeaderboard = useMemo(
    () =>
      activityLeaderboard.map((member) => {
        const knownUser = usersById.get(member.id);
        const profile = profilesById[member.id];
        return {
          ...member,
          username: profile?.username || knownUser?.username || member.username,
          handle: profile?.handle ?? knownUser?.handle ?? member.handle,
          avatarImageUrl:
            profile?.avatarImageUrl ||
            knownUser?.avatar ||
            member.avatarImageUrl,
          grade: profile?.grade ?? member.grade ?? null,
        };
      }),
    [activityLeaderboard, profilesById, usersById],
  );

  const mentionTargets = useMemo(() => {
    return buildMentionLookup([
      ...users.map((member) => ({
        userId: member.id,
        handle: member.handle ?? null,
        username: member.username,
      })),
      ...Object.entries(profilesById).map(([userId, profile]) => ({
        userId,
        handle: profile.handle ?? null,
        username: profile.username ?? null,
      })),
      ...displayLeaderboard.map((member) => ({
        userId: member.id,
        handle: member.handle ?? null,
        username: member.username,
      })),
      ...posts.map((post) => ({
        userId: post.authorId,
        handle: post.authorHandle ?? null,
        username: post.authorName,
      })),
    ]);
  }, [displayLeaderboard, posts, profilesById, users]);

  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );

  useEffect(() => {
    if (!imagePreviewUrl) return;
    return () => {
      URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    const q = tagQuery.trim();
    if (q.length < 1) {
      setTagResults([]);
      setTagLoading(false);
      return;
    }
    let cancelled = false;
    setTagLoading(true);
    const handle = window.setTimeout(() => {
      apiSearchUsers(q, 6)
        .then((hits) => {
          if (cancelled) return;
          setTagResults(hits.filter((hit) => hit.id !== user?.id));
        })
        .catch(() => {
          if (cancelled) return;
          setTagResults([]);
        })
        .finally(() => {
          if (!cancelled) setTagLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [tagQuery, user?.id]);

  useEffect(() => {
    const authorIds = new Set<string>();
    posts.forEach((post) => {
      if (post.authorId) authorIds.add(post.authorId);
      post.comments.forEach((comment) => {
        if (comment.authorId) authorIds.add(comment.authorId);
        if (comment.replyToAuthorId) authorIds.add(comment.replyToAuthorId);
      });
    });
    activityLeaderboard.forEach((member) => {
      if (member.id) authorIds.add(member.id);
    });
    const missingIds = Array.from(authorIds).filter(
      (userId) => !profilesById[userId],
    );
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.allSettled(missingIds.map((userId) => apiGetProfile(userId))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, UserProfileDto> = {};
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          next[missingIds[index]] = result.value;
        });
        if (Object.keys(next).length === 0) return;
        setProfilesById((current) => ({ ...current, ...next }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [activityLeaderboard, posts, profilesById]);

  useEffect(() => {
    let cancelled = false;
    void apiGetCommunityActivityLeaderboard(5)
      .then((result) => {
        if (cancelled) return;
        setActivityLeaderboard(result.entries);
      })
      .catch(() => {
        if (cancelled) return;
        setActivityLeaderboard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [posts]);

  useEffect(() => {
    let cancelled = false;
    void apiSyncCommunityActivityRewards()
      .then(async (result) => {
        if (cancelled || !user) return;
        const myReward = result.newlyAwarded.find(
          (entry) => entry.userId === user.id,
        );
        if (!myReward) return;
        await refreshProfile();
        notify(
          `Classement communautaire : +${myReward.rewardLueurs} lueurs creditees.`,
        );
      })
      .catch(() => {
        /* best effort */
      });
    return () => {
      cancelled = true;
    };
  }, [notify, refreshProfile, user]);

  useEffect(() => {
    const hash = location.hash.replace(/^#/, "").trim();
    if (!hash.startsWith("comment-")) return;
    const commentId = hash.slice("comment-".length);
    if (!commentId) return;
    const parentPost = posts.find((post) =>
      post.comments.some((comment) => comment.id === commentId),
    );
    if (!parentPost) return;

    setOpenComments((current) => ({
      ...current,
      [parentPost.id]: true,
    }));

    const scrollToComment = () => {
      const element = document.getElementById(`comment-${commentId}`);
      if (!element) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    };

    if (scrollToComment()) return;

    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        scrollToComment();
      }, 80);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, posts]);

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
          "URL video non reconnue. Utilise YouTube, TikTok ou un .mp4/.webm.",
          "error",
        );
        return;
      }
    }
    try {
      let uploadedImageUrl: string | undefined;
      if (imageFile) {
        const uploaded = await apiUploadCommunityImage(imageFile);
        uploadedImageUrl = uploaded.imageUrl;
      }
      const post = await apiCreatePost({
        author: {
          author_id: user.id,
          author_name: user.username,
          author_avatar: user.avatar,
        },
        content: draft.trim(),
        imageUrl: uploadedImageUrl,
        videoUrl: cleanedVideo || undefined,
      });
      dispatch({ type: "addPost", post });
      setDraft("");
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(null);
      setImagePreviewUrl(null);
      setVideoUrl("");
      setTagQuery("");
      setTagResults([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      notify("Publication envoyée ✨");
      // Rafraîchit le profil pour afficher l'XP gagné par le familier
      // (le backend a grant +20 XP au familier actif côté API).
      void refreshProfile();
    } catch (err) {
      console.warn(err);
      notify("La publication n'a pas pu être envoyée. Réessaie.", "error");
    }
  }

  async function react(postId: string, emoji: string) {
    if (!user) {
      notify("Connecte-toi pour réagir.", "info");
      return;
    }
    dispatch({ type: "reactPost", postId, emoji, userId: user.id });
    try {
      const fresh = await apiToggleReaction(postId, user.id, emoji);
      dispatch({ type: "replacePost", post: fresh });
      // Rafraîchit le profil pour refléter +2 XP au familier à chaque
      // réaction ajoutée (le backend cape à 30 XP/jour).
      void refreshProfile();
    } catch (err) {
      console.warn(err);
      dispatch({ type: "reactPost", postId, emoji, userId: user.id });
      notify("Réaction perdue en route. Réessaie.", "error");
    }
  }

  async function removePost(postId: string) {
    if (!user) return;
    try {
      await apiDeletePost(postId, user.id);
      dispatch({ type: "deletePost", id: postId });
    } catch (err) {
      console.warn(err);
      notify("Suppression refusee.", "error");
    }
  }

  function profileHref(authorId: string) {
    return `/u/${authorId}`;
  }

  function resolvedProfile(authorId: string) {
    return profilesById[authorId] ?? null;
  }

  function clearSelectedImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function appendMention(hit: UserSearchHitDto) {
    const mention = `@${hit.handle || hit.username.replace(/\s+/g, "")}`;
    setDraft((current) => {
      const trimmed = current.trimEnd();
      const alreadyPresent = trimmed
        .split(/\s+/)
        .some((token) => token.toLowerCase() === mention.toLowerCase());
      if (alreadyPresent) return current;
      return trimmed ? `${trimmed} ${mention} ` : `${mention} `;
    });
    setTagQuery("");
    setTagResults([]);
  }

  function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateFile(file);
      if (!isImageFile(file.type)) {
        throw new Error("Choisis une image JPG, PNG, GIF ou WEBP.");
      }
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image impossible a utiliser.";
      notify(message, "error");
      event.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
      <SectionHeading
        eyebrow="Fil communautaire"
        title={
          <>
            Le <span className="text-mystic">fil</span> de Vaelyndra
          </>
        }
        subtitle="Poste tes creations, pensees et annonces. Tous les membres se croisent ici."
      />

      <div className="mx-auto mt-8 max-w-2xl">
        <MemberSearch />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr),320px]">
        <div>
          <form onSubmit={publish} className="card-royal p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
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
                      ? "Partage quelque chose avec la communaute..."
                      : "Connecte-toi pour poster..."
                  }
                  rows={3}
                  className="glass-input resize-none"
                />
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),220px]">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={onPickImage}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-royal-500/30 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200"
                      >
                        <Image className="h-4 w-4" />
                        Importer une image
                      </button>
                      <div className="relative min-w-0 flex-1">
                        <Film className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                        <input
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          placeholder="URL video YouTube / TikTok / MP4 (optionnel)"
                          className="glass-input pl-9"
                        />
                      </div>
                      <button type="submit" className="btn-gold w-full justify-center sm:w-auto">
                        <Send className="h-4 w-4" /> Publier
                      </button>
                    </div>
                    <p className="text-xs text-ivory/45">
                      Import direct depuis ton telephone ou ton PC. Le champ URL d'image a ete retire.
                    </p>
                    {imagePreviewUrl && (
                      <div className="rounded-2xl border border-royal-500/30 bg-night-900/55 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="truncate text-xs text-ivory/65">
                            {imageFile?.name}
                          </p>
                          <button
                            type="button"
                            onClick={clearSelectedImage}
                            className="rounded-full p-1 text-ivory/45 transition hover:text-rose-300"
                            aria-label="Retirer l'image"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <img
                          src={imagePreviewUrl}
                          alt="Apercu du post"
                          className="max-h-56 w-full rounded-xl object-cover"
                        />
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-royal-500/20 bg-night-900/40 p-3">
                    <label className="block text-[11px] uppercase tracking-[0.22em] text-gold-200">
                      Taguer un membre
                    </label>
                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/35" />
                      <input
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value)}
                        placeholder="@handle ou pseudo"
                        className="glass-input pl-9"
                        autoComplete="off"
                      />
                    </div>
                    <div className="mt-2 space-y-2">
                      {tagLoading && (
                        <p className="text-xs text-ivory/45">Recherche...</p>
                      )}
                      {!tagLoading && tagQuery.trim().length > 0 && tagResults.length === 0 && (
                        <p className="text-xs text-ivory/45">Aucun membre trouve.</p>
                      )}
                      {tagResults.slice(0, 4).map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => appendMention(hit)}
                          className="flex w-full items-center gap-3 rounded-2xl border border-royal-500/20 bg-night-950/45 px-3 py-2 text-left transition hover:border-gold-400/45"
                        >
                          <AvatarImage
                            candidates={[hit.avatarImageUrl]}
                            fallbackSeed={hit.id}
                            alt={hit.username}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gold-200">{hit.username}</p>
                            <Handle handle={hit.handle} size="xs" />
                          </div>
                        </button>
                      ))}
                      <p className="text-xs text-ivory/45">
                        Clique sur un membre pour ajouter son @handle dans le post.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>

          <ul className="mt-6 space-y-4">
            {sorted.map((post, index) => {
              const profile = resolvedProfile(post.authorId);
              const displayName = profile?.username || post.authorName;
              const displayHandle = profile?.handle ?? post.authorHandle ?? null;
              const displayAvatar =
                profile?.avatarImageUrl ||
                usersById.get(post.authorId)?.avatar ||
                post.authorAvatar;
              return (
                <motion.li
                  key={post.id}
                  id={`post-${post.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="card-royal p-5"
                >
                <header className="flex flex-wrap items-start gap-3">
                  <Link
                    to={profileHref(post.authorId)}
                    className="shrink-0"
                    title={`Voir le profil de ${displayName}`}
                  >
                    <AvatarImage
                      candidates={[
                        displayAvatar,
                        post.authorAvatar,
                      ]}
                      fallbackSeed={post.authorId || post.authorName}
                      alt={displayName}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40 transition hover:ring-gold-400/70"
                    />
                  </Link>
                  <div className="flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        to={profileHref(post.authorId)}
                        className="font-display text-gold-200 transition hover:text-gold-300"
                      >
                        {displayName}
                      </Link>
                      {(profile?.grade ?? post.authorGrade) && (
                        <StreamerGradeBadge
                          grade={(profile?.grade ?? post.authorGrade)!}
                          size="sm"
                        />
                      )}
                      {(() => {
                        const official = getOfficial(post.authorId);
                        return (
                          <UserBadges
                            role={profile?.role ?? official?.role}
                            creatureId={
                              profile?.creature?.id ??
                              usersById.get(post.authorId)?.creatureId ??
                              official?.creatureId
                            }
                          />
                        );
                      })()}
                      <span className="text-xs text-ivory/40">
                        {formatRelative(post.createdAt)}
                      </span>
                    </p>
                    <Link
                      to={profileHref(post.authorId)}
                      className="transition hover:opacity-80"
                    >
                      <Handle handle={displayHandle} />
                    </Link>
                    <RichMentionText
                      content={post.content}
                      mentionsByHandle={mentionTargets}
                      profileHref={profileHref}
                      className="mt-1 whitespace-pre-wrap break-words text-sm text-ivory/85"
                    />
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    {user && user.id !== post.authorId && (
                      <ReportButton
                        targetType="post"
                        targetId={post.id}
                        targetLabel={`Post de ${post.authorName}`}
                        targetUrl={`/communaute#post-${post.id}`}
                        compact
                      />
                    )}
                    {(user?.id === post.authorId || isQueen) && (
                      <button
                        onClick={() => removePost(post.id)}
                        className="text-ivory/40 hover:text-rose-300"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </header>
                <PostImageAttachment
                  postId={post.id}
                  imageUrl={post.imageUrl}
                  failed={Boolean(brokenImages[post.id])}
                  onError={() =>
                    setBrokenImages((current) => ({
                      ...current,
                      [post.id]: true,
                    }))
                  }
                />
                {post.videoUrl && <PostVideo url={post.videoUrl} />}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {QUICK_EMOJIS.map((emoji) => {
                    const count = post.reactions[emoji]?.length ?? 0;
                    const active = user
                      ? post.reactions[emoji]?.includes(user.id)
                      : false;
                    return (
                      <button
                        key={emoji}
                        onClick={() => react(post.id, emoji)}
                        className={`rounded-full border px-3 py-1 text-sm transition ${
                          active
                            ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                            : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40"
                        }`}
                      >
                        {emoji}
                        {count > 0 && <span className="ml-1 text-xs">{count}</span>}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setOpenComments((current) => ({
                        ...current,
                        [post.id]: !current[post.id],
                      }))
                    }
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-1 text-sm text-ivory/70 transition hover:border-gold-400/40 hover:text-gold-200 sm:ml-auto"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Commenter
                    {post.comments.length > 0 && (
                      <span className="text-xs text-gold-300">
                        {post.comments.length}
                      </span>
                    )}
                  </button>
                </div>
                {openComments[post.id] && (
                  <PostComments
                    postId={post.id}
                    comments={post.comments}
                    postAuthorId={post.authorId}
                    profileOverrides={profilesById}
                  />
                )}
                </motion.li>
              );
            })}
            {sorted.length === 0 && (
              <li className="text-center text-sm text-ivory/50">
                Silence... Le fil attend la premiere voix.
              </li>
            )}
          </ul>
        </div>

        <aside className="space-y-6">
          <section className="card-royal overflow-hidden p-5">
            <div className="relative rounded-[26px] border border-gold-400/20 bg-night-950/85 p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,170,70,0.22),_transparent_44%),radial-gradient(circle_at_bottom_left,_rgba(74,52,122,0.28),_transparent_42%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/20 bg-gold-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-gold-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Rituel du jour
                </div>
                <h3 className="mt-4 font-display text-2xl text-gold-100">
                  Oracle des Runes
                </h3>
                <p className="mt-2 text-sm text-ivory/72">
                  Un mini-jeu mystique avec 3 tentatives par jour, des Lueurs
                  frequentes et 1 Sylvin presque introuvable.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-gold-300/90">
                  <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1">
                    Lueurs frequentes
                  </span>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1">
                    1 Sylvin tres rare
                  </span>
                </div>
                <Link
                  to="/oracle"
                  className="btn-gold mt-5 inline-flex items-center"
                >
                  <Wand2 className="h-4 w-4" /> Jouer maintenant
                </Link>
              </div>
            </div>
          </section>

          <section className="card-royal p-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold-300" />
              <h3 className="font-display text-lg text-gold-200">
                Top 5 les plus actifs
              </h3>
            </div>
            <p className="mt-1 text-xs text-ivory/55">
              Classement live du fil de la semaine. Il bouge en temps reel
              selon les posts, commentaires et reactions.
            </p>
            <div className="mt-4 rounded-2xl border border-gold-400/20 bg-gold-500/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-gold-100">
                <Gift className="h-4 w-4 text-gold-300" />
                Recompenses de fin de semaine
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-center text-xs min-[360px]:grid-cols-3">
                {[1, 2, 3].map((rank) => (
                  <div
                    key={rank}
                    className="rounded-xl border border-gold-400/20 bg-night-900/45 px-2 py-2 text-ivory/80"
                  >
                    <p className="font-display text-gold-200">Top {rank}</p>
                    <p>{COMMUNITY_REWARD_BY_RANK[rank]} lueurs</p>
                  </div>
                ))}
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {displayLeaderboard.map((member, index) => (
                <li key={member.id}>
                  <Link
                    to={profileHref(member.id)}
                    className="group flex items-center gap-3 rounded-2xl border border-royal-500/25 bg-night-900/45 p-3 transition hover:border-gold-400/50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/25 bg-gold-500/10 text-sm font-semibold text-gold-200">
                      {index + 1}
                    </div>
                    <AvatarImage
                      candidates={[member.avatarImageUrl]}
                      fallbackSeed={member.id}
                      alt={member.username}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/35"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-sm text-gold-200 group-hover:text-gold-100">
                          {member.username}
                        </p>
                        {member.grade && (
                          <StreamerGradeBadge grade={member.grade} size="sm" />
                        )}
                        <UserBadges
                          role={profilesById[member.id]?.role ?? getOfficial(member.id)?.role}
                          creatureId={
                            profilesById[member.id]?.creature?.id ??
                            usersById.get(member.id)?.creatureId ??
                            getOfficial(member.id)?.creatureId
                          }
                        />
                      </div>
                      <Handle handle={member.handle} size="xs" />
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-ivory/55">
                        <span>
                          {member.postCount} post
                          {member.postCount > 1 ? "s" : ""}
                        </span>
                        <span>{member.commentCount} comm.</span>
                        <span>{member.reactionCount} likes</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="flex items-center justify-end gap-1 text-sm font-medium text-gold-200">
                        <Flame className="h-3.5 w-3.5" />
                        {member.score}
                      </p>
                      {index < 3 && (
                        <p className="text-[11px] text-gold-300/90">
                          +{COMMUNITY_REWARD_BY_RANK[index + 1]} L
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
              {displayLeaderboard.length === 0 && (
                <li className="rounded-2xl border border-dashed border-royal-500/25 px-4 py-5 text-center text-sm text-ivory/55">
                  Aucun membre n'a encore poste cette semaine.
                </li>
              )}
            </ul>
          </section>

          <div className="card-royal p-5">
            <h3 className="font-display text-lg text-gold-200">
              Regles du reseau
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-ivory/75">
              <li>Respect pour chaque membre.</li>
              <li>Pas de haine, pas de spam.</li>
              <li>Cree, inspire, fais briller Vaelyndra.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PostImageAttachment({
  postId,
  imageUrl,
  failed,
  onError,
}: {
  postId: string;
  imageUrl?: string;
  failed: boolean;
  onError: () => void;
}) {
  if (!imageUrl) return null;

  const parsed = parsePostImageUrl(imageUrl);
  if (!parsed || parsed.kind === "invalid") {
    return null;
  }

  const src = parsed.kind === "image" ? parsed.src : parsed.url;

  if (!failed) {
    return (
      <img
        key={postId}
        src={src}
        alt="Illustration du post"
        className="mt-4 max-h-[400px] w-full rounded-xl object-cover"
        onError={onError}
      />
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-royal-500/30 bg-night-900/60 p-4 text-sm text-ivory/75">
      <p className="font-medium text-ivory/90">
        Cette publication contient un lien externe, pas une image affichable.
      </p>
      <a
        href={imageUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-2 text-gold-200 transition hover:text-gold-100"
      >
        <ExternalLink className="h-4 w-4" />
        Ouvrir le lien joint
      </a>
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
            title={`Video ${parsed.kind}`}
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
        Votre navigateur ne supporte pas la lecture video.
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
      Ouvrir la video
    </a>
  );
}
