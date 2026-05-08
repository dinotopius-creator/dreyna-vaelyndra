import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatDate, formatRelative, renderMarkdown } from "../lib/helpers";
import { SectionHeading } from "../components/SectionHeading";
import { ReportButton } from "../components/ReportButton";
import {
  addArticleCommentRemote,
  deleteArticleCommentRemote,
  toggleArticleCommentLikeRemote,
  toggleArticleLikeRemote,
} from "../lib/catalogApi";
import type { Comment, User } from "../types";

export function BlogArticle() {
  const { slug } = useParams();
  const { articles, dispatch } = useStore();
  const { user, users, backendMe } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [liking, setLiking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  const article = useMemo(
    () => articles.find((a) => a.slug === slug),
    [articles, slug],
  );
  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="heading-gold text-3xl">Chronique introuvable</h1>
        <Link to="/blog" className="btn-ghost mt-6">
          Retour au grimoire
        </Link>
      </div>
    );
  }

  const currentArticle = article;
  const liked = user ? currentArticle.likes.includes(user.id) : false;
  const likers = article.likes
    .map((id) => usersById.get(id))
    .filter(Boolean) as User[];
  const related = articles
    .filter((a) => a.id !== article.id && a.category === article.category)
    .slice(0, 3);
  const topLevelComments = article.comments.filter((c) => !c.parentId);
  const repliesByParent = article.comments.reduce<Record<string, Comment[]>>(
    (acc, c) => {
      if (!c.parentId) return acc;
      acc[c.parentId] = [...(acc[c.parentId] ?? []), c];
      return acc;
    },
    {},
  );
  const canModerateComments =
    backendMe?.role === "admin" || backendMe?.role === "animator";

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connectez-vous pour prendre la parole a la cour.", "info");
      navigate("/connexion", {
        state: { from: `/blog/${currentArticle.slug}` },
      });
      return;
    }
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const fresh = await addArticleCommentRemote(
        currentArticle.id,
        draft.trim(),
        replyTo?.id ?? null,
      );
      dispatch({ type: "updateArticle", article: fresh });
      setDraft("");
      setReplyTo(null);
      notify(
        replyTo
          ? `Reponse envoyee a ${replyTo.authorName}.`
          : "Votre parole est inscrite sur le grimoire.",
      );
    } catch (err) {
      console.warn(err);
      notify("Le commentaire n'a pas pu etre sauvegarde. Reessaie.", "error");
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike() {
    if (!user) {
      notify("Connectez-vous pour offrir votre coeur a Dreyna.", "info");
      navigate("/connexion");
      return;
    }
    if (liking) return;
    setLiking(true);
    dispatch({
      type: "toggleArticleLike",
      articleId: currentArticle.id,
      userId: user.id,
    });
    try {
      const fresh = await toggleArticleLikeRemote(currentArticle.id);
      dispatch({ type: "updateArticle", article: fresh });
    } catch (err) {
      console.warn(err);
      dispatch({
        type: "toggleArticleLike",
        articleId: currentArticle.id,
        userId: user.id,
      });
      notify("Le coeur n'a pas pu etre sauvegarde. Reessaie.", "error");
    } finally {
      setLiking(false);
    }
  }

  async function toggleCommentLike(comment: Comment) {
    if (!user) {
      notify("Connectez-vous pour liker ce commentaire.", "info");
      navigate("/connexion", {
        state: { from: `/blog/${currentArticle.slug}` },
      });
      return;
    }
    if (busyCommentId) return;
    setBusyCommentId(comment.id);
    try {
      const fresh = await toggleArticleCommentLikeRemote(
        currentArticle.id,
        comment.id,
      );
      dispatch({ type: "updateArticle", article: fresh });
    } catch (err) {
      console.warn(err);
      notify("Le like du commentaire n'a pas pu etre sauvegarde.", "error");
    } finally {
      setBusyCommentId(null);
    }
  }

  async function deleteComment(comment: Comment) {
    if (!user) return;
    if (comment.authorId !== user.id && !canModerateComments) return;
    if (busyCommentId) return;
    setBusyCommentId(comment.id);
    try {
      const fresh = await deleteArticleCommentRemote(
        currentArticle.id,
        comment.id,
      );
      dispatch({ type: "updateArticle", article: fresh });
      if (replyTo?.id === comment.id) setReplyTo(null);
      notify("Commentaire supprime.");
    } catch (err) {
      console.warn(err);
      notify("Suppression impossible pour le moment.", "error");
    } finally {
      setBusyCommentId(null);
    }
  }

  function commentAvatar(comment: Comment) {
    return usersById.get(comment.authorId)?.avatar || comment.authorAvatar;
  }

  function renderLikersCard(ids: string[]) {
    const known = ids.map((id) => usersById.get(id)).filter(Boolean) as User[];
    return (
      <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-2xl border border-gold-400/30 bg-night-950/95 p-3 shadow-2xl backdrop-blur group-hover:block group-focus-within:block">
        <p className="mb-2 font-regal text-[10px] uppercase tracking-[0.22em] text-gold-300">
          Aime par
        </p>
        <div className="max-h-64 space-y-2 overflow-auto">
          {known.length > 0 ? (
            known.map((liker) => (
              <Link
                key={liker.id}
                to={`/u/${liker.id}`}
                className="pointer-events-auto flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-royal-500/20"
              >
                <img
                  src={liker.avatar}
                  alt={liker.username}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <span className="truncate text-sm text-ivory/85">
                  {liker.username}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-xs text-ivory/55">
              {ids.length} membre{ids.length > 1 ? "s" : ""} ont aime.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderComment(comment: Comment, nested = false) {
    const commentLiked = user ? comment.likes.includes(user.id) : false;
    const replies = repliesByParent[comment.id] ?? [];
    const canDelete =
      !!user && (comment.authorId === user.id || canModerateComments);

    return (
      <li
        key={comment.id}
        id={`comment-${comment.id}`}
        className={
          nested
            ? "rounded-2xl border border-royal-500/15 bg-night-900/45 p-4"
            : "rounded-2xl border border-royal-500/20 bg-night-800/50 p-4"
        }
      >
        <div className="flex gap-3">
          <Link to={`/u/${comment.authorId}`} className="shrink-0">
            <img
              src={commentAvatar(comment)}
              alt={comment.authorName}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                to={`/u/${comment.authorId}`}
                className="font-display text-gold-200 transition hover:text-gold-100"
              >
                {comment.authorName}
              </Link>
              {comment.replyToAuthorName && (
                <span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2 py-0.5 text-[10px] text-gold-100">
                  repond a {comment.replyToAuthorName}
                </span>
              )}
              <span className="text-xs text-ivory/40">
                {formatRelative(comment.createdAt)}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/85">
              {comment.content}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => toggleCommentLike(comment)}
                  disabled={busyCommentId === comment.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                    commentLiked
                      ? "border-gold-400/60 bg-gold-400/15 text-gold-100"
                      : "border-royal-500/30 text-ivory/65 hover:border-gold-400/45 hover:text-gold-200"
                  }`}
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${
                      commentLiked ? "fill-gold-300 text-gold-300" : ""
                    }`}
                  />
                  {comment.likes.length}
                </button>
                {comment.likes.length > 0 && renderLikersCard(comment.likes)}
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(comment)}
                className="inline-flex items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-1 text-xs text-ivory/65 transition hover:border-gold-400/45 hover:text-gold-200"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Repondre
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => deleteComment(comment)}
                  disabled={busyCommentId === comment.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1 text-xs text-rose-200 transition hover:border-rose-400/60 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </button>
              )}
              {user && comment.authorId !== user.id && (
                <ReportButton
                  targetType="comment"
                  targetId={`${currentArticle.id}:${comment.id}`}
                  targetLabel={`Commentaire de ${comment.authorName}`}
                  targetUrl={`/blog/${currentArticle.slug}#comment-${comment.id}`}
                  compact
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 px-3 py-1 text-xs text-rose-200/75 transition hover:border-rose-400/50 hover:bg-rose-500/10"
                />
              )}
            </div>
          </div>
        </div>
        {replies.length > 0 && (
          <ul className="mt-4 space-y-3 border-l border-royal-500/25 pl-4">
            {replies.map((reply) => renderComment(reply, true))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <article className="relative">
      <div className="relative h-[50vh] min-h-[340px] overflow-hidden">
        <img
          src={article.cover}
          alt={article.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/60 to-night-900/20" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-4xl px-6 pb-10">
            <Link to="/blog" className="btn-ghost mb-6">
              <ArrowLeft className="h-4 w-4" /> Retour au grimoire
            </Link>
            <span className="tag-gold">{article.category}</span>
            <h1 className="heading-gold mt-4 text-4xl md:text-6xl">
              {article.title}
            </h1>
            <p className="mt-4 text-sm text-ivory/70">
              Par <span className="text-gold-200">{article.author}</span> ·{" "}
              {formatDate(article.createdAt)} · {article.readingTime} min de
              lecture
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="prose prose-invert max-w-none font-serif text-lg leading-relaxed text-ivory/90"
        >
          {renderMarkdown(article.content).map((p, i) => (
            <p
              key={i}
              className="mb-6"
              dangerouslySetInnerHTML={{ __html: p }}
            />
          ))}
        </motion.div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-royal-500/30 bg-night-800/60 p-4">
          <div className="group relative">
            <button
              onClick={toggleLike}
              disabled={liking}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                liked
                  ? "bg-gold-500/20 text-gold-200 shadow-glow-gold"
                  : "text-ivory/70 hover:text-gold-200"
              }`}
            >
              <Heart
                className={`h-4 w-4 ${liked ? "fill-gold-300 text-gold-300" : ""}`}
              />
              {article.likes.length} coeurs offerts
            </button>
            {article.likes.length > 0 && renderLikersCard(article.likes)}
          </div>
          {article.likes.length > 0 && (
            <p className="min-w-0 flex-1 truncate text-xs text-ivory/60">
              Aime par{" "}
              {likers.length > 0
                ? likers
                    .slice(0, 3)
                    .map((liker) => liker.username)
                    .join(", ")
                : `${article.likes.length} membre${
                    article.likes.length > 1 ? "s" : ""
                  }`}
              {likers.length > 3
                ? ` et ${likers.length - 3} autre${
                    likers.length - 3 > 1 ? "s" : ""
                  }`
                : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {article.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        </div>

        <section className="mt-14">
          <h2 className="font-display text-2xl text-gold-200">
            La cour en parle
          </h2>
          <form onSubmit={submitComment} className="mt-5 space-y-3">
            {replyTo && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold-400/25 bg-gold-400/10 px-4 py-2 text-sm text-gold-100">
                <span>
                  Reponse a <strong>{replyTo.authorName}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-gold-100/70 transition hover:text-gold-100"
                  aria-label="Annuler la reponse"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                user
                  ? replyTo
                    ? `Repondre a ${replyTo.authorName}...`
                    : "Laissez votre voix au grimoire..."
                  : "Connectez-vous pour commenter cette chronique..."
              }
              className="glass-input resize-none"
            />
            <div className="flex justify-end">
              <button type="submit" className="btn-gold" disabled={posting}>
                <Send className="h-4 w-4" />
                {posting ? "Publication..." : replyTo ? "Repondre" : "Publier"}
              </button>
            </div>
          </form>

          <ul className="mt-8 space-y-4">
            {article.comments.length === 0 && (
              <li className="text-sm text-ivory/50">
                Silence dans la cour... soyez la premiere voix.
              </li>
            )}
            {topLevelComments.map((c) => renderComment(c))}
          </ul>
        </section>

        {related.length > 0 && (
          <section className="mt-20">
            <SectionHeading
              align="left"
              eyebrow="A lire ensuite"
              title="Dans la meme saga"
            />
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/blog/${r.slug}`}
                  className="card-royal group overflow-hidden"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={r.cover}
                      alt={r.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                      {r.category}
                    </p>
                    <h4 className="mt-1 font-display text-base text-gold-200">
                      {r.title}
                    </h4>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
