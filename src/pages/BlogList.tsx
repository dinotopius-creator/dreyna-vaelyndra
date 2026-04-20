import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Search } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { SectionHeading } from "../components/SectionHeading";
import type { Category } from "../types";
import { formatDate } from "../lib/helpers";
import clsx from "clsx";

const CATEGORIES: ("Toutes" | Category)[] = [
  "Toutes",
  "Lore",
  "Lifestyle",
  "Annonces",
  "Communauté",
];

export function BlogList() {
  const { articles } = useStore();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Toutes");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      const byCat = category === "Toutes" || a.category === category;
      const byQuery =
        !query.trim() ||
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.excerpt.toLowerCase().includes(query.toLowerCase()) ||
        a.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()));
      return byCat && byQuery;
    });
  }, [articles, category, query]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <SectionHeading
        eyebrow="Le Grimoire"
        title={<>Chroniques de <span className="text-mystic">Vaelyndra</span></>}
        subtitle="Lore, annonces, IRL et moments de cour — tout l'univers de Dreyna, page après page."
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={clsx(
                "rounded-full border px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] transition",
                category === c
                  ? "border-gold-400/70 bg-gold-500/15 text-gold-200 shadow-glow-gold"
                  : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40 hover:text-gold-200",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une chronique..."
            className="glass-input pl-9"
          />
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a, i) => (
          <motion.article
            key={a.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="card-royal group flex flex-col overflow-hidden"
          >
            <Link to={`/blog/${a.slug}`} className="relative block aspect-[16/10] overflow-hidden">
              <img
                src={a.cover}
                alt={a.title}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/30 to-transparent" />
              <span className="absolute left-4 top-4 tag-gold">{a.category}</span>
            </Link>
            <div className="flex flex-1 flex-col p-6">
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/50">
                {formatDate(a.createdAt)} · {a.readingTime} min
              </p>
              <h3 className="mt-2 font-display text-xl text-gold-200">
                <Link to={`/blog/${a.slug}`} className="hover:text-gold-300">
                  {a.title}
                </Link>
              </h3>
              <p className="mt-2 line-clamp-3 text-sm text-ivory/70">
                {a.excerpt}
              </p>
              <div className="mt-auto flex items-center justify-between pt-5 text-xs text-ivory/60">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-gold-300" />
                  {a.likes.length}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-royal-300" />
                  {a.comments.length}
                </span>
                <Link
                  to={`/blog/${a.slug}`}
                  className="font-regal text-[10px] tracking-[0.22em] text-gold-300 hover:text-gold-200"
                >
                  Lire →
                </Link>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-20 text-center text-ivory/60">
          Aucune chronique ne correspond à cette quête...
        </p>
      )}
    </div>
  );
}
