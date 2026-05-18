import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CornerUpLeft, Send, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { formatRelative } from "../lib/helpers";
import { apiAddComment, apiDeleteComment, type UserProfileDto } from "../lib/api";
import type { Comment } from "../types";
import { getOfficial } from "../data/officials";
import { Handle } from "./Handle";
import { ReportButton } from "./ReportButton";
import { AvatarImage } from "./AvatarImage";
import StreamerGradeBadge from "./StreamerGradeBadge";
import { UserBadges } from "./UserBadges";

interface Props {
  postId: string;
  comments: Comment[];
  postAuthorId: string;
  profileOverrides?: Record<string, UserProfileDto>;
}

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

  const usersById = useMemo(
    () => new Map(users.map((entry) => [entry.id, entry])),
    [users],
  );

  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments],
  );

  const repliesByParent = useMemo(
    () =>
      comments.reduce<Record<string, Comment[]>>((acc, comment) => {
        if (!comment.parentId) return acc;
        acc[comment.parentId] = [...(acc[comment.parentId] ?? []), comment];
        return acc;
      }, {}),
    [comments],
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
    if (!draft.trim()) return;

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
      notify("Commentaire perdu en route.", "error");
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
      notify("Suppression refusee par le royaume.", "error");
    }
  }

  function renderComment(comment: Comment, nested = false) {
    const canDelete =
      isQueen || user?.id === comment.authorId || user?.id === postAuthorId;
    const replies = repliesByParent[comment.id] ?? [];
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
      <li
        key={comment.id}
        className={`flex items-start gap-3 ${nested ? "ml-5 sm:ml-8" : ""}`}
      >
        <Link to={profileHref(comment.authorId)} className="shrink-0">
          <AvatarImage
            candidates={[displayAvatar, comment.authorAvatar]}
            fallbackSeed={comment.authorId || comment.authorName}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover ring-2 ring-royal-500/30 transition hover:ring-gold-400/60"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-night-900/40 px-3 py-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Link
                to={profileHref(comment.authorId)}
                className="font-display text-gold-200 transition hover:text-gold-300"
              >
                {displayName}
              </Link>
              {displayGrade && (
                <StreamerGradeBadge grade={displayGrade} size="sm" />
              )}
              <UserBadges
                role={profile?.role ?? getOfficial(comment.authorId)?.role}
                creatureId={
                  profile?.creature?.id ??
                  usersById.get(comment.authorId)?.creatureId ??
                  getOfficial(comment.authorId)?.creatureId
                }
              />
              <Link
                to={profileHref(comment.authorId)}
                className="transition hover:opacity-80"
              >
                <Handle handle={displayHandle} size="xs" />
              </Link>
              <span className="text-[10px] text-ivory/40">
                {formatRelative(comment.createdAt)}
              </span>
            </p>

            {comment.replyToAuthorName && (
              <p className="mt-1 text-[11px] text-gold-300/85">
                Reponse a{" "}
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

            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ivory/85">
              {comment.content}
            </p>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1 text-[11px] text-ivory/50">
            <button
              type="button"
              onClick={() => startReply(comment)}
              className="inline-flex items-center gap-1 transition hover:text-gold-200"
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
              Repondre
            </button>
            {user && user.id !== comment.authorId && (
              <ReportButton
                targetType="comment"
                targetId={comment.id}
                targetLabel={`Commentaire de ${displayName}`}
                targetUrl={`/communaute#post-${postId}`}
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

          {replies.length > 0 && (
            <ul className="mt-3 space-y-3">
              {replies.map((reply) => renderComment(reply, true))}
            </ul>
          )}
        </div>
      </li>
    );
  }

  const replyDraftLabel = replyTo
    ? resolvedHandle(replyTo)
      ? `@${resolvedHandle(replyTo)}`
      : replyTo.authorName
    : null;

  return (
    <div className="mt-4 border-t border-royal-500/15 pt-4">
      <ul className="space-y-3">
        {topLevelComments.map((comment) => renderComment(comment))}
      </ul>

      <form onSubmit={submit} className="mt-3 flex items-start gap-3">
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
                Reponse a <strong>{replyDraftLabel}</strong>
              </span>
              <button
                type="button"
                onClick={resetReply}
                className="rounded-full border border-gold-300/25 p-1 transition hover:border-gold-200/45"
                title="Annuler la reponse"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                user
                  ? replyTo
                    ? `Repondre a ${replyDraftLabel}...`
                    : "Commenter cette parole..."
                  : "Connecte-toi pour commenter..."
              }
              className="glass-input flex-1"
              disabled={!user}
            />
            <button
              type="submit"
              className="btn-gold"
              disabled={!user || !draft.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
