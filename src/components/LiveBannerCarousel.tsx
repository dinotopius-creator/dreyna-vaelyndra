import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Flame, Heart, Play, Sparkles, Trophy, Wand2, Globe2 } from "lucide-react";
import clsx from "clsx";
import { AvatarImage } from "./AvatarImage";
import { apiGetCommunityActivityLeaderboard, type CommunityActivityEntryDto } from "../lib/api";
import { COMMUNITY_DRAWING_CONTEST, drawingContestEndsIn } from "../data/communityContest";

type BannerTone = "gold" | "rose" | "emerald" | "cyan" | "violet";

type LiveBanner = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  tone: BannerTone;
  badge: string;
  icon: typeof Play;
  image?: string | null;
  dynamic?: boolean;
};

const TONE_STYLES: Record<BannerTone, string> = {
  gold: "from-gold-500/30 via-amber-500/20 to-night-950/90 border-gold-300/25",
  rose: "from-rose-500/30 via-fuchsia-500/18 to-night-950/90 border-rose-300/25",
  emerald: "from-emerald-500/28 via-teal-500/18 to-night-950/90 border-emerald-300/25",
  cyan: "from-cyan-500/28 via-sky-500/18 to-night-950/90 border-cyan-300/25",
  violet: "from-violet-500/30 via-indigo-500/18 to-night-950/90 border-violet-300/25",
};

function contestToBanner(): LiveBanner {
  const remaining = drawingContestEndsIn();
  const active = remaining > 0;
  return {
    id: "drawing-contest",
    title: "Concours de dessin",
    description: active
      ? "Ajoute #concoursdessin à ton post pour participer et tenter de gagner 1000 lueurs + 6 nourritures familier."
      : "Le concours est terminé. Les participations restent visibles dans la communauté.",
    ctaLabel: active ? "Participer" : "Voir l'annonce",
    href: "/communaute/hashtag/concoursdessin",
    tone: "gold",
    badge: "Annonce officielle",
    icon: Trophy,
    image: COMMUNITY_DRAWING_CONTEST.bannerImage,
    dynamic: active,
  };
}

function top1ToBanner(entry: CommunityActivityEntryDto | null | undefined): LiveBanner | null {
  if (!entry) return null;
  return {
    id: "community-top-1",
    title: "Top 1 communauté",
    description: `${entry.username} domine le classement cette semaine.`,
    ctaLabel: "Voir le classement",
    href: "/communaute",
    tone: "gold",
    badge: "Classement",
    icon: Trophy,
    image: entry.avatarImageUrl,
    dynamic: true,
  };
}

export function LiveBannerCarousel() {
  const navigate = useNavigate();
  const [top1, setTop1] = useState<CommunityActivityEntryDto | null>(null);
  const [loadingTop1, setLoadingTop1] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetCommunityActivityLeaderboard(1)
      .then((result) => {
        if (cancelled) return;
        setTop1(result.entries[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setTop1(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTop1(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const banners = useMemo<LiveBanner[]>(() => {
    const dynamicTop1 = top1ToBanner(top1);
    return [
      {
        id: "go-live",
        title: "Lance ton live",
        description: "Partage ton moment avec la communauté.",
        ctaLabel: "Lancer",
        href: "/live/studio",
        tone: "rose",
        badge: "Création",
        icon: Play,
      },
      dynamicTop1 ?? {
        id: "community-top-1-fallback",
        title: "Top 1 communauté",
        description: loadingTop1
          ? "Chargement du membre le plus actif..."
          : "Le classement démarre bientôt.",
        ctaLabel: "Voir le classement",
        href: "/communaute",
        tone: "gold",
        badge: "Classement",
        icon: Trophy,
      },
      contestToBanner(),
      {
        id: "familiar",
        title: "Nourris ton familier",
        description: "Fais monter ses cœurs et récupère des lueurs.",
        ctaLabel: "Ouvrir",
        href: "/familier",
        tone: "emerald",
        badge: "Familiers",
        icon: Heart,
      },
      {
        id: "worlds",
        title: "Explore les mondes",
        description: "Entre dans un monde 3D avec les autres membres.",
        ctaLabel: "Entrer",
        href: "/mondes",
        tone: "cyan",
        badge: "Monde",
        icon: Globe2,
      },
      {
        id: "events",
        title: "Événement Vaelyndra",
        description: "Découvre les activités et annonces du moment.",
        ctaLabel: "Voir",
        href: "/communaute",
        tone: "violet",
        badge: "Officiel",
        icon: Sparkles,
      },
      {
        id: "ranking",
        title: "Voir les classements",
        description: "Retrouve les membres les plus actifs de la semaine.",
        ctaLabel: "Consulter",
        href: "/communaute",
        tone: "gold",
        badge: "Communauté",
        icon: Trophy,
      },
      {
        id: "popular-live",
        title: "Lives populaires",
        description: "Découvre les directs en tendance maintenant.",
        ctaLabel: "Explorer",
        href: "/live",
        tone: "rose",
        badge: "Tendance",
        icon: Flame,
      },
      {
        id: "activity",
        title: "Activité en cours",
        description: "Rejoins les membres déjà connectés sur la plateforme.",
        ctaLabel: "Rejoindre",
        href: "/communaute",
        tone: "emerald",
        badge: "Live social",
        icon: Wand2,
      },
    ];
  }, [loadingTop1, top1]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || banners.length <= 1) return undefined;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return undefined;
    const tick = () => {
      if (paused) return;
      const cardWidth = viewport.clientWidth * 0.84;
      const next = ((activeIndex + 1) % banners.length) || 0;
      viewport.scrollTo({ left: next * cardWidth, behavior: "smooth" });
      setActiveIndex(next);
      advanceTimerRef.current = window.setTimeout(tick, 5400) as unknown as number;
    };
    advanceTimerRef.current = window.setTimeout(tick, 5400) as unknown as number;
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, [activeIndex, banners.length, paused]);

  function onScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cardWidth = viewport.clientWidth * 0.84;
    const nextIndex = Math.round(viewport.scrollLeft / cardWidth);
    if (Number.isFinite(nextIndex)) {
      setActiveIndex(Math.max(0, Math.min(banners.length - 1, nextIndex)));
    }
  }

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="font-regal text-[10px] uppercase tracking-[0.24em] text-gold-300/80">
            À la une
          </p>
          <h3 className="mt-1 font-display text-lg text-gold-100">Bannières dynamiques</h3>
        </div>
        <Link
          to="/communaute"
          className="inline-flex items-center gap-1 rounded-full border border-ivory/10 bg-night-900/50 px-3 py-1.5 text-[11px] text-ivory/70 transition hover:border-gold-300/35 hover:text-gold-100"
        >
          Voir la communauté
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div
        ref={viewportRef}
        onScroll={onScroll}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        className="hide-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
      >
        {banners.map((banner) => {
          const Icon = banner.icon;
          return (
            <button
              key={banner.id}
              type="button"
              onClick={() => navigate(banner.href)}
              className={clsx(
                "group relative min-w-[84%] snap-center overflow-hidden rounded-[28px] border p-4 text-left shadow-[0_16px_48px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_56px_rgba(0,0,0,0.35)] sm:min-w-[62%] lg:min-w-[34rem]",
                "bg-gradient-to-br",
                TONE_STYLES[banner.tone],
              )}
              aria-label={`${banner.title} - ${banner.description}`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.18),transparent_22%),radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.12),transparent_18%)]" />
              <div className="relative flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-night-950/35">
                  {banner.image ? (
                    <AvatarImage
                      candidates={[banner.image]}
                      fallbackSeed={banner.title}
                      alt={banner.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon className="h-8 w-8 text-white/90" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night-950/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/75">
                    {banner.badge}
                    {banner.dynamic && <span className="text-gold-200">• live</span>}
                  </div>
                  <p className="truncate font-display text-xl text-white">{banner.title}</p>
                  <p className="mt-1 max-w-[28rem] text-sm leading-5 text-white/78">
                    {banner.description}
                  </p>
                </div>
              </div>
              <div className="relative mt-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-night-950/25 px-3 py-1.5 text-[11px] font-semibold text-white/88">
                  {banner.ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
                  Tap pour ouvrir
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {banners.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            onClick={() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const cardWidth = viewport.clientWidth * 0.84;
              viewport.scrollTo({ left: index * cardWidth, behavior: "smooth" });
              setActiveIndex(index);
            }}
            className={clsx(
              "h-1.5 rounded-full transition",
              index === activeIndex ? "w-6 bg-gold-300" : "w-1.5 bg-ivory/20",
            )}
            aria-label={`Aller à la bannière ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
