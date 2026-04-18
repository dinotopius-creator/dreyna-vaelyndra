import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, Send } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatDate, formatRelative, generateId, renderMarkdown } from "../lib/helpers";
import { SectionHeading } from "../components/SectionHeading";

export function BlogArticle() {
  const { slug } = useParams();
  const { articles, dispatch } = useStore();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");

  const article = useMemo(
    () => articles.find((a) => a.slug === slug),
    [articles, slug],
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

  const liked = user ? article.likes.includes(user.id) : false;
  const related = articles
    .filter((a) => a.id !== article.id && a.category === article.category)
    .slice(0, 3);

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connectez-vous pour prendre la parole à la cour.", "info");
      navigate("/connexion", { state: { from: `/blog/${article?.slug}` } });
      return;
    }
    if (!draft.trim() || !article) return;
    dispatch({
      type: "addArticleComment",
      articleId: article.id,
      comment: {
        id: generateId("c"),
        authorId: user.id,
        authorName: user.username,
        authorAvatar: user.avatar,
        content: draft.trim(),
        createdAt: new Date().toISOString(),
        likes: [],
      },
    });
    setDraft("");
    notify("Votre parole est inscrite sur le grimoire ✨");
  }

  function toggleLike() {
    if (!user) {
      notify("Connectez-vous pour offrir votre cœur à Dreyna.", "info");
      navigate("/connexion");
      return;
    }
    if (!article) return;
    dispatch({
      type: "toggleArticleLike",
      articleId: article.id,
      userId: user.id,
    });
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
              {formatDate(article.createdAt)} · {article.readingTime} min de lecture
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

        <div className="mt-10 flex items-center justify-between rounded-2xl border border-royal-500/30 bg-night-800/60 p-4">
          <button
            onClick={toggleLike}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
              liked
                ? "bg-gold-500/20 text-gold-200 shadow-glow-gold"
                : "text-ivory/70 hover:text-gold-200"
            }`}
          >
            <Heart
              className={`h-4 w-4 ${liked ? "fill-gold-300 text-gold-300" : ""}`}
            />
            {article.likes.length} cœurs offerts
          </button>
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
            <textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                user
                  ? "Laissez votre voix au grimoire..."
                  : "Connectez-vous pour commenter cette chronique..."
              }
              className="glass-input resize-none"
            />
            <div className="flex justify-end">
              <button type="submit" className="btn-gold">
                <Send className="h-4 w-4" /> Publier
              </button>
            </div>
          </form>

          <ul className="mt-8 space-y-4">
            {article.comments.length === 0 && (
              <li className="text-sm text-ivory/50">
                Silence dans la cour... soyez la première voix.
              </li>
            )}
            {article.comments.map((c) => (
              <li
                key={c.id}
                className="flex gap-3 rounded-2xl border border-royal-500/20 bg-night-800/50 p-4"
              >
                <img
                  src={c.authorAvatar}
                  alt={c.authorName}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
                />
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-display text-gold-200">
                      {c.authorName}
                    </span>
                    <span className="text-xs text-ivory/40">
                      {formatRelative(c.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-ivory/85">{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {related.length > 0 && (
          <section className="mt-20">
            <SectionHeading
              align="left"
              eyebrow="À lire ensuite"
              title="Dans la même saga"
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
