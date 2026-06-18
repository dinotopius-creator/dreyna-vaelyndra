import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CornerUpLeft, Heart, Send, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { formatRelative } from "../lib/helpers";
import {
  apiAddComment,
  apiDeleteComment,
  apiToggleCommentLike,
  type UserProfileDto,
} from "../lib/api";
import type { Comment } from "../types";
import { getOfficial } from "../data/officials";
import { Handle } from "./Handle";
import { ReportButton } from "./ReportButton";
import { AvatarImage } from "./AvatarImage";
import { RichMentionText, buildMentionLookup } from "./RichMentionText";
import StreamerGradeBadge from "./StreamerGradeBadge";
import { UserBadges } from "./UserBadges";

interface Props {
  postId: string;
  comments: Comment[];
  postAuthorId: string;
  profileOverrides?: Record<string, UserProfileDto>;
}

type ThreadNode = Comment & { replies: ThreadNode[] };

export function PostComments({
  postId,
  comments,
  postAuthorId,
  profileOverrides = {},
}: Props) {
  const { user, users, isQueen } = useAuth();
  const { refresh: refreshProfile } = useProfile();
  const { dispatch } = useStore();
  const { notify } = useToast();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);

  const usersById = useMemo(
    () => new Map(users.map((entry) => [entry.id, entry])),
    [users],
  );

  const threadedComments = useMemo(() => {
    const nodes = new Map<string, ThreadNode>();
    const roots: ThreadNode[] = [];

    comments.forEach((comment) => {
      nodes.set(comment.id, { ...comment, replies: [] });
    });

    comments.forEach((comment) => {
      const node = nodes.get(comment.id);
      if (!node) return;
      const parentId = comment.parentId ?? null;
      const parent = parentId ? nodes.get(parentId) : null;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    });

    const sortTree = (items: ThreadNode[]) => {
      items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      items.forEach((item) => sortTree(item.replies));
    };
    sortTree(roots);
    return roots;
  }, [comments]);

  const mentionTargets = useMemo(
    () =>
      buildMentionLookup([
        ...users.map((entry) => ({
          userId: entry.id,
          handle: entry.handle ?? null,
          username: entry.username,
        })),
        ...Object.entries(profileOverrides).map(([userId, profile]) => ({
          userId,
          handle: profile.handle ?? null,
          username: profile.username ?? null,
        })),
        ...comments.flatMap((comment) => [
          {
            userId: comment.authorId,
            handle: comment.authorHandle ?? null,
            username: comment.authorName,
          },
          {
            userId: comment.replyToAuthorId ?? "",
            handle: comment.replyToAuthorHandle ?? null,
            username: comment.replyToAuthorName ?? null,
          },
        ]),
      ]),
    [comments, profileOverrides, users],
  );

  function profileHref(authorId: string) {
    return `/u/${authorId}`;
  }

  function resolvedHandle(comment: Comment) {
    return (
      comment.authorHandle?.trim() ||
      profileOverrides[comment.authorId]?.handle?.trim() ||
      null
    );
  }

  function mentionFor(comment: Comment) {
    const handle = resolvedHandle(comment);
    if (handle) return `@${handle}`;
    return `@${comment.authorName.replace(/\s+/g, "_")}`;
  }

  function startReply(comment: Comment) {
    setReplyTo(comment);
    const mention = `${mentionFor(comment)} `;
    setDraft((current) => {
      const trimmed = current.trim();
      if (!trimmed) return mention;
      return current.startsWith(mention) ? current : `${mention}${current}`;
    });
  }

  function resetReply() {
    setReplyTo(null);
    setDraft("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connecte-toi pour commenter.", "info");
      return;
    }
    if (!draft.trim() || posting) return;

    setPosting(true);
    try {
      const comment = await apiAddComment(postId, {
        author: {
          author_id: user.id,
          author_name: user.username,
          author_avatar: user.avatar,
        },
        content: draft.trim(),
        parentId: replyTo?.id ?? null,
        replyToAuthorId: replyTo?.authorId ?? null,
        replyToAuthorName: replyTo?.authorName ?? null,
      });
      dispatch({ type: "addPostComment", postId, comment });
      setDraft("");
      setReplyTo(null);
      void refreshProfile();
    } catch (err) {
      console.warn(err);
      notify("Le commentaire n'a pas pu être envoyé. Réessaie.", "error");
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    if (!user) return;
    try {
      await apiDeleteComment(postId, commentId, user.id);
      const toDelete = new Set<string>([commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        comments.forEach((comment) => {
          if (
            comment.parentId &&
            toDelete.has(comment.parentId) &&
            !toDelete.has(comment.id)
          ) {
            toDelete.add(comment.id);
            changed = true;
          }
        });
      }
      toDelete.forEach((id) => {
        dispatch({ type: "deletePostComment", postId, commentId: id });
      });
      if (replyTo?.id === commentId || replyTo?.parentId === commentId) {
        setReplyTo(null);
      }
    } catch (err) {
      console.warn(err);
      notify("Suppression refusée par le royaume.", "error");
    }
  }

  async function toggleLike(commentId: string) {
    if (!user) return;
    dispatch({ type: "toggleCommentLike", postId, commentId, userId: user.id });
    try {
      const updated = await apiToggleCommentLike(postId, commentId, user.id);
      dispatch({ type: "replaceComment", postId, comment: updated });
    } catch (err) {
      console.warn(err);
      dispatch({
        type: "toggleCommentLike",
        postId,
        commentId,
        userId: user.id,
      });
      notify("Like perdu en route.", "error");
    }
  }

  function renderThread(comment: ThreadNode, depth = 0) {
    const canDelete =
      isQueen || user?.id === comment.authorId || user?.id === postAuthorId;
    const profile = profileOverrides[comment.authorId];
    const displayName = profile?.username || comment.authorName;
    const displayHandle = profile?.handle ?? comment.authorHandle ?? null;
    const displayAvatar =
      profile?.avatarImageUrl ||
      usersById.get(comment.authorId)?.avatar ||
      comment.authorAvatar;
    const displayGrade = profile?.grade ?? comment.authorGrade ?? null;
    const replyLabel = comment.replyToAuthorHandle
      ? `@${comment.replyToAuthorHandle}`
      : comment.replyToAuthorName;

    return (
      <li key={comment.id} id={`comment-${comment.id}`} className="space-y-2">
        <div
          className={`flex w-full min-w-0 items-start gap-2.5 rounded-[24px] border border-white/8 bg-night-900/26 px-3 py-2.5 sm:gap-3 ${
            depth > 0 ? "ml-3 sm:ml-5" : ""
          }`}
        >
          <Link to={profileHref(comment.authorId)} className="shrink-0">
            <AvatarImage
              candidates={[displayAvatar, comment.authorAvatar]}
              fallbackSeed={comment.authorId || comment.authorName}
              alt={displayName}
              className={`rounded-full object-cover ring-2 ring-royal-500/30 transition hover:ring-gold-400/60 ${
                depth > 0 ? "h-7 w-7 sm:h-8 sm:w-8" : "h-8 w-8 sm:h-9 sm:w-9"
              }`}
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="max-w-full rounded-2xl bg-night-900/55 px-3 py-2 ring-1 ring-white/5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Link
                  to={profileHref(comment.authorId)}
                  className="min-w-0 max-w-full break-words font-display text-gold-200 transition hover:text-gold-300"
                >
                  {displayName}
                </Link>
                {displayGrade && <StreamerGradeBadge grade={displayGrade} size="sm" />}
                <UserBadges
                  role={profile?.role ?? getOfficial(comment.authorId)?.role}
                  creatureId={
                    profile?.creature?.id ??
                    usersById.get(comment.authorId)?.creatureId ??
                    getOfficial(comment.authorId)?.creatureId
                  }
                />
                <Link to={profileHref(comment.authorId)} className="transition hover:opacity-80">
                  <Handle handle={displayHandle} size="xs" />
                </Link>
                <span className="text-[10px] text-ivory/40">
                  {formatRelative(comment.createdAt)}
                </span>
              </p>

              {comment.replyToAuthorName && (
                <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-gold-400/15 bg-gold-500/10 px-2 py-0.5 text-[11px] text-gold-300/85">
                  Réponse à{" "}
                  {comment.replyToAuthorId ? (
                    <Link
                      to={profileHref(comment.replyToAuthorId)}
                      className="font-medium transition hover:text-gold-200"
                    >
                      {replyLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{replyLabel}</span>
                  )}
                </p>
              )}

              <RichMentionText
                content={comment.content}
                mentionsByHandle={mentionTargets}
                profileHref={profileHref}
                className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-ivory/85 [overflow-wrap:anywhere]"
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1 text-[11px] text-ivory/50">
              <button
                type="button"
                onClick={() => startReply(comment)}
                className="inline-flex items-center gap-1 transition hover:text-gold-200"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
                Répondre
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => toggleLike(comment.id)}
                  className={`inline-flex items-center gap-1 transition ${
                    comment.likes.includes(user.id) ? "text-rose-400" : "hover:text-rose-300"
                  }`}
                >
                  <Heart
                    className="h-3.5 w-3.5"
                    fill={comment.likes.includes(user.id) ? "currentColor" : "none"}
                  />
                  {comment.likes.length > 0 && <span>{comment.likes.length}</span>}
                </button>
              )}
              {!user && comment.likes.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {comment.likes.length}
                </span>
              )}
              {user && user.id !== comment.authorId && (
                <ReportButton
                  targetType="comment"
                  targetId={comment.id}
                  targetLabel={`Commentaire de ${displayName}`}
                  targetUrl={`/communaute#comment-${comment.id}`}
                  compact
                  className="text-ivory/30 hover:text-rose-300"
                />
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => remove(comment.id)}
                  className="text-ivory/30 transition hover:text-rose-300"
                  title="Supprimer ce commentaire"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        {comment.replies?.length > 0 && (
          <ul className="space-y-2 border-l border-white/8 pl-3 sm:pl-5">
            {comment.replies.map((reply) => renderThread(reply, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const replyDraftLabel = replyTo
    ? resolvedHandle(replyTo)
      ? `@${resolvedHandle(replyTo)}`
      : replyTo.authorName
    : null;

  return (
    <div className="mt-4 rounded-3xl border border-white/8 bg-night-950/25 p-3 shadow-inner shadow-night-950/20 sm:p-4">
      {comments.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-night-950/35 px-4 py-3 text-sm text-ivory/58">
          Aucun commentaire pour le moment. Soyez le premier à répondre.
        </div>
      )}

      <ul className="space-y-3 overflow-x-hidden">{threadedComments.map((comment) => renderThread(comment))}</ul>

      <form
        onSubmit={submit}
        className="mt-3 flex min-w-0 items-start gap-2.5 rounded-3xl border border-white/8 bg-night-900/40 p-3 sm:gap-3"
      >
        <AvatarImage
          candidates={[user?.avatar]}
          fallbackSeed={user?.id ?? "anon"}
          alt="Vous"
          className="h-8 w-8 rounded-full object-cover ring-2 ring-royal-500/30"
        />

        <div className="min-w-0 flex-1">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-gold-400/20 bg-gold-500/10 px-3 py-2 text-xs text-gold-100">
              <span className="truncate">
                Réponse à <strong>{replyDraftLabel}</strong>
              </span>
              <button
                type="button"
                onClick={resetReply}
                className="rounded-full border border-gold-300/25 p-1 transition hover:border-gold-200/45"
                title="Annuler la réponse"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                user
                  ? replyTo
                    ? `Répondre à ${replyDraftLabel}...`
                    : "Commenter cette parole..."
                  : "Connecte-toi pour commenter..."
              }
              rows={1}
              className="glass-input min-h-11 flex-1 resize-none py-2.5 [overflow-wrap:anywhere]"
              disabled={!user}
            />
            <button type="submit" className="btn-gold min-h-11 px-4" disabled={!user || !draft.trim() || posting}>
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
