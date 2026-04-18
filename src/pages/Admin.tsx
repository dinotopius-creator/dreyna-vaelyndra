import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookPlus,
  Crown,
  PackagePlus,
  Radio,
  RadioTower,
  ShieldCheck,
  Trash2,
  MessageSquareWarning,
} from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { Article, Category, LiveSession, Product } from "../types";
import {
  formatDate,
  formatNumber,
  generateId,
  readingTime,
  slugify,
} from "../lib/helpers";
import clsx from "clsx";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "articles", label: "Chroniques" },
  { id: "products", label: "Boutique" },
  { id: "lives", label: "Lives" },
  { id: "moderation", label: "Modération" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Admin() {
  const { user } = useAuth();
  const {
    articles,
    products,
    lives,
    posts,
    orders,
    isLiveOn,
    toggleLive,
  } = useStore();
  const [tab, setTab] = useState<TabId>("dashboard");

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-14">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="tag-gold">
            <ShieldCheck className="h-3 w-3" /> Salle du Trône
          </span>
          <h1 className="heading-gold mt-3 text-4xl md:text-5xl">
            Dashboard de la Reine
          </h1>
          <p className="mt-2 text-ivory/70">
            Chroniques, boutique, lives et modération — tout le royaume au bout
            de la couronne.
          </p>
        </div>
        <button
          onClick={toggleLive}
          className={clsx(
            "btn-royal",
            isLiveOn
              ? "bg-gradient-to-r from-rose-500 to-royal-600"
              : undefined,
          )}
        >
          <RadioTower className="h-4 w-4" />
          {isLiveOn ? "Terminer le live" : "Lancer le live"}
        </button>
      </header>

      <nav className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "rounded-full border px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em]",
              tab === t.id
                ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40 hover:text-gold-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        {tab === "dashboard" && (
          <Dashboard
            articles={articles}
            products={products}
            lives={lives}
            postsCount={posts.length}
            ordersCount={orders.length}
            ordersRevenue={orders.reduce((a, o) => a + o.total, 0)}
          />
        )}
        {tab === "articles" && <ArticlesAdmin />}
        {tab === "products" && <ProductsAdmin />}
        {tab === "lives" && <LivesAdmin />}
        {tab === "moderation" && <ModerationAdmin />}
      </motion.div>
    </div>
  );
}

function Dashboard({
  articles,
  products,
  lives,
  postsCount,
  ordersCount,
  ordersRevenue,
}: {
  articles: Article[];
  products: Product[];
  lives: LiveSession[];
  postsCount: number;
  ordersCount: number;
  ordersRevenue: number;
}) {
  const stats = [
    { label: "Chroniques", value: articles.length, icon: <Crown className="h-4 w-4" /> },
    { label: "Produits", value: products.length, icon: <PackagePlus className="h-4 w-4" /> },
    { label: "Lives", value: lives.length, icon: <Radio className="h-4 w-4" /> },
    { label: "Posts communauté", value: postsCount, icon: <MessageSquareWarning className="h-4 w-4" /> },
    { label: "Commandes", value: ordersCount, icon: <PackagePlus className="h-4 w-4" /> },
    {
      label: "Revenus simulés",
      value: `${formatNumber(Math.round(ordersRevenue))} €`,
      icon: <Crown className="h-4 w-4" />,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="card-royal p-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/40 bg-gold-500/10 text-gold-300">
            {s.icon}
          </span>
          <p className="mt-4 font-display text-3xl text-gold-200">
            {s.value}
          </p>
          <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function ArticlesAdmin() {
  const { articles, dispatch } = useStore();
  const { notify } = useToast();
  const [form, setForm] = useState<{
    title: string;
    excerpt: string;
    content: string;
    category: Category;
    cover: string;
    tags: string;
  }>({
    title: "",
    excerpt: "",
    content: "",
    category: "Lore",
    cover: "",
    tags: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const article: Article = {
      id: generateId("art"),
      slug: slugify(form.title),
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || form.content.slice(0, 160),
      content: form.content.trim(),
      category: form.category,
      cover:
        form.cover.trim() ||
        "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=1600&auto=format&fit=crop&q=80",
      author: "Dreyna",
      createdAt: new Date().toISOString(),
      readingTime: readingTime(form.content || form.excerpt),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      likes: [],
      comments: [],
    };
    dispatch({ type: "addArticle", article });
    notify("Chronique publiée ✨");
    setForm({
      title: "",
      excerpt: "",
      content: "",
      category: "Lore",
      cover: "",
      tags: "",
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
      <form onSubmit={submit} className="card-royal space-y-4 p-6">
        <h3 className="font-display text-xl text-gold-200">
          <BookPlus className="mr-1 inline h-4 w-4 text-gold-300" /> Nouvelle
          chronique
        </h3>
        <input
          className="glass-input"
          placeholder="Titre"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <textarea
          className="glass-input resize-none"
          rows={2}
          placeholder="Résumé / extrait"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
        <textarea
          className="glass-input resize-none font-serif"
          rows={8}
          placeholder="Contenu (markdown simple : **gras**, *italique*)"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
        />
        <div className="grid gap-3 md:grid-cols-2">
          <select
            className="glass-input"
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as Category })
            }
          >
            <option>Lore</option>
            <option>IRL / ZEPETO</option>
            <option>Annonces</option>
            <option>Communauté</option>
          </select>
          <input
            className="glass-input"
            placeholder="URL image de couverture"
            value={form.cover}
            onChange={(e) => setForm({ ...form, cover: e.target.value })}
          />
        </div>
        <input
          className="glass-input"
          placeholder="Tags (séparés par des virgules)"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
        />
        <button className="btn-gold w-full justify-center">
          Publier la chronique
        </button>
      </form>

      <div className="space-y-3">
        {articles.map((a) => (
          <div
            key={a.id}
            className="card-royal flex items-center gap-4 p-4"
          >
            <img
              src={a.cover}
              alt={a.title}
              className="h-16 w-24 rounded-lg object-cover"
            />
            <div className="flex-1">
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
                {formatDate(a.createdAt)} · {a.category}
              </p>
              <h4 className="font-display text-base text-gold-200">
                {a.title}
              </h4>
              <p className="mt-1 text-xs text-ivory/60">
                {a.likes.length} cœurs · {a.comments.length} commentaires
              </p>
            </div>
            <button
              onClick={() => {
                dispatch({ type: "deleteArticle", id: a.id });
                notify("Chronique supprimée");
              }}
              className="text-ivory/40 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductsAdmin() {
  const { products, dispatch } = useStore();
  const { notify } = useToast();
  const [form, setForm] = useState<{
    name: string;
    tagline: string;
    description: string;
    price: number;
    category: Product["category"];
    image: string;
    stock: number;
  }>({
    name: "",
    tagline: "",
    description: "",
    price: 0,
    category: "Merch",
    image: "",
    stock: 100,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const product: Product = {
      id: generateId("prod"),
      name: form.name.trim(),
      tagline: form.tagline.trim() || "Nouvelle relique",
      description: form.description.trim(),
      price: Number(form.price),
      currency: "€",
      image:
        form.image.trim() ||
        "https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&auto=format&fit=crop&q=80",
      category: form.category,
      rating: 5,
      stock: Number(form.stock),
      tags: [],
    };
    dispatch({ type: "addProduct", product });
    notify("Produit ajouté à la boutique royale 🛍️");
    setForm({
      name: "",
      tagline: "",
      description: "",
      price: 0,
      category: "Merch",
      image: "",
      stock: 100,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
      <form onSubmit={submit} className="card-royal space-y-4 p-6">
        <h3 className="font-display text-xl text-gold-200">
          <PackagePlus className="mr-1 inline h-4 w-4 text-gold-300" />{" "}
          Nouveau trésor
        </h3>
        <input
          className="glass-input"
          placeholder="Nom"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="glass-input"
          placeholder="Tagline"
          value={form.tagline}
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
        />
        <textarea
          className="glass-input resize-none"
          rows={3}
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            className="glass-input"
            placeholder="Prix (€)"
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: Number(e.target.value) })
            }
            required
          />
          <input
            type="number"
            className="glass-input"
            placeholder="Stock"
            value={form.stock}
            onChange={(e) =>
              setForm({ ...form, stock: Number(e.target.value) })
            }
          />
        </div>
        <select
          className="glass-input"
          value={form.category}
          onChange={(e) =>
            setForm({
              ...form,
              category: e.target.value as Product["category"],
            })
          }
        >
          <option>Merch</option>
          <option>Digital</option>
          <option>VIP</option>
          <option>Exclusif</option>
        </select>
        <input
          className="glass-input"
          placeholder="URL image"
          value={form.image}
          onChange={(e) => setForm({ ...form, image: e.target.value })}
        />
        <button className="btn-gold w-full justify-center">
          Ajouter à la boutique
        </button>
      </form>

      <div className="space-y-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="card-royal flex items-center gap-4 p-4"
          >
            <img
              src={p.image}
              alt={p.name}
              className="h-16 w-16 rounded-lg object-cover"
            />
            <div className="flex-1">
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
                {p.category} · stock {p.stock}
              </p>
              <h4 className="font-display text-base text-gold-200">
                {p.name}
              </h4>
              <p className="text-sm text-ivory/70">
                {p.price}€
              </p>
            </div>
            <button
              onClick={() => {
                dispatch({ type: "deleteProduct", id: p.id });
                notify("Produit retiré de la boutique");
              }}
              className="text-ivory/40 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LivesAdmin() {
  const { lives, dispatch, isLiveOn } = useStore();
  const { notify } = useToast();
  const [form, setForm] = useState<{
    title: string;
    description: string;
    cover: string;
    durationMinutes: number;
    peakViewers: number;
  }>({
    title: "",
    description: "",
    cover: "",
    durationMinutes: 60,
    peakViewers: 1200,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const live: LiveSession = {
      id: generateId("live"),
      title: form.title.trim(),
      description: form.description.trim(),
      cover:
        form.cover.trim() ||
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&auto=format&fit=crop&q=80",
      startedAt: new Date().toISOString(),
      durationMinutes: form.durationMinutes,
      peakViewers: form.peakViewers,
      replay: true,
    };
    dispatch({ type: "addLive", live });
    notify("Replay ajouté aux archives");
    setForm({
      title: "",
      description: "",
      cover: "",
      durationMinutes: 60,
      peakViewers: 1200,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
      <div className="space-y-6">
        <div className="card-royal p-6">
          <h3 className="font-display text-xl text-gold-200">
            <RadioTower className="mr-1 inline h-4 w-4 text-gold-300" />{" "}
            Diffusion en cours
          </h3>
          <p className="mt-2 text-sm text-ivory/70">
            {isLiveOn
              ? "Vous êtes actuellement en direct. La cour s'est réunie."
              : "Hors antenne. Le bouton dans le bandeau en haut de la page lance la diffusion."}
          </p>
        </div>
        <form onSubmit={submit} className="card-royal space-y-3 p-6">
          <h3 className="font-display text-xl text-gold-200">
            Ajouter un replay
          </h3>
          <input
            className="glass-input"
            placeholder="Titre"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            className="glass-input resize-none"
            rows={3}
            placeholder="Description"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
          <input
            className="glass-input"
            placeholder="URL couverture"
            value={form.cover}
            onChange={(e) => setForm({ ...form, cover: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              className="glass-input"
              placeholder="Durée (minutes)"
              value={form.durationMinutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  durationMinutes: Number(e.target.value),
                })
              }
            />
            <input
              type="number"
              className="glass-input"
              placeholder="Pic de viewers"
              value={form.peakViewers}
              onChange={(e) =>
                setForm({ ...form, peakViewers: Number(e.target.value) })
              }
            />
          </div>
          <button className="btn-gold w-full justify-center">
            Archiver ce live
          </button>
        </form>
      </div>
      <div className="space-y-3">
        {lives.map((l) => (
          <div key={l.id} className="card-royal flex items-center gap-4 p-4">
            <img
              src={l.cover}
              alt={l.title}
              className="h-16 w-24 rounded-lg object-cover"
            />
            <div className="flex-1">
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
                {formatDate(l.startedAt)} · {l.peakViewers} viewers
              </p>
              <h4 className="font-display text-base text-gold-200">
                {l.title}
              </h4>
            </div>
            <button
              onClick={() => {
                dispatch({ type: "deleteLive", id: l.id });
                notify("Replay retiré");
              }}
              className="text-ivory/40 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModerationAdmin() {
  const { posts, dispatch } = useStore();
  const { notify } = useToast();

  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl text-gold-200">
        Modération communauté
      </h3>
      {posts.length === 0 && (
        <p className="text-sm text-ivory/50">Aucun post pour l'instant.</p>
      )}
      {posts.map((p) => (
        <div key={p.id} className="card-royal flex items-start gap-4 p-4">
          <img
            src={p.authorAvatar}
            alt={p.authorName}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-royal-500/40"
          />
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm">
              <span className="font-display text-gold-200">{p.authorName}</span>
              <span className="text-xs text-ivory/40">
                {formatDate(p.createdAt)}
              </span>
            </p>
            <p className="mt-1 text-sm text-ivory/80">{p.content}</p>
          </div>
          <button
            onClick={() => {
              dispatch({ type: "deletePost", id: p.id });
              notify("Post modéré");
            }}
            className="text-ivory/40 hover:text-rose-300"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
