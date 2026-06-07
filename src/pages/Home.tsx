import type React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Crown,
  Gem,
  Heart,
  MessageCircleHeart,
  Play,
  Radio,
  ShoppingBag,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import {
  apiGetCommunityActivityLeaderboard,
  apiGetCommunityStats,
  apiGetTopFans,
  apiListPosts,
  type CommunityStatsOverviewDto,
  type CommunityTopFanDto,
} from "../lib/api";
import { formatNumber } from "../lib/helpers";
import { AvatarImage } from "../components/AvatarImage";
import { SectionHeading } from "../components/SectionHeading";
import { RuneDivider } from "../components/RuneDivider";

type HomeMember = {
  userId: string;
  username: string;
  handle?: string | null;
  avatarImageUrl: string;
  badge: string;
};

function dedupeMembers(input: HomeMember[]) {
  const seen = new Set<string>();
  return input.filter((member) => {
    if (!member.avatarImageUrl?.trim()) return false;
    if (seen.has(member.userId)) return false;
    seen.add(member.userId);
    return true;
  });
}

export function Home() {
  const { articles, products, isLiveOn } = useStore();
  const { user } = useAuth();
  const isRegistered = Boolean(user);
  const featuredArticle = articles[0];
  const sideArticles = articles.slice(1, 4);
  const topProducts = products.filter((p) => p.featured).slice(0, 3);

  const [stats, setStats] = useState<CommunityStatsOverviewDto | null>(null);
  const [topFans, setTopFans] = useState<CommunityTopFanDto[]>([]);
  const [homeMembers, setHomeMembers] = useState<HomeMember[]>([]);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      apiGetCommunityStats(),
      apiGetTopFans(8),
      apiGetCommunityActivityLeaderboard(10),
      apiListPosts(),
    ]).then((results) => {
      if (cancelled) return;

      const statsResult = results[0];
      const fansResult = results[1];
      const leaderboardResult = results[2];
      const postsResult = results[3];

      setStats(
        statsResult.status === "fulfilled" ? statsResult.value ?? null : null,
      );

      const resolvedFans =
        fansResult.status === "fulfilled" ? fansResult.value : [];
      setTopFans(resolvedFans);

      const members: HomeMember[] = resolvedFans.map((fan, index) => ({
        userId: fan.userId,
        username: fan.username,
        handle: fan.handle ?? null,
        avatarImageUrl: fan.avatarImageUrl,
        badge: index < 3 ? "Soutien du moment" : "Soutien actif",
      }));

      if (leaderboardResult.status === "fulfilled") {
        members.push(
          ...leaderboardResult.value.entries.map((entry, index) => ({
            userId: entry.id,
            username: entry.username,
            handle: entry.handle ?? null,
            avatarImageUrl: entry.avatarImageUrl,
            badge: index < 3 ? "Profil très présent" : "Membre très actif",
          })),
        );
      }

      if (postsResult.status === "fulfilled") {
        const postMembers = postsResult.value.slice(0, 10).flatMap((post) => [
          {
            userId: post.authorId,
            username: post.authorName,
            handle: post.authorHandle ?? null,
            avatarImageUrl: post.authorAvatar,
            badge: "Auteur récent",
          },
          ...post.comments.slice(0, 3).map((comment) => ({
            userId: comment.authorId,
            username: comment.authorName,
            handle: comment.authorHandle ?? null,
            avatarImageUrl: comment.authorAvatar,
            badge: "Voix de la communauté",
          })),
        ]);
        members.push(...postMembers);
      }

      setHomeMembers(dedupeMembers(members).slice(0, 18));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Hero
        isLiveOn={isLiveOn}
        isRegistered={isRegistered}
        topFans={topFans}
        homeMembers={homeMembers}
      />
      <StatsBar stats={stats} />
      <RuneDivider label="Les portes de Vaelyndra" />
      <Pillars />
      <FeaturedArticle article={featuredArticle} sideArticles={sideArticles} />
      <ShopShowcase products={topProducts} />
      <CommunityTeaser
        isRegistered={isRegistered}
        topFans={topFans}
        homeMembers={homeMembers}
      />
      <CTA isRegistered={isRegistered} />
    </div>
  );
}

function Hero({
  isLiveOn,
  isRegistered,
  topFans,
  homeMembers,
}: {
  isLiveOn: boolean;
  isRegistered: boolean;
  topFans: CommunityTopFanDto[];
  homeMembers: HomeMember[];
}) {
  const studioLink = isRegistered ? "/live/studio" : "/connexion";
  const avatarLink = isRegistered ? "/avatar" : "/connexion";
  const familiarLink = isRegistered ? "/familier" : "/connexion";
  const featuredProfiles = homeMembers.slice(0, 5);
  const visibleMembers = homeMembers.slice(0, 9);

  const quickLinks = [
    {
      title: "Entrer en live",
      desc: "Lancer ou rejoindre une scène active",
      to: studioLink,
      icon: <Radio className="h-5 w-5" />,
    },
    {
      title: "Sculpter l’avatar",
      desc: "Retrouver le studio identitaire",
      to: avatarLink,
      icon: <Gem className="h-5 w-5" />,
    },
    {
      title: "Voir le familier",
      desc: "Afficher et gérer ton compagnon",
      to: familiarLink,
      icon: <Heart className="h-5 w-5" />,
    },
    {
      title: "Explorer les mondes",
      desc: "Basculer vers les espaces interactifs",
      to: "/mondes",
      icon: <Sparkles className="h-5 w-5" />,
    },
  ];

  return (
    <section className="relative overflow-hidden pb-20 pt-10 sm:pb-24 sm:pt-14 md:pt-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,114,255,0.2),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,205,112,0.12),transparent_24%),linear-gradient(180deg,rgba(9,6,18,0.36),transparent_44%)]" />
      <div className="absolute left-1/2 top-20 h-80 w-80 -translate-x-1/2 rounded-full bg-royal-500/15 blur-[140px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative z-10"
        >
          <span className="chip-app border-gold-400/25 bg-gold-400/10 text-gold-100">
            <Crown className="h-3 w-3" /> Expérience avatar-first
          </span>
          <h1 className="heading-gold mt-6 text-4xl leading-[1.02] sm:text-5xl md:text-7xl">
            Vaelyndra devient
            <br />
            une scène vivante
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-ivory/80 sm:text-lg md:text-xl">
            Une app sociale fantasy centrée sur les{" "}
            <span className="text-mystic font-semibold">lives, les avatars</span>{" "}
            et les interactions. Entre en scène, retrouve ton familier, façonne
            ton identité et fais vivre ton royaume depuis mobile ou desktop.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {isRegistered ? (
              <Link to="/compte" className="btn-gold w-full sm:w-auto">
                <Crown className="h-4 w-4" /> Mon compte
              </Link>
            ) : (
              <Link to="/inscription" className="btn-gold w-full sm:w-auto">
                <Crown className="h-4 w-4" /> Créer mon compte
              </Link>
            )}
            <Link to="/live" className="btn-royal w-full sm:w-auto">
              <Radio className="h-4 w-4" /> Rejoindre les lives
              {isLiveOn && (
                <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              )}
            </Link>
            <Link to="/communaute" className="btn-ghost w-full sm:w-auto">
              <Users className="h-4 w-4" /> Le fil de la communauté
            </Link>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              to="/live"
              className="metric-app transition hover:-translate-y-0.5 hover:border-gold-300/30"
            >
              <p className="metric-app-value">Live</p>
              <p className="metric-app-label">salons immersifs</p>
            </Link>
            <Link
              to={avatarLink}
              className="metric-app transition hover:-translate-y-0.5 hover:border-gold-300/30"
            >
              <p className="metric-app-value">Avatar</p>
              <p className="metric-app-label">studio identitaire</p>
            </Link>
            <Link
              to={familiarLink}
              className="metric-app transition hover:-translate-y-0.5 hover:border-gold-300/30"
            >
              <p className="metric-app-value">Familiers</p>
              <p className="metric-app-label">compagnons visibles</p>
            </Link>
          </div>
          <div className="mt-6 flex flex-col items-start gap-4 text-sm text-ivory/60 sm:flex-row sm:items-center sm:gap-6">
            {topFans.length > 0 && (
              <div className="flex -space-x-3">
                {topFans.slice(0, 4).map((f) => (
                  <Link
                    key={f.userId}
                    to={`/u/${encodeURIComponent(f.userId)}`}
                    className="transition hover:-translate-y-0.5"
                    aria-label={`Voir le profil de ${f.username}`}
                  >
                    <AvatarImage
                      candidates={[f.avatarImageUrl]}
                      fallbackSeed={f.userId}
                      fallbackSrc="/crown.svg"
                      alt={f.username}
                      className="h-10 w-10 rounded-full border-2 border-[#140d24] object-cover ring-1 ring-white/10"
                    />
                  </Link>
                ))}
              </div>
            )}
            <p>
              Des profils, des scènes live et des liens sociaux pensés comme
              une vraie app.
            </p>
          </div>
          {featuredProfiles.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
              {featuredProfiles.map((member) => (
                <Link
                  key={member.userId}
                  to={`/u/${encodeURIComponent(member.userId)}`}
                  className="panel-app-soft flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-gold-300/30"
                >
                  <AvatarImage
                    candidates={[member.avatarImageUrl]}
                    fallbackSeed={member.userId}
                    fallbackSrc="/crown.svg"
                    alt={member.username}
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-gold-400/50"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm text-gold-100">
                      {member.username}
                    </p>
                    <p className="truncate text-xs text-ivory/58">
                      {member.handle ? `@${member.handle}` : member.badge}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                to={link.to}
                className="panel-app-soft group p-4 transition hover:-translate-y-1 hover:border-gold-300/30"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200 transition group-hover:bg-gold-500/10">
                  {link.icon}
                </span>
                <p className="mt-4 font-display text-lg text-gold-100">
                  {link.title}
                </p>
                <p className="mt-1 text-sm text-ivory/62">{link.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Ouvrir <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative mx-auto w-full max-w-xl lg:max-w-2xl"
        >
          <div className="absolute -inset-6 rounded-[3rem] bg-[radial-gradient(circle_at_50%_30%,rgba(166,114,255,0.38),transparent_42%),radial-gradient(circle_at_70%_80%,rgba(255,194,94,0.18),transparent_36%)] blur-3xl" />
          <div className="absolute -left-10 top-16 hidden h-28 w-28 rounded-[2rem] border border-gold-400/20 bg-gold-500/10 shadow-glow-gold blur-[1px] lg:block" />
          <div className="absolute -right-8 bottom-20 hidden h-24 w-24 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 shadow-glow-violet lg:block" />
          <div className="phone-stage">
            <div className="phone-stage-screen ambient-grid">
              <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(174,118,255,0.26),transparent)]" />

              <div className="relative z-10 flex items-center justify-between p-4">
                <Link to="/live" className="transition hover:opacity-90">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-ivory/45">
                    Live & avatar
                  </p>
                  <p className="font-display text-lg text-gold-100">
                    Vaelyndra
                  </p>
                </Link>
                <span className="chip-app text-rose-200">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  {isLiveOn ? "En direct" : "Prêt"}
                </span>
              </div>

              <div className="relative z-10 px-4">
                <Link
                  to={studioLink}
                  className="panel-app-soft block overflow-hidden transition hover:-translate-y-0.5 hover:border-gold-300/30"
                >
                  <div className="h-44 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_28%),linear-gradient(135deg,#271344_0%,#0d0917_42%,#0a1229_100%)] p-4">
                    <div className="flex items-start justify-between">
                      <span className="chip-app border-gold-400/20 bg-gold-400/10 text-gold-100">
                        <Play className="h-3.5 w-3.5" />
                        Salle live
                      </span>
                      <span className="chip-app">mobile-first</span>
                    </div>
                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <p className="font-display text-2xl text-gold-100">
                          Présence mystique
                        </p>
                        <p className="mt-2 max-w-[12rem] text-sm text-ivory/65">
                          Avatar, familier, chat et ambiance dans une seule
                          scène.
                        </p>
                      </div>
                      <div className="panel-app-soft flex h-16 w-16 items-center justify-center rounded-2xl border-gold-400/25 bg-gold-400/10 text-gold-200">
                        <Wand2 className="h-7 w-7" />
                      </div>
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <span className="chip-app border-white/10 bg-white/[0.04]">
                        avatar
                      </span>
                      <span className="chip-app border-white/10 bg-white/[0.04]">
                        familier
                      </span>
                      <span className="chip-app border-white/10 bg-white/[0.04]">
                        chat
                      </span>
                    </div>
                  </div>
                </Link>
              </div>

              <div className="relative z-10 mt-4 space-y-3 px-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to={avatarLink}
                    className="panel-app-soft block p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30"
                  >
                    <div className="flex items-center gap-2 text-gold-200">
                      <Gem className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.18em] text-ivory/55">
                        Avatar
                      </span>
                    </div>
                    <p className="mt-3 font-display text-xl text-gold-100">
                      Studio 3D
                    </p>
                    <p className="mt-1 text-sm text-ivory/60">
                      silhouette, scène, tenues
                    </p>
                  </Link>
                  <Link
                    to="/communaute"
                    className="panel-app-soft block p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30"
                  >
                    <div className="flex items-center gap-2 text-celeste-300">
                      <MessageCircleHeart className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.18em] text-ivory/55">
                        Communauté
                      </span>
                    </div>
                    <p className="mt-3 font-display text-xl text-gold-100">
                      Fil social
                    </p>
                    <p className="mt-1 text-sm text-ivory/60">
                      posts, réactions, soutien
                    </p>
                  </Link>
                </div>

                <Link
                  to={familiarLink}
                  className="panel-app-soft flex items-center justify-between p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30"
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
                      Familiers visibles
                    </p>
                    <p className="mt-1 font-display text-lg text-gold-100">
                      Une scène plus incarnée
                    </p>
                  </div>
                  <div className="flex -space-x-3">
                    {visibleMembers.slice(0, 3).map((member) => (
                      <AvatarImage
                        key={member.userId}
                        candidates={[member.avatarImageUrl]}
                        fallbackSeed={member.userId}
                        fallbackSrc="/crown.svg"
                        alt={member.username}
                        className="h-10 w-10 rounded-full border border-white/10 object-cover ring-1 ring-white/10"
                      />
                    ))}
                  </div>
                </Link>

                {visibleMembers.length > 0 && (
                  <Link
                    to="/communaute"
                    className="panel-app-soft block p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
                          Profils du royaume
                        </p>
                        <p className="mt-1 font-display text-lg text-gold-100">
                          Membres réellement inscrits
                        </p>
                      </div>
                      <span className="chip-app border-gold-400/20 bg-gold-400/10 text-gold-100">
                        {visibleMembers.length} profils
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {visibleMembers.map((member) => (
                        <AvatarImage
                          key={member.userId}
                          candidates={[member.avatarImageUrl]}
                          fallbackSeed={member.userId}
                          fallbackSrc="/crown.svg"
                          alt={member.username}
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
                        />
                      ))}
                    </div>
                  </Link>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <Link
                    to={studioLink}
                    className="panel-app-soft p-3 text-left transition hover:border-gold-300/30"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                      direct
                    </p>
                    <p className="mt-2 font-display text-base text-gold-100">
                      Studio live
                    </p>
                  </Link>
                  <Link
                    to={avatarLink}
                    className="panel-app-soft p-3 text-left transition hover:border-gold-300/30"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                      avatar
                    </p>
                    <p className="mt-2 font-display text-base text-gold-100">
                      Atelier
                    </p>
                  </Link>
                  <Link
                    to="/communaute"
                    className="panel-app-soft p-3 text-left transition hover:border-gold-300/30"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                      social
                    </p>
                    <p className="mt-2 font-display text-base text-gold-100">
                      Communauté
                    </p>
                  </Link>
                </div>
              </div>
            </div>
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
  to: string;
};

function StatsBar({ stats }: { stats: CommunityStatsOverviewDto | null }) {
  const membersValue =
    stats && stats.membersCount > 0 ? formatNumber(stats.membersCount) : "-";
  const livesValue =
    stats && stats.liveCount > 0 ? `${stats.liveCount} en direct` : "24/7";
  const items: StatItem[] = [
    {
      value: membersValue,
      label: "Membres de Vaelyndra",
      icon: <Users className="h-4 w-4" />,
      to: "/communaute",
    },
    {
      value: stats?.currenciesCount ?? 2,
      label: "Monnaies : Lueurs & Sylvins",
      icon: <Heart className="h-4 w-4" />,
      to: "/boutique",
    },
    {
      value: stats?.gradesCount ?? 6,
      label: "Grades streamers",
      icon: <Sparkles className="h-4 w-4" />,
      to: "/live",
    },
    {
      value: livesValue,
      label: "Lives possibles",
      icon: <Radio className="h-4 w-4" />,
      to: "/live",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="panel-app grid grid-cols-1 gap-4 p-5 min-[380px]:grid-cols-2 md:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.label}
            to={it.to}
            className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-400/20 bg-gold-500/10 text-gold-300">
              {it.icon}
            </span>
            <div>
              <p className="font-display text-xl text-gold-200">{it.value}</p>
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                {it.label}
              </p>
            </div>
          </Link>
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
      desc: "Chroniques, lore et révélations : l’histoire vivante du royaume.",
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
      desc: "Streams immersifs, rituels d’ouverture et chat en direct.",
      icon: <Radio className="h-5 w-5" />,
      tint: "from-celeste-500/20 to-royal-700/10",
    },
    {
      title: "Le fil de la communauté",
      to: "/communaute",
      desc: "Le fil social de Vaelyndra. Poster, réagir, se suivre.",
      icon: <Users className="h-5 w-5" />,
      tint: "from-royal-400/25 to-gold-500/10",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <SectionHeading
        eyebrow="Explore Vaelyndra"
        title={
          <>
            Quatre espaces pour <span className="text-mystic">percer</span>
          </>
        }
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
              className="panel-app group relative block h-full p-6 transition hover:-translate-y-1"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${c.tint} opacity-0 transition group-hover:opacity-100`}
              />
              <div className="relative">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-gold-300 shadow-glow-violet">
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

function FeaturedArticle({
  article,
  sideArticles,
}: {
  article?: (typeof import("../data/mock").INITIAL_ARTICLES)[number];
  sideArticles: (typeof import("../data/mock").INITIAL_ARTICLES)[number][];
}) {
  if (!article) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24">
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
          className="panel-app group relative overflow-hidden lg:col-span-3"
        >
          <Link to={`/blog/${article.slug}`} className="block">
            <div className="relative aspect-[16/9]">
              <img
                src={article.cover}
                alt={article.title}
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-night-900/40 to-transparent" />
              <span className="absolute left-5 top-5 tag-gold">
                {article.category}
              </span>
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
          {sideArticles.map((story, i) => (
            <motion.div
              key={story.title}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i + 1) * 0.1 }}
              className="panel-app transition hover:-translate-y-1"
            >
              <Link to={`/blog/${story.slug}`} className="block p-5">
                <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  {story.category}
                </p>
                <h4 className="mt-2 font-display text-lg text-gold-200">
                  {story.title}
                </h4>
                <p className="mt-1 text-sm text-ivory/65">{story.excerpt}</p>
                <span className="mt-4 inline-flex items-center gap-1 font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Ouvrir <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
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

function ShopShowcase({
  products,
}: {
  products: ReturnType<typeof useStore>["products"];
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24">
      <SectionHeading
        eyebrow="Boutique Royale"
        title={<>Objets sacrés & drops exclusifs</>}
        subtitle="Items en édition limitée, collections numériques et accès VIP signés par la cour."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {products.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="panel-app group relative overflow-hidden"
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
              <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-display text-xl text-ivory">
                  {p.price}
                  {p.currency}
                </span>
                <Link
                  to="/boutique"
                  className="btn-ghost w-full justify-center sm:w-auto"
                >
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

function CommunityTeaser({
  isRegistered,
  topFans,
  homeMembers,
}: {
  isRegistered: boolean;
  topFans: CommunityTopFanDto[];
  homeMembers: HomeMember[];
}) {
  const featuredCommunityMembers = homeMembers.slice(0, 8);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24">
      <div className="panel-app relative overflow-hidden p-6 sm:p-10 md:p-14">
        <div className="relative z-10 grid items-center gap-8 md:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Communauté Vaelyndra"
              title={
                <>
                  Rejoins la <span className="text-mystic">communauté</span>
                </>
              }
              subtitle="Publie, réagis, suis tes streamers préférés, débloque des badges et monte dans les 6 grades."
            />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {isRegistered ? (
                <Link to="/compte" className="btn-gold w-full sm:w-auto">
                  Mon compte
                </Link>
              ) : (
                <Link to="/inscription" className="btn-gold w-full sm:w-auto">
                  Créer mon compte
                </Link>
              )}
              <Link to="/communaute" className="btn-ghost w-full sm:w-auto">
                Voir le fil
              </Link>
            </div>
          </div>
          {featuredCommunityMembers.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {featuredCommunityMembers.map((member, i) => (
                <motion.div
                  key={member.userId}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="panel-app-soft transition hover:-translate-y-0.5 hover:border-gold-300/30"
                >
                  <Link
                    to={`/u/${encodeURIComponent(member.userId)}`}
                    className="flex items-center gap-3 p-3"
                  >
                    <AvatarImage
                      candidates={[member.avatarImageUrl]}
                      fallbackSeed={member.userId}
                      fallbackSrc="/crown.svg"
                      alt={member.username}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/60"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm text-gold-200">
                        {member.username}
                      </p>
                      <p className="truncate font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                        {member.handle ? `@${member.handle}` : member.badge}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : topFans.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {topFans.map((f, i) => (
                <motion.div
                  key={f.userId}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="panel-app-soft transition hover:-translate-y-0.5 hover:border-gold-300/30"
                >
                  <Link
                    to={`/u/${encodeURIComponent(f.userId)}`}
                    className="flex items-center gap-3 p-3"
                  >
                    <AvatarImage
                      candidates={[f.avatarImageUrl]}
                      fallbackSeed={f.userId}
                      fallbackSrc="/crown.svg"
                      alt={f.username}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-gold-400/60"
                    />
                    <div>
                      <p className="font-display text-sm text-gold-200">
                        {f.username}
                      </p>
                      <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                        {formatNumber(f.totalSylvinsGiven)} Sylvins offerts
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="panel-app-soft p-5 text-center text-sm text-ivory/65">
              Les premiers donateurs de la communauté apparaîtront ici :
              soutiens ton streamer préféré pour figurer dans le tableau.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CTA({ isRegistered }: { isRegistered: boolean }) {
  return (
    <section className="mx-auto max-w-4xl px-4 pt-20 text-center sm:px-6 sm:pt-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="panel-app p-6 sm:p-10 md:p-14"
      >
        <Sparkles className="mx-auto h-8 w-8 text-gold-300" />
        <h2 className="heading-gold mt-4 text-3xl md:text-5xl">
          Ta place est ici
        </h2>
        {isRegistered ? (
          <p className="mt-4 text-ivory/75 md:text-lg">
            Reprends ta place dans le royaume, lance un live ou retrouve la
            communauté.
          </p>
        ) : (
          <p className="mt-4 text-ivory/75 md:text-lg">
            Crée ton compte, choisis ta créature, lance ton premier live.
          </p>
        )}
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {isRegistered ? (
            <Link to="/compte" className="btn-gold w-full sm:w-auto">
              Mon compte
            </Link>
          ) : (
            <Link to="/inscription" className="btn-gold w-full sm:w-auto">
              Créer mon compte
            </Link>
          )}
          <Link to="/communaute" className="btn-royal w-full sm:w-auto">
            Voir la communauté
          </Link>
          <Link
            to={isRegistered ? "/live/studio" : "/live"}
            className="btn-ghost w-full sm:w-auto"
          >
            {isRegistered ? "Lancer le studio live" : "Voir les lives"}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
