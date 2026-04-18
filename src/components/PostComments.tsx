import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { formatRelative } from "../lib/helpers";
import { apiAddComment, apiDeleteComment } from "../lib/api";
import { DREYNA_PROFILE } from "../data/mock";
import type { Comment } from "../types";

interface Props {
  postId: string;
  comments: Comment[];
  /** Auteur du post : seul lui (ou la reine) peut supprimer un commentaire. */
  postAuthorId: string;
}

export function PostComments({ postId, comments, postAuthorId }: Props) {
  const { user, isQueen } = useAuth();
  const { dispatch } = useStore();
  const { notify } = useToast();
  const [draft, setDraft] = useState("");

  function profileHref(authorId: string) {
    return authorId === DREYNA_PROFILE.id ? "/dreyna" : `/u/${authorId}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connectez-vous pour commenter.", "info");
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
      });
      dispatch({ type: "addPostComment", postId, comment });
      setDraft("");
    } catch (err) {
      console.warn(err);
      notify("Commentaire perdu en route.", "error");
    }
  }

  async function remove(commentId: string) {
    if (!user) return;
    try {
      await apiDeleteComment(postId, commentId, user.id);
      dispatch({ type: "deletePostComment", postId, commentId });
    } catch (err) {
      console.warn(err);
      notify("Suppression refusée par le royaume.", "error");
    }
  }

  return (
    <div className="mt-4 border-t border-royal-500/15 pt-4">
      <ul className="space-y-3">
        {comments.map((c) => {
          const canDelete =
            isQueen || user?.id === c.authorId || user?.id === postAuthorId;
          return (
            <li key={c.id} className="flex items-start gap-3">
              <Link to={profileHref(c.authorId)} className="shrink-0">
                <img
                  src={c.authorAvatar}
                  alt={c.authorName}
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-royal-500/30 transition hover:ring-gold-400/60"
                />
              </Link>
              <div className="flex-1 rounded-2xl bg-night-900/40 px-3 py-2">
                <p className="flex items-center gap-2 text-xs">
                  <Link
                    to={profileHref(c.authorId)}
                    className="font-display text-gold-200 transition hover:text-gold-300"
                  >
                    {c.authorName}
                  </Link>
                  <span className="text-[10px] text-ivory/40">
                    {formatRelative(c.createdAt)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/85">
                  {c.content}
                </p>
              </div>
              {canDelete && (
                <button
                  onClick={() => remove(c.id)}
                  className="text-ivory/30 transition hover:text-rose-300"
                  title="Supprimer ce commentaire"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form onSubmit={submit} className="mt-3 flex items-start gap-3">
        <img
          src={user?.avatar ?? "https://i.pravatar.cc/150?u=anon"}
          alt="Vous"
          className="h-8 w-8 rounded-full object-cover ring-2 ring-royal-500/30"
        />
        <div className="flex-1 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              user
                ? "Commenter cette parole…"
                : "Connectez-vous pour commenter…"
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
      </form>
    </div>
  );
}
