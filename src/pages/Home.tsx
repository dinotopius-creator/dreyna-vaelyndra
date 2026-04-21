import type React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Radio,
  ShoppingBag,
  Crown,
  Sparkles,
  Users,
  Heart,
} from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { TOP_FANS } from "../data/mock";
import { formatNumber } from "../lib/helpers";
import { SectionHeading } from "../components/SectionHeading";
import { RuneDivider } from "../components/RuneDivider";

export function Home() {
  const { articles, products, isLiveOn } = useStore();
  const featuredArticle = articles[0];
  const topProducts = products.filter((p) => p.featured).slice(0, 3);

  return (
    <div>
      <Hero isLiveOn={isLiveOn} />
      <StatsBar />
      <RuneDivider label="✦ Les portes de Vaelyndra ✦" />
      <Pillars />
      <FeaturedArticle article={featuredArticle} />
      <ShopShowcase products={topProducts} />
      <CommunityTeaser />
      <CTA />
    </div>
  );
}

function Hero({ isLiveOn }: { isLiveOn: boolean }) {
  return (
    <section className="relative overflow-hidden pb-24 pt-14 md:pt-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          <span className="tag-gold"><Crown className="h-3 w-3" /> Mini réseau social</span>
          <h1 className="heading-gold mt-6 text-5xl leading-[1.05] md:text-7xl">
            Bienvenue à<br />Vaelyndra
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ivory/80 md:text-xl">
            Le mini-réseau social féerique où <span className="text-mystic font-semibold">chacun peut percer</span>{" "}
            — lance tes lives, poste, tisse des liens d'âme, grimpe dans les 6 grades de streamer.
            Ton histoire commence ici.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/inscription" className="btn-gold">
              <Crown className="h-4 w-4" /> Créer mon compte
            </Link>
            <Link to="/live" className="btn-royal">
              <Radio className="h-4 w-4" /> Rejoindre les lives
              {isLiveOn && (
                <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              )}
            </Link>
            <Link to="/communaute" className="btn-ghost">
              <Users className="h-4 w-4" /> Le fil communautaire
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-ivory/60">
            <div className="flex -space-x-3">
              {TOP_FANS.slice(0, 4).map((f) => (
                <img
                  key={f.name}
                  src={f.avatar}
                  alt={f.name}
                  className="h-9 w-9 rounded-full border-2 border-night-900 object-cover"
                />
              ))}
            </div>
            <p>Chaque membre écrit sa propre page de Vaelyndra.</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative mx-auto aspect-[3/4] w-full max-w-md"
        >
          <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-gold-400/40 via-royal-500/30 to-celeste-500/30 blur-2xl" />
          <div className="card-royal relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[2rem] p-10 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(212,175,55,0.2),transparent_60%)]" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-gold-400/50 bg-gold-500/10 text-gold-300 shadow-glow-gold">
              <Crown className="h-9 w-9" />
            </span>
            <h3 className="relative mt-6 font-display text-3xl text-gold-200">
              Un réseau pour tous
            </h3>
            <p className="relative mt-3 max-w-xs text-sm text-ivory/70">
              Streame, poste, vote, offre des Sylvins, gravis les six grades
              spirituels. Chacun peut devenir une Légende de Vaelyndra.
            </p>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2 text-[10px] tracking-[0.22em]">
              <span className="rounded-full border border-royal-500/30 bg-night-900/40 px-3 py-1 text-royal-200">
                🌱 NOVICE
              </span>
              <span className="rounded-full border border-gold-400/30 bg-night-900/40 px-3 py-1 text-gold-300">
                👑 LÉGENDE
              </span>
            </div>
            <motion.div
              className="absolute right-4 top-4 rounded-full bg-night-900/70 p-2 text-gold-300 backdrop-blur"
              animate={{ rotate: [0, 8, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity }}
            >
              <Sparkles className="h-5 w-5" />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

type StatItem = {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  live?: boolean;
};

function StatsBar() {
  const items: StatItem[] = [
    {
      value: "∞",
      label: "Membres de Vaelyndra",
      icon: <Users className="h-4 w-4" />,
    },
    {
      value: "2",
      label: "Monnaies — Lueurs & Sylvins",
      icon: <Heart className="h-4 w-4" />,
    },
    {
      value: 6,
      label: "Grades streamers",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      value: "24/7",
      label: "Lives possibles",
      icon: <Radio className="h-4 w-4" />,
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6">
      <div className="card-royal grid grid-cols-2 gap-6 p-6 md:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-400/40 bg-gold-500/10 text-gold-300">
              {it.icon}
            </span>
            <div>
              <p className="font-display text-xl text-gold-200">{it.value}</p>
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                {it.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pillars() {
  const cards = [
    {
      title: "Le Grimoire",
      to: "/blog",
      desc: "Chroniques, lore et révélations — l'histoire vivante du royaume.",
      icon: <BookOpen className="h-5 w-5" />,
      tint: "from-royal-500/20 to-royal-700/10",
    },
    {
      title: "La Boutique Royale",
      to: "/boutique",
      desc: "Merch fantasy, tenues numériques, accès VIP à la cour privée.",
      icon: <ShoppingBag className="h-5 w-5" />,
      tint: "from-gold-400/20 to-gold-700/10",
    },
    {
      title: "La Salle des Lives",
      to: "/live",
      desc: "Streams immersifs, rituels d'ouverture et chat en direct.",
      icon: <Radio className="h-5 w-5" />,
      tint: "from-celeste-500/20 to-royal-700/10",
    },
    {
      title: "Le fil communautaire",
      to: "/communaute",
      desc: "Le fil social de Vaelyndra. Poster, réagir, se suivre.",
      icon: <Users className="h-5 w-5" />,
      tint: "from-royal-400/25 to-gold-500/10",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 pt-16">
      <SectionHeading
        eyebrow="Explore Vaelyndra"
        title={<>Quatre espaces pour <span className="text-mystic">percer</span></>}
        subtitle="Choisis ton chemin. Chacun mène à une part du réseau."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
          >
            <Link
              to={c.to}
              className="card-royal group relative block h-full p-6 transition hover:-translate-y-1"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${c.tint} opacity-0 transition group-hover:opacity-100`} />
              <div className="relative">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-night-900/70 text-gold-300 shadow-glow-violet">
                  {c.icon}
                </span>
                <h3 className="mt-5 font-display text-xl text-gold-200">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm text-ivory/70">{c.desc}</p>
                <span className="mt-5 inline-flex items-center gap-1 font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Entrer <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FeaturedArticle({ article }: { article?: (typeof import("../data/mock").INITIAL_ARTICLES)[number] }) {
  if (!article) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 pt-24">
      <SectionHeading
        eyebrow="Dernière chronique"
        title={<>Le royaume raconte</>}
        subtitle="Les chapitres qui animent la cour en ce moment."
        align="center"
      />
      <div className="mt-12 grid gap-8 lg:grid-cols-5">
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card-royal group relative overflow-hidden lg:col-span-3"
        >
          <Link to={`/blog/${article.slug}`} className="block">
            <div className="relative aspect-[16/9]">
              <img
                src={article.cover}
                alt={article.title}
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/40 to-transparent" />
              <span className="absolute left-5 top-5 tag-gold">{article.category}</span>
            </div>
            <div className="p-6">
              <h3 className="font-display text-2xl text-gold-200 md:text-3xl">
                {article.title}
              </h3>
              <p className="mt-3 text-ivory/75">{article.excerpt}</p>
              <span className="mt-5 inline-flex items-center gap-1 font-regal text-[10px] tracking-[0.22em] text-gold-300">
                Lire la chronique <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        </motion.article>
        <div className="space-y-5 lg:col-span-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="card-royal p-5"
            >
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Saga du royaume
              </p>
              <h4 className="mt-2 font-display text-lg text-gold-200">
                {[
                  "Les chevaliers d'argent de la Cour",
                  "Rituel de la Nuit d'Elennor",
                  "La Prophétie de l'Aube",
                ][i - 1]}
              </h4>
              <p className="mt-1 text-sm text-ivory/65">
                {[
                  "Portrait de celles et ceux qui veillent à vos côtés.",
                  "Pourquoi la lumière d'Elennor change tout.",
                  "Un chapitre secret, révélé lors du prochain live.",
                ][i - 1]}
              </p>
            </motion.div>
          ))}
          <Link to="/blog" className="btn-ghost w-full justify-center">
            Toutes les chroniques <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ShopShowcase({ products }: { products: ReturnType<typeof useStore>["products"] }) {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-24">
      <SectionHeading
        eyebrow="Boutique Royale"
        title={<>Objets sacrés & drops exclusifs</>}
        subtitle="Items en édition limitée, collections numériques et accès VIP — signés par la cour."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {products.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="card-royal group relative overflow-hidden"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={p.image}
                alt={p.name}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-transparent to-transparent" />
              <span className="absolute left-4 top-4 tag">{p.category}</span>
            </div>
            <div className="p-6">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                {p.tagline}
              </p>
              <h3 className="mt-1 font-display text-xl text-gold-200">
                {p.name}
              </h3>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-display text-xl text-ivory">
                  {p.price}
                  {p.currency}
                </span>
                <Link to="/boutique" className="btn-ghost">
                  Voir
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link to="/boutique" className="btn-royal">
          Explorer la boutique <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function CommunityTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-24">
      <div className="card-royal relative overflow-hidden p-10 md:p-14">
        <div className="relative z-10 grid items-center gap-8 md:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Communauté Vaelyndra"
              title={<>Rejoins la <span className="text-mystic">communauté</span></>}
              subtitle="Publie, réagis, suis tes streamers préférés, débloque des badges et monte dans les 6 grades."
            />
            <div className="mt-6 flex gap-3">
              <Link to="/inscription" className="btn-gold">
                Créer mon compte
              </Link>
              <Link to="/communaute" className="btn-ghost">
                Voir le fil
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {TOP_FANS.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-2xl border border-royal-500/30 bg-night-800/60 p-3"
              >
                <img
                  src={f.avatar}
                  alt={f.name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/60"
                />
                <div>
                  <p className="font-display text-sm text-gold-200">{f.name}</p>
                  <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                    {formatNumber(f.score)} pts
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-4xl px-6 pt-24 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="card-royal p-10 md:p-14"
      >
        <Sparkles className="mx-auto h-8 w-8 text-gold-300" />
        <h2 className="heading-gold mt-4 text-3xl md:text-5xl">
          Ta place est ici
        </h2>
        <p className="mt-4 text-ivory/75 md:text-lg">
          Crée ton compte, choisis ta créature, lance ton premier live.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/inscription" className="btn-gold">
            Créer mon compte
          </Link>
          <Link to="/communaute" className="btn-royal">
            Voir la communauté
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
