import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  HelpCircle,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wand2,
  type LucideProps,
} from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";
import {
  WIKI_ARTICLES,
  WIKI_ARTICLES_BY_SLUG,
  WIKI_CATEGORIES,
  getWikiArticle,
  type WikiArticle,
  type WikiStatus,
} from "../data/wiki";

const ICONS: Record<string, ComponentType<LucideProps>> = {
  BookOpen,
  Compass,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
};

const STATUS_LABELS: Record<WikiStatus, { label: string; className: string }> = {
  available: {
    label: "Disponible",
    className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-100",
  },
  evolving: {
    label: "En evolution",
    className: "border-gold-400/35 bg-gold-500/10 text-gold-100",
  },
  "coming-soon": {
    label: "A venir",
    className: "border-sky-400/35 bg-sky-500/10 text-sky-100",
  },
};

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function articleMatches(article: WikiArticle, query: string): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return normalizeSearch(
    [
      article.title,
      article.category,
      article.audience,
      article.summary,
      article.route ?? "",
      ...article.steps,
      ...article.tips,
      ...(article.commonIssues ?? []),
    ].join(" "),
  ).includes(normalized);
}

export function Wiki() {
  const { slug } = useParams();
  const article = getWikiArticle(slug);

  useEffect(() => {
    document.title = article
      ? `${article.title} - Wiki Vaelyndra`
      : "Wiki Vaelyndra - Guide d'utilisation";
  }, [article]);

  if (slug && !article) {
    return <WikiNotFound />;
  }

  return article ? <WikiArticleView article={article} /> : <WikiHome />;
}

function WikiHome() {
  const [query, setQuery] = useState("");
  const filteredArticles = WIKI_ARTICLES.filter((article) =>
    articleMatches(article, query),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-royal-500/30 bg-night-900/65 px-4 py-8 shadow-[0_28px_90px_rgba(0,0,0,0.35)] sm:px-8 sm:py-12 lg:px-12">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-royal-500/25 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-gold-400/15 blur-3xl" />
        </div>
        <div className="relative grid gap-8 lg:grid-cols-[1.15fr,0.85fr] lg:items-end">
          <SectionHeading
            align="left"
            eyebrow="Centre d'aide"
            title={
              <>
                Wiki officiel <span className="text-mystic">Vaelyndra</span>
              </>
            }
            subtitle="Guides utilisateurs, streamers, avatar, familiers, lives, monde 3D, communaute, grades et offrandes. Tout est base sur les vraies routes et fonctionnalites du site."
          />

          <div className="rounded-[1.5rem] border border-white/10 bg-night-950/60 p-4 backdrop-blur-xl sm:p-5">
            <label
              htmlFor="wiki-search"
              className="text-xs uppercase tracking-[0.2em] text-gold-200/80"
            >
              Recherche rapide
            </label>
            <div className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-royal-500/30 bg-night-900/80 px-4 focus-within:border-gold-400/60">
              <Search className="h-4 w-4 text-gold-200/70" aria-hidden />
              <input
                id="wiki-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Profil, live, familier, joystick..."
                className="min-h-11 flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/35"
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ivory/55">
              {filteredArticles.length} article
              {filteredArticles.length > 1 ? "s" : ""} correspondant
              {filteredArticles.length > 1 ? "s" : ""}. Les cartes sont
              optimisées pour mobile et clavier.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {WIKI_CATEGORIES.map((category, index) => {
          const Icon = ICONS[category.icon] ?? BookOpen;
          const visibleArticles = category.articleSlugs
            .map((articleSlug) => WIKI_ARTICLES_BY_SLUG[articleSlug])
            .filter((entry): entry is WikiArticle => Boolean(entry))
            .filter((entry) => articleMatches(entry, query));

          if (query && visibleArticles.length === 0) return null;

          return (
            <motion.article
              key={category.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="rounded-[1.75rem] border border-royal-500/25 bg-night-900/55 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/10 text-gold-200">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300">
                    {category.eyebrow}
                  </p>
                  <h2 className="mt-1 font-display text-xl text-gold-100">
                    {category.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ivory/62">
                    {category.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                {visibleArticles.map((entry) => (
                  <ArticleLink key={entry.slug} article={entry} />
                ))}
              </div>
            </motion.article>
          );
        })}
      </section>

      {filteredArticles.length === 0 && (
        <div className="mt-8 rounded-[1.5rem] border border-royal-500/25 bg-night-900/50 p-6 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-gold-300" />
          <p className="mt-3 font-display text-xl text-gold-100">
            Aucun article trouve
          </p>
          <p className="mt-2 text-sm text-ivory/60">
            Essayez un autre mot : live, profil, avatar, familier, monde ou
            offrandes.
          </p>
        </div>
      )}

      <section className="mt-10 grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
        <div className="rounded-[1.75rem] border border-gold-400/25 bg-gold-500/10 p-5">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-gold-200" aria-hidden />
            <h2 className="font-display text-xl text-gold-100">
              Statuts du Wiki
            </h2>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-ivory/65">
            <p>
              <strong className="text-emerald-100">Disponible</strong> :
              fonctionnalite presente et utilisable.
            </p>
            <p>
              <strong className="text-gold-100">En evolution</strong> :
              fonctionnalite presente mais encore amelioree par PR.
            </p>
            <p>
              <strong className="text-sky-100">A venir</strong> : structure
              prevue, mais pas de fonctionnalite finale detectee.
            </p>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-royal-500/25 bg-night-900/50 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-200" aria-hidden />
            <h2 className="font-display text-xl text-gold-100">
              Parcours conseilles
            </h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QuickPath
              title="Je debute"
              links={["bien-commencer", "profil-membre", "familiers"]}
            />
            <QuickPath
              title="Je veux streamer"
              links={["guide-streamer", "lives-regarder", "dons-offrandes"]}
            />
            <QuickPath
              title="Je veux explorer"
              links={["monde-3d", "avatar-personnalisation", "communautes"]}
            />
            <QuickPath
              title="Je veux progresser"
              links={["classements", "grades-roles", "securite-regles"]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ArticleLink({ article }: { article: WikiArticle }) {
  const status = STATUS_LABELS[article.status];
  return (
    <Link
      to={`/wiki/${article.slug}`}
      className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-gold-400/45 hover:bg-gold-500/10 focus:outline-none focus:ring-2 focus:ring-gold-400/50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ivory group-hover:text-gold-100">
          {article.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ivory/42">
            {article.audience}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] ${status.className}`}
          >
            {status.label}
          </span>
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 flex-none text-gold-200/70 transition group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function QuickPath({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-200/75">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((slug) => {
          const article = WIKI_ARTICLES_BY_SLUG[slug];
          if (!article) return null;
          return (
            <Link
              key={slug}
              to={`/wiki/${slug}`}
              className="rounded-full border border-royal-500/30 px-3 py-1.5 text-xs text-ivory/70 transition hover:border-gold-400/60 hover:text-gold-100"
            >
              {article.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WikiArticleView({ article }: { article: WikiArticle }) {
  const status = STATUS_LABELS[article.status];
  const related = article.related
    .map((slug) => WIKI_ARTICLES_BY_SLUG[slug])
    .filter((entry): entry is WikiArticle => Boolean(entry));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12">
      <Link
        to="/wiki"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-royal-500/30 bg-night-900/55 px-4 py-2 text-sm text-ivory/75 transition hover:border-gold-400/60 hover:text-gold-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Retour au Wiki
      </Link>

      <article className="mt-6 overflow-hidden rounded-[2rem] border border-royal-500/30 bg-night-900/65 shadow-[0_28px_90px_rgba(0,0,0,0.32)]">
        <header className="relative overflow-hidden border-b border-royal-500/20 px-5 py-8 sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(230,194,116,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(169,122,255,0.2),transparent_40%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-gold-400/30 bg-gold-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-gold-100">
                {article.category}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${status.className}`}
              >
                {status.label}
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/55">
                {article.audience}
              </span>
            </div>
            <h1 className="heading-gold mt-5 text-3xl sm:text-5xl">
              {article.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-ivory/72">
              {article.summary}
            </p>
            {article.route && (
              <Link
                to={article.route}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-gold-400/35 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/15"
              >
                Ouvrir la page liee
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </header>

        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr,18rem]">
          <div className="space-y-6">
            <GuideSection title="Comment faire">
              <ol className="space-y-3">
                {article.steps.map((step, index) => (
                  <li
                    key={`${article.slug}-step-${index}`}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-ivory/76"
                  >
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gold-shine text-xs font-bold text-night-900">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </GuideSection>

            <GuideSection title="Conseils utiles">
              <ul className="grid gap-3 sm:grid-cols-2">
                {article.tips.map((tip, index) => (
                  <li
                    key={`${article.slug}-tip-${index}`}
                    className="rounded-2xl border border-gold-400/20 bg-gold-500/10 p-3 text-sm leading-6 text-ivory/76"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </GuideSection>

            {article.commonIssues && article.commonIssues.length > 0 && (
              <GuideSection title="Problemes frequents">
                <ul className="space-y-3">
                  {article.commonIssues.map((issue, index) => (
                    <li
                      key={`${article.slug}-issue-${index}`}
                      className="rounded-2xl border border-rose-300/15 bg-rose-500/10 p-3 text-sm leading-6 text-ivory/72"
                    >
                      {issue}
                    </li>
                  ))}
                </ul>
              </GuideSection>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-night-950/55 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-gold-200/75">
                Articles lies
              </p>
              <div className="mt-3 grid gap-2">
                {related.map((entry) => (
                  <ArticleLink key={entry.slug} article={entry} />
                ))}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-night-950/55 p-4 text-sm leading-6 text-ivory/60">
              <p className="font-display text-lg text-gold-100">
                Note de maintenance
              </p>
              <p className="mt-2">
                Ce guide documente les fonctionnalites detectees dans le code.
                Les sections marquees En evolution peuvent changer avec les
                prochaines PR.
              </p>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}

function GuideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl text-gold-100">{title}</h2>
      {children}
    </section>
  );
}

function WikiNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <HelpCircle className="mx-auto h-10 w-10 text-gold-300" />
      <h1 className="heading-gold mt-5 text-4xl">Article introuvable</h1>
      <p className="mt-3 text-ivory/65">
        Cette entree du Wiki n'existe pas encore ou a ete deplacee.
      </p>
      <Link to="/wiki" className="btn-gold mt-6">
        Retour au Wiki
      </Link>
    </div>
  );
}
