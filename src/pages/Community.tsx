import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import {
  apiCreatePost,
  apiGetCommunityActivityLeaderboard,
  apiGetProfile,
  apiSearchUsers,
  apiSyncCommunityActivityRewards,
  apiToggleReaction,
  apiUploadCommunityImage,
  type StreamerGradeDto,
  type UserProfileDto,
  type UserSearchHitDto,
} from "../lib/api";
import { isImageFile, validateFile } from "../lib/fileUtils";
import { parseVideoUrl } from "../lib/helpers";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { CommunityImmersiveFeed, type CommunityTab } from "../components/CommunityImmersiveFeed";
import { buildMentionLookup } from "../components/RichMentionText";
import { AvatarImage } from "../components/AvatarImage";
import { PostComments } from "../components/PostComments";
import type { CommunityPost } from "../types";

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

const SAVED_KEY = "vaelyndra:saved-community-posts";

export function Community() {
  const { posts, dispatch } = useStore();
  const { user, users } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const location = useLocation();

  const usersById = useMemo(
    () =>
      new Map(
        users.map((member) => [
          member.id,
          {
            id: member.id,
            username: member.username,
            avatar: member.avatar ?? undefined,
            handle: member.handle ?? null,
            creatureId: member.creatureId ?? undefined,
          },
        ]),
      ),
    [users],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<UserSearchHitDto[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [profilesById, setProfilesById] = useState<Record<string, ProfileSummary>>({});
  const [leaderboard, setLeaderboard] = useState<Array<{
    id: string;
    username: string;
    handle: string | null;
    avatarImageUrl: string;
    grade?: StreamerGradeDto | null;
    postCount: number;
    commentCount: number;
    reactionCount: number;
    score: number;
  }>>([]);
  const [weekStartIso, setWeekStartIso] = useState("");
  const [activeTab, setActiveTab] = useState<CommunityTab>("for-you");
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentTargetId, setCommentTargetId] = useState<string | null>(null);

  const visiblePosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );

  const selectedPost = useMemo(
    () => visiblePosts.find((post) => post.id === commentTargetId) ?? null,
    [commentTargetId, visiblePosts],
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
      ...leaderboard.map((member) => ({
        userId: member.id,
        handle: member.handle ?? null,
        username: member.username,
      })),
      ...visiblePosts.map((post) => ({
        userId: post.authorId,
        handle: post.authorHandle ?? null,
        username: post.authorName,
      })),
    ]);
  }, [leaderboard, profilesById, users, visiblePosts]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as string[];
      setSavedPostIds(new Set(parsed));
    } catch {
      window.localStorage.removeItem(SAVED_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(savedPostIds)));
  }, [savedPostIds]);

  useEffect(() => {
    if (!imagePreviewUrl) return;
    return () => URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  useEffect(() => {
    const q = tagQuery.trim();
    if (!q) {
      setTagResults([]);
      setTagLoading(false);
      return;
    }
    let cancelled = false;
    setTagLoading(true);
    const timer = window.setTimeout(() => {
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
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tagQuery, user?.id]);

  useEffect(() => {
    const authorIds = new Set<string>();
    visiblePosts.forEach((post) => {
      if (post.authorId) authorIds.add(post.authorId);
      post.comments.forEach((comment) => {
        if (comment.authorId) authorIds.add(comment.authorId);
        if (comment.replyToAuthorId) authorIds.add(comment.replyToAuthorId);
      });
    });
    leaderboard.forEach((member) => authorIds.add(member.id));

    const missingIds = Array.from(authorIds).filter((id) => !profilesById[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.allSettled(missingIds.map((id) => apiGetProfile(id))).then((results) => {
      if (cancelled) return;
      const next: Record<string, ProfileSummary> = {};
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const profile = result.value;
        next[missingIds[index]] = {
          username: profile.username,
          handle: profile.handle,
          avatarImageUrl: profile.avatarImageUrl,
          grade: profile.grade ?? null,
          role: profile.role,
          creature: profile.creature,
          isFollowing: (profile as any).isFollowing,
          following: (profile as any).following,
        };
      });
      if (Object.keys(next).length > 0) {
        setProfilesById((current) => ({ ...current, ...next }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [leaderboard, profilesById, visiblePosts]);

  useEffect(() => {
    let cancelled = false;
    const loadLeaderboard = () => {
      void apiGetCommunityActivityLeaderboard(5)
        .then((result) => {
          if (cancelled) return;
          setWeekStartIso(result.weekStartIso);
          setLeaderboard(result.entries);
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn("Classement communautaire indisponible", error);
        });
    };
    loadLeaderboard();
    const interval = window.setInterval(loadLeaderboard, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiSyncCommunityActivityRewards()
      .then(async (result) => {
        if (cancelled || !user) return;
        const myReward = result.newlyAwarded.find((entry) => entry.userId === user.id);
        if (!myReward) return;
        await refreshProfile();
        notify(`Classement communautaire : +${myReward.rewardLueurs} Lueurs créditées.`);
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
    const parentPost = visiblePosts.find((post) =>
      post.comments.some((comment) => comment.id === commentId),
    );
    if (!parentPost) return;
    setCommentTargetId(parentPost.id);
  }, [location.hash, visiblePosts]);

  useEffect(() => {
    if (!commentTargetId) return;
    const attempt = () => {
      const element = document.getElementById(`post-${commentTargetId}`);
      if (!element) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    };
    if (attempt()) return;
    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => attempt(), 80);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commentTargetId]);

  async function publish(e: FormEvent<HTMLFormElement>) {
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
        notify("URL vidéo non reconnue. Utilise YouTube, TikTok ou un .mp4/.webm.", "error");
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
      setComposerOpen(false);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(null);
      setImagePreviewUrl(null);
      setVideoUrl("");
      setTagQuery("");
      setTagResults([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      notify("Publication envoyée ✨");
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
      void refreshProfile();
    } catch (err) {
      console.warn(err);
      dispatch({ type: "reactPost", postId, emoji, userId: user.id });
      notify("Réaction perdue en route. Réessaie.", "error");
    }
  }

  function savePost(postId: string) {
    const wasSaved = savedPostIds.has(postId);
    setSavedPostIds((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
    notify(wasSaved ? "Post retiré des sauvegardes." : "Post enregistré.");
  }

  function sharePost(post: CommunityPost) {
    const url = `${window.location.origin}/communaute#post-${post.id}`;
    if (navigator.share) {
      navigator.share({ title: `Post de ${post.authorName}`, url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => notify("Lien copié !", "success"),
      () => notify("Impossible de copier le lien.", "error"),
    );
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

  function onPickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateFile(file);
      if (!isImageFile(file.type)) throw new Error("Choisis une image JPG, PNG, GIF ou WEBP.");
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image impossible à utiliser.";
      notify(message, "error");
      event.target.value = "";
    }
  }

  function clearSelectedImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-night-950">
      <CommunityImmersiveFeed
        posts={visiblePosts}
        usersById={usersById}
        profilesById={profilesById}
        currentUserId={user?.id ?? null}
        mentionTargets={mentionTargets}
        onLike={(postId) => react(postId, "✨")}
        onShare={sharePost}
        onSave={savePost}
        onOpenComposer={() => setComposerOpen(true)}
        onOpenComments={(postId) => {
          setCommentTargetId(postId);
        }}
        savedPostIds={savedPostIds}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        leaderboard={leaderboard}
        weeklyLabel={
          weekStartIso ? `Semaine du ${new Date(weekStartIso).toLocaleDateString("fr-FR")}` : undefined
        }
      />

      {composerOpen && (
        <ComposerSheet
          draft={draft}
          setDraft={setDraft}
          onSubmit={publish}
          onClose={() => setComposerOpen(false)}
          fileInputRef={fileInputRef}
          onPickImage={onPickImage}
          clearSelectedImage={clearSelectedImage}
          imagePreviewUrl={imagePreviewUrl}
          videoUrl={videoUrl}
          setVideoUrl={setVideoUrl}
          tagQuery={tagQuery}
          setTagQuery={setTagQuery}
          tagLoading={tagLoading}
          tagResults={tagResults}
          appendMention={appendMention}
        />
      )}

      {selectedPost && commentTargetId && (
        <CommentsSheet
          post={selectedPost}
          onClose={() => setCommentTargetId(null)}
          profileOverrides={profilesById}
        />
      )}
    </div>
  );
}

function CommentsSheet({
  post,
  onClose,
  profileOverrides,
}: {
  post: CommunityPost;
  onClose: () => void;
  profileOverrides: Record<string, ProfileSummary>;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-night-950/80 backdrop-blur-md">
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[32px] border border-white/8 bg-night-950 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/20" />
        <div className="flex items-center justify-between px-4 pt-1">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">Commentaires</p>
            <h2 className="font-display text-xl text-gold-100">Sous le post de {post.authorName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-ivory/70"
          >
            Fermer
          </button>
        </div>
        <div className="max-h-[calc(88vh-72px)] overflow-y-auto px-4 pb-4 pt-3">
          <PostComments
            postId={post.id}
            comments={post.comments}
            postAuthorId={post.authorId}
            profileOverrides={profileOverrides as Record<string, UserProfileDto>}
          />
        </div>
      </div>
    </div>
  );
}

function ComposerSheet({
  draft,
  setDraft,
  onSubmit,
  onClose,
  fileInputRef,
  onPickImage,
  clearSelectedImage,
  imagePreviewUrl,
  videoUrl,
  setVideoUrl,
  tagQuery,
  setTagQuery,
  tagLoading,
  tagResults,
  appendMention,
}: {
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickImage: (event: ChangeEvent<HTMLInputElement>) => void;
  clearSelectedImage: () => void;
  imagePreviewUrl: string | null;
  videoUrl: string;
  setVideoUrl: (value: string) => void;
  tagQuery: string;
  setTagQuery: (value: string) => void;
  tagLoading: boolean;
  tagResults: UserSearchHitDto[];
  appendMention: (hit: UserSearchHitDto) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-night-950/80 backdrop-blur-md">
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[32px] border border-white/8 bg-night-950 p-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/20" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-gold-100">Créer un post</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-ivory/70"
          >
            Fermer
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-3 overflow-y-auto pb-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Partage quelque chose avec la communauté..."
            rows={4}
            className="glass-input min-h-28 resize-none"
          />
          <div className="flex flex-wrap gap-2">
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
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/80"
            >
              Ajouter une image
            </button>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="URL vidéo (optionnel)"
              className="glass-input min-w-0 flex-1"
            />
          </div>
          {imagePreviewUrl && (
            <div className="relative overflow-hidden rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={clearSelectedImage}
                className="absolute right-2 top-2 rounded-full border border-white/10 bg-night-950/70 px-2 py-1 text-xs"
              >
                Retirer
              </button>
              <img src={imagePreviewUrl} alt="Aperçu" className="max-h-56 w-full object-cover" />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/70"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-full bg-gold-shine px-4 py-2 text-sm font-semibold text-night-900"
            >
              Publier
            </button>
          </div>
          <div className="rounded-2xl border border-white/8 bg-night-900/55 p-3">
            <p className="text-xs uppercase tracking-[0.28em] text-gold-300">Mentions</p>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/8 bg-night-950/55 px-3 py-2">
              <input
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="@mentionner un membre"
                className="w-full bg-transparent text-sm outline-none"
              />
              {tagLoading && <span className="text-[10px] text-ivory/40">...</span>}
            </div>
            {tagResults.length > 0 && (
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {tagResults.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => appendMention(hit)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-night-950/60 px-3 py-2 text-left"
                  >
                    <AvatarImage
                      candidates={[hit.avatarImageUrl]}
                      fallbackSeed={hit.id}
                      alt={hit.username}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gold-100">{hit.username}</p>
                      <p className="text-xs text-ivory/45">
                        @{hit.handle || hit.username.replace(/\s+/g, "")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
