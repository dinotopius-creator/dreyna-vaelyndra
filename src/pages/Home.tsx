import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Crown,
  Bell,
  Coins,
  ChevronRight,
  CircleDot,
  Gem,
  Heart,
  MessageCircleHeart,
  Mail,
  Play,
  Radio,
  ShoppingBag,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useMessages } from "../contexts/MessagesContext";
import { useNotifications } from "../contexts/NotificationsContext";
import { useLive } from "../contexts/LiveContext";
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
import { AvatarViewer } from "../components/AvatarViewer";
import { SectionHeading } from "../components/SectionHeading";
import { RuneDivider } from "../components/RuneDivider";
import { CommunityContestBanner } from "../components/CommunityContestBanner";

type HomeMember = {
  userId: string;
  username: string;
  handle?: string | null;
  avatarImageUrl: string;
  badge: string;
};

type HomeArticle = (typeof import("../data/mock").INITIAL_ARTICLES)[number];

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
  const { user, backendMe } = useAuth();
  const { unreadCount: unreadMessages } = useMessages();
  const { unreadCount: unreadNotifications } = useNotifications();
  const { liveRegistry } = useLive();
  const isRegistered = Boolean(user);
  const dreynaChronicles = articles.filter(
    (article) => article.author.trim().toLowerCase() === "dreyna",
  );
  const featuredArticle = dreynaChronicles[0];
  const sideChronicles = dreynaChronicles.slice(1, 4);
  const topProducts = products.filter((p) => p.featured).slice(0, 3);
  const activeLive = useMemo(() => {
    const entries = Object.values(liveRegistry).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return entries[0] ?? null;
  }, [liveRegistry]);

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
        statsResult.status === "fulfilled" ? (statsResult.value ?? null) : null,
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

  const legacyHomeReferences = [
    featuredArticle,
    sideChronicles,
    topProducts,
    stats,
    homeMembers,
    RuneDivider,
  ];
  void legacyHomeReferences;

  const legacyHomeComponents = [
    StatsBar,
    Pillars,
    FeaturedArticle,
    ShopShowcase,
    CommunityTeaser,
    CTA,
  ];
  void legacyHomeComponents;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-night-950">
      <PremiumHomeHub
        isLiveOn={isLiveOn}
        isRegistered={isRegistered}
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications}
        backendMe={backendMe}
        activeLive={activeLive}
        topFans={topFans}
      />
    </div>
  );
}

function LegacyHero({
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
    <section className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-14 md:pt-20">
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
            <span className="text-mystic font-semibold">
              lives, les avatars
            </span>{" "}
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
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Accueil rapide",
                title: "Tes espaces",
                desc: "Social, Live, Monde et Familiers regroupés au même endroit.",
              },
              {
                label: "Mobile first",
                title: "Navigation claire",
                desc: "Des raccourcis pensés pour les doigts, pas pour un bureau.",
              },
              {
                label: "Événement",
                title: "Concours et lives",
                desc: "Les temps forts apparaissent avant le reste du fil.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="panel-app-soft min-h-28 p-4"
              >
                <p className="font-regal text-[10px] uppercase tracking-[0.22em] text-gold-300/75">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-lg text-gold-100">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-ivory/68">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 max-w-3xl">
            <CommunityContestBanner compact />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:hidden">
            {quickLinks.slice(0, 4).map((link) => (
              <Link
                key={link.title}
                to={link.to}
                className="panel-app-soft flex min-h-24 flex-col justify-between p-3"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200">
                  {link.icon}
                </span>
                <div className="mt-3">
                  <p className="font-display text-sm text-gold-100">
                    {link.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ivory/58">
                    {link.desc}
                  </p>
                </div>
              </Link>
            ))}
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
              Des profils, des scènes live et des liens sociaux pensés comme une
              vraie app.
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

export const Hero = LegacyHero;

function PremiumHomeHub({
  isLiveOn,
  isRegistered,
  unreadMessages,
  unreadNotifications,
  backendMe,
  activeLive,
  topFans,
}: {
  isLiveOn: boolean;
  isRegistered: boolean;
  unreadMessages: number;
  unreadNotifications: number;
  backendMe: ReturnType<typeof useAuth>["backendMe"];
  activeLive: ReturnType<typeof useLive>["liveRegistry"][string] | null;
  topFans: CommunityTopFanDto[];
}) {
  const { user } = useAuth();
  const avatarLink = isRegistered ? "/avatar" : "/connexion";
  const familiarLink = isRegistered ? "/familier" : "/connexion";
  const currencyPaid =
    (backendMe?.sylvins_paid ?? 0) + (backendMe?.sylvins_promo ?? 0);
  const currencyFree = backendMe?.lueurs ?? 0;
  const liveLink = activeLive ? `/live/${encodeURIComponent(activeLive.userId)}` : "/live";
  const orbitLinks = [
    { title: "Boutique", desc: "Tenues, drops et pieces exclusives", to: "/boutique", icon: <ShoppingBag className="h-5 w-5" /> },
    { title: "Avatar", desc: "Atelier, style et rotation 360deg", to: avatarLink, icon: <Gem className="h-5 w-5" /> },
    { title: "Mondes", desc: "Entrer dans l'espace 3D", to: "/mondes", icon: <Sparkles className="h-5 w-5" /> },
    { title: "Social", desc: "Fil, hashtags et concours dessin", to: "/social/play", icon: <Users className="h-5 w-5" /> },
  ];

  return (
    <section className="relative overflow-hidden pb-14 pt-4 sm:pb-18 sm:pt-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(253,224,71,0.18),transparent_22%),radial-gradient(circle_at_12%_18%,rgba(103,80,164,0.22),transparent_26%),radial-gradient(circle_at_88%_26%,rgba(244,114,182,0.16),transparent_20%),linear-gradient(180deg,rgba(6,4,13,0.86),rgba(10,7,19,0.96))]" />
      <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-gold-500/15 blur-[120px]" />
      <div className="mx-auto grid max-w-7xl items-start gap-6 px-3 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative z-10 order-2 lg:order-1"
        >
          <div className="panel-app relative overflow-hidden border border-gold-400/18 bg-night-950/50 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-5">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-regal text-[10px] uppercase tracking-[0.28em] text-gold-300/70">Accueil premium</p>
                <h1 className="font-display text-[clamp(2rem,7vw,4.25rem)] leading-[0.95] text-gold-100">Ton hub<br />mobile vivant</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`chip-app border border-white/10 bg-white/[0.04] ${isLiveOn ? "text-rose-100" : "text-ivory/65"}`}>
                  <span className={`h-2 w-2 rounded-full ${isLiveOn ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
                  {isLiveOn ? "En direct" : "Prêt"}
                </span>
                <Link to={isRegistered ? "/compte" : "/connexion"} className="chip-app border-gold-400/20 bg-gold-500/10 text-gold-100">
                  <Crown className="h-3.5 w-3.5" />
                  {isRegistered ? "Mon compte" : "Connexion"}
                </Link>
              </div>
            </div>

            <div className="relative mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative flex min-h-[28rem] items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.06),transparent_28%),radial-gradient(circle_at_50%_80%,rgba(255,202,91,0.12),transparent_28%),linear-gradient(180deg,rgba(18,11,31,0.96),rgba(5,4,12,0.96))] p-4 sm:min-h-[34rem]">
                <div className="absolute inset-x-8 bottom-8 h-20 rounded-full bg-black/30 blur-3xl" />
                <div className="absolute left-4 top-5 rounded-full border border-gold-300/18 bg-gold-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gold-100">360 deg avatar</div>
                <div className="absolute right-4 top-5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-ivory/60">Drag tactile</div>
                <div className="relative z-10 flex h-full w-full items-center justify-center">
                  <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(255,223,128,0.18),transparent_45%)]" />
                  <div className="relative flex h-full w-full items-center justify-center">
                    <div className="absolute inset-x-[16%] top-[14%] h-[58%] rounded-full border border-gold-300/12 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_62%)] blur-3xl" />
                    <div className="relative z-10 flex h-[19rem] w-[19rem] items-center justify-center rounded-full border border-gold-300/18 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),rgba(255,255,255,0.01)_55%,transparent_70%)] p-4 shadow-[0_0_70px_rgba(255,198,88,0.2)] sm:h-[24rem] sm:w-[24rem]">
                      <AvatarViewer
                        src={user?.avatar ?? backendMe?.avatar_image_url ?? null}
                        fallbackImage={user?.avatar ?? backendMe?.avatar_image_url ?? "/crown.svg"}
                        alt={user ? user.username : "Avatar de l'accueil"}
                        autoRotate
                        interactive
                        framing="body"
                        size="square"
                        className="h-full w-full rounded-full border border-white/10 bg-transparent"
                      />
                    </div>
                    <div className="absolute inset-0">
                      <Link to={liveLink} className="absolute left-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/18">
                        <span className={`h-2.5 w-2.5 rounded-full ${activeLive ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
                        <span className="font-semibold">{activeLive ? "Live" : "En direct"}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                      <Link to={avatarLink} className="absolute right-2 top-[18%] inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gold-100 transition hover:border-gold-300/30 hover:bg-gold-500/12">
                        <Gem className="h-3.5 w-3.5" />
                        Avatar
                      </Link>
                      <Link to="/boutique" className="absolute right-4 top-[57%] inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gold-100 transition hover:border-gold-300/30 hover:bg-gold-500/12">
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Boutique
                      </Link>
                      <Link to="/social/play" className="absolute left-4 bottom-[19%] inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gold-100 transition hover:border-gold-300/30 hover:bg-gold-500/12">
                        <Users className="h-3.5 w-3.5" />
                        Social
                      </Link>
                      <Link to="/mondes" className="absolute bottom-[8%] right-[18%] inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gold-100 transition hover:border-gold-300/30 hover:bg-gold-500/12">
                        <Sparkles className="h-3.5 w-3.5" />
                        Mondes
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="panel-app-soft border border-gold-400/15 bg-gold-500/10 p-4">
                    <div className="flex items-center gap-2 text-gold-100">
                      <Coins className="h-4 w-4" />
                      <p className="text-[10px] uppercase tracking-[0.24em]">Lueurs</p>
                    </div>
                    <p className="mt-3 font-display text-2xl text-gold-100">{formatNumber(currencyFree)}</p>
                  </div>
                  <div className="panel-app-soft border border-celeste-400/15 bg-celeste-500/10 p-4">
                    <div className="flex items-center gap-2 text-celeste-100">
                      <Coins className="h-4 w-4" />
                      <p className="text-[10px] uppercase tracking-[0.24em]">Sylvins</p>
                    </div>
                    <p className="mt-3 font-display text-2xl text-celeste-100">{formatNumber(currencyPaid)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Link to="/messages" className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200"><Mail className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="font-display text-lg text-gold-100">Messages</p><p className="text-xs text-ivory/60">{unreadMessages > 0 ? `${unreadMessages} non lus` : "Boite propre"}</p></div>
                  </Link>
                  <Link to="/compte" className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200"><Bell className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="font-display text-lg text-gold-100">Alertes</p><p className="text-xs text-ivory/60">{unreadNotifications > 0 ? `${unreadNotifications} nouvelles` : "Notifications"}</p></div>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                  {orbitLinks.map((link) => (
                    <Link key={link.title} to={link.to} className="panel-app-soft group flex min-h-28 flex-col justify-between p-4 transition hover:-translate-y-1 hover:border-gold-300/30">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200 transition group-hover:bg-gold-500/10">{link.icon}</span>
                      <div className="mt-3">
                        <p className="font-display text-base text-gold-100">{link.title}</p>
                        <p className="mt-1 text-xs leading-5 text-ivory/60">{link.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Link to="/familier" className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200"><Heart className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="font-display text-lg text-gold-100">Familier</p><p className="text-xs text-ivory/60">Enclos et soins</p></div>
                  </Link>
                  <Link to="/live" className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200"><Radio className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="font-display text-lg text-gold-100">Live</p><p className="text-xs text-ivory/60">Scenes en direct</p></div>
                  </Link>
                  <Link to={isRegistered ? "/compte" : "/connexion"} className="panel-app-soft flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300/30">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold-200"><CircleDot className="h-5 w-5" /></span>
                    <div className="min-w-0"><p className="font-display text-lg text-gold-100">Profil</p><p className="text-xs text-ivory/60">Compte et identite</p></div>
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 rounded-full border border-gold-400/15 bg-white/[0.03] px-4 py-3">
                <div className={`h-2.5 w-2.5 rounded-full ${activeLive ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/50">Live rapide</p>
                  <p className="text-sm text-gold-100">{activeLive ? activeLive.title || activeLive.username : "Aucun live actif"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={avatarLink} className="chip-app border-gold-400/20 bg-gold-500/10 text-gold-100"><Gem className="h-3.5 w-3.5" /> Avatar</Link>
                <Link to="/boutique" className="chip-app border-white/10 bg-white/[0.04] text-ivory/75"><ShoppingBag className="h-3.5 w-3.5" /> Boutique</Link>
                <Link to="/social/play" className="chip-app border-white/10 bg-white/[0.04] text-ivory/75"><Users className="h-3.5 w-3.5" /> Social</Link>
                <Link to={familiarLink} className="chip-app border-white/10 bg-white/[0.04] text-ivory/75"><Heart className="h-3.5 w-3.5" /> Familier</Link>
              </div>
            </div>
            {topFans.length > 0 && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex -space-x-2">
                  {topFans.slice(0, 4).map((fan) => (
                    <AvatarImage
                      key={fan.userId}
                      candidates={[fan.avatarImageUrl]}
                      fallbackSeed={fan.userId}
                      fallbackSrc="/crown.svg"
                      alt={fan.username}
                      className="h-9 w-9 rounded-full border border-white/10 object-cover ring-1 ring-white/10"
                    />
                  ))}
                </div>
                <p className="text-sm text-ivory/70">
                  Profils actifs et scènes vivantes mis en avant.
                </p>
              </div>
            )}
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
  sideStories: dreynaSideStories,
}: {
  article?: HomeArticle;
  sideStories: HomeArticle[];
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
          {dreynaSideStories.map((story, i) => (
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
