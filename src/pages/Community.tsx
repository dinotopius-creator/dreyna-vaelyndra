import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Image, Send, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { TOP_FANS } from "../data/mock";
import { formatNumber, formatRelative, generateId } from "../lib/helpers";

const QUICK_EMOJIS = ["✨", "👑", "🌿", "⚔️", "🌙", "🔮"];

export function Community() {
  const { posts, dispatch } = useStore();
  const { user, isQueen } = useAuth();
  const { notify } = useToast();
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );

  function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      notify("Connectez-vous pour publier dans la cour.", "info");
      return;
    }
    if (!draft.trim()) return;
    dispatch({
      type: "addPost",
      post: {
        id: generateId("post"),
        authorId: user.id,
        authorName: user.username,
        authorAvatar: user.avatar,
        content: draft.trim(),
        imageUrl: imageUrl.trim() || undefined,
        createdAt: new Date().toISOString(),
        reactions: {},
        comments: [],
      },
    });
    setDraft("");
    setImageUrl("");
    notify("Votre parole brille dans la cour 🌟");
  }

  function react(postId: string, emoji: string) {
    if (!user) {
      notify("Connectez-vous pour réagir.", "info");
      return;
    }
    dispatch({ type: "reactPost", postId, emoji, userId: user.id });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <SectionHeading
        eyebrow="La Cour"
        title={<>Le <span className="text-mystic">fil</span> de Vaelyndra</>}
        subtitle="Partagez vos serments, créations et pensées. La reine passe ici chaque jour."
      />

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
                  <img
                    src={p.authorAvatar}
                    alt={p.authorName}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
                  />
                  <div className="flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-display text-gold-200">
                        {p.authorName}
                      </span>
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
                      onClick={() => dispatch({ type: "deletePost", id: p.id })}
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
                </div>
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
          <div className="card-royal p-5">
            <h3 className="font-display text-lg text-gold-200">
              <Sparkles className="mr-1 inline h-4 w-4 text-gold-300" />
              Top fans du mois
            </h3>
            <ol className="mt-4 space-y-3">
              {TOP_FANS.map((f, i) => (
                <li key={f.name} className="flex items-center gap-3">
                  <span className="font-display text-lg text-gold-300 w-6">
                    #{i + 1}
                  </span>
                  <img
                    src={f.avatar}
                    alt={f.name}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-gold-400/40"
                  />
                  <div className="flex-1">
                    <p className="font-display text-sm text-gold-200">
                      {f.name}
                    </p>
                    <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
                      {formatNumber(f.score)} pts
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

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
