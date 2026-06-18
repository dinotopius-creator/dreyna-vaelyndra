import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BookOpen, ChevronRight, Crown, Gem, Heart, Menu, MessageCircleHeart, Radio, Search, ShoppingBag, Sparkles, Users, X } from "lucide-react";
import { AvatarImage } from "./AvatarImage";
import { AvatarViewer } from "./AvatarViewer";
import { formatNumber } from "../lib/helpers";
import type { CommunityTopFanDto } from "../lib/api";
import { useNotifications } from "../contexts/NotificationsContext";
import { formatRelative } from "../lib/helpers";
import { resolveNotificationUrl } from "../lib/notificationRoutes";

type LiveEntry = {
  title?: string | null;
  username?: string;
  userId: string;
};

type HomeAvatarHubProps = {
  isLiveOn: boolean;
  isRegistered: boolean;
  unreadMessages: number;
  unreadNotifications: number;
  userAvatar: string | null;
  backendMe: {
    sylvins_paid?: number | null;
    sylvins_promo?: number | null;
    lueurs?: number | null;
    avatar_image_url?: string | null;
  } | null;
  activeLive: LiveEntry | null;
  topFans: CommunityTopFanDto[];
};

export function HomeAvatarHub({
  isLiveOn,
  isRegistered,
  unreadMessages,
  unreadNotifications,
  userAvatar,
  backendMe,
  activeLive,
  topFans,
}: HomeAvatarHubProps) {
  const navigate = useNavigate();
  const { notifications, markRead } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currencyPaid =
    (backendMe?.sylvins_paid ?? 0) + (backendMe?.sylvins_promo ?? 0);
  const currencyFree = backendMe?.lueurs ?? 0;
  const avatarLink = isRegistered ? "/avatar" : "/connexion";
  const familiarLink = isRegistered ? "/familier" : "/connexion";
  const liveLink = activeLive ? `/live/${encodeURIComponent(activeLive.userId)}` : "/live";
  const visibleNotifications = useMemo(
    () => notifications.slice(0, 5),
    [notifications],
  );
  const liveRail = activeLive
    ? [
        { title: activeLive.title || activeLive.username || "Live du moment", subtitle: "En direct maintenant", to: liveLink },
        { title: "Live de nuit", subtitle: "Découvrir", to: "/live" },
        { title: "Créer un live", subtitle: "Ouvrir la scène", to: "/live/studio" },
      ]
    : [
        { title: "Live de nuit", subtitle: "Scènes à rejoindre", to: "/live" },
        { title: "Créer un live", subtitle: "Lancer la scène", to: "/live/studio" },
        { title: "En direct", subtitle: "Voir les lives", to: "/live" },
      ];

  const actionCards = [
    { title: "Chronique", subtitle: "Lire le grimoire", to: "/blog", icon: BookOpen },
    { title: "Avatar", subtitle: "Atelier 360°", to: avatarLink, icon: Gem },
    { title: "Quêtes", subtitle: "Missions", to: "/quetes", icon: BookOpen },
    { title: "Avantages", subtitle: "Boutique", to: "/boutique", icon: ShoppingBag },
    { title: "Style", subtitle: "Look & tenues", to: avatarLink, icon: Sparkles },
    { title: "Clubs", subtitle: "Créer / rejoindre", to: "/clubs", icon: Users },
  ] as const;

  return (
    <section className="relative min-h-[100dvh] overflow-hidden bg-[#130d23] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(244,114,182,0.30),transparent_24%),radial-gradient(circle_at_18%_25%,rgba(168,85,247,0.30),transparent_28%),radial-gradient(circle_at_80%_22%,rgba(59,130,246,0.16),transparent_24%),linear-gradient(180deg,#1a1030_0%,#120a22_48%,#090510_100%)]" />
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute left-1/2 top-28 h-80 w-80 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-[150px]" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1700px] flex-col px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(0.85rem+env(safe-area-inset-top))] sm:px-5">
        <div className="relative z-20 flex items-start justify-between gap-3">
          <Link to="/boutique" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/95 px-3 py-2 text-[13px] font-semibold text-night-900 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500/10 text-fuchsia-600"><Sparkles className="h-3.5 w-3.5" /></span>
            <span className="tabular-nums">{formatNumber(currencyPaid)}</span>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/10 text-amber-500"><Crown className="h-3.5 w-3.5" /></span>
            <span className="tabular-nums">{formatNumber(currencyFree)}</span>
          </Link>
        </div>

        {notificationsOpen && (
          <div className="relative z-30 mt-3 self-end">
            <div className="w-[min(100vw-1.5rem,22rem)] rounded-[1.6rem] border border-white/10 bg-night-950/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-1 pb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/45">Notifications</p>
                  <p className="font-semibold text-white">Dernières alertes</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/80"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {visibleNotifications.length === 0 ? (
                  <p className="rounded-2xl border border-white/8 bg-white/5 px-3 py-4 text-sm text-white/60">
                    Aucune notification pour le moment.
                  </p>
                ) : (
                  visibleNotifications.map((notification) => {
                    const target = resolveNotificationUrl(notification);
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          markRead(notification.id);
                          setNotificationsOpen(false);
                          navigate(target);
                        }}
                        className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-left transition hover:border-fuchsia-200/30 hover:bg-white/8"
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
                          <Bell className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white">
                            {notification.title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-white/60">
                            {notification.body}
                          </span>
                          <span className="mt-1 block text-[11px] text-white/40">
                            {formatRelative(notification.createdAt)}
                          </span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 text-white/35" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 mt-3 grid flex-1 gap-4 pb-4 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center lg:gap-6">
          <aside className="order-2 flex gap-3 overflow-x-auto pb-1 lg:order-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {liveRail.map((item, index) => (
              <Link key={`${item.title}-${index}`} to={item.to} className="group min-w-[8.7rem] rounded-[1.7rem] border border-white/10 bg-white/8 p-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.20)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-fuchsia-200/35 lg:min-w-0">
                <div className="relative overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-3">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,114,182,0.16),transparent_45%)]" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.15rem] border border-white/10 bg-night-950/70 text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                    <Radio className="h-7 w-7" />
                  </div>
                  <p className="relative mt-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-fuchsia-200/80">
                    {index === 0 ? "Live de nuit" : index === 1 ? "Midnight Gacha Coin" : "Modèles Populaires"}
                  </p>
                  <p className="relative mt-1 text-sm font-semibold leading-5 text-white">
                    {item.title}
                  </p>
                </div>
              </Link>
            ))}
          </aside>

          <div className="order-1 relative flex min-h-[24rem] items-center justify-center lg:order-2 lg:min-h-[42rem]">
            <div className="absolute inset-x-8 bottom-5 h-28 rounded-full bg-fuchsia-500/25 blur-3xl" />
            <div className="absolute inset-x-12 top-14 h-[70%] rounded-[3rem] border border-white/7 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_55%)]" />
            <div className="absolute inset-x-10 bottom-8 top-8 rounded-[3rem] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.05),transparent_26%),linear-gradient(180deg,rgba(133,35,255,0.18),rgba(255,92,203,0.10),rgba(0,0,0,0.08))] blur-[2px]" />
            <div className="absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full bg-white/8 blur-3xl" />

            <div className="relative flex h-full w-full items-center justify-center px-2">
              <div className="relative flex h-[28rem] w-full max-w-[24rem] items-center justify-center sm:h-[34rem] sm:max-w-[29rem] lg:h-[42rem] lg:max-w-[33rem]">
                <div className="absolute inset-x-6 bottom-10 h-16 rounded-full bg-black/35 blur-3xl" />
                <div className="absolute left-1/2 top-[14%] h-[76%] w-[76%] -translate-x-1/2 rounded-full border border-fuchsia-200/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_62%)] shadow-[0_0_90px_rgba(190,86,255,0.18)]" />
                <AvatarViewer
                  src={userAvatar ?? backendMe?.avatar_image_url ?? null}
                  fallbackImage={userAvatar ?? backendMe?.avatar_image_url ?? "/crown.svg"}
                  alt="Avatar de l'accueil"
                  autoRotate
                  interactive
                  framing="body"
                  size="portrait"
                  className="relative z-10 h-full w-full rounded-[2.4rem] border border-white/8 bg-transparent shadow-[0_24px_90px_rgba(0,0,0,0.28)]"
                />
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
                <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_16px_rgba(236,72,153,0.8)]" />
                Recommandations en direct
                <span aria-hidden="true">👀</span>
              </div>
            </div>
          </div>

          <aside className="order-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {actionCards.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.title} to={action.to} className="group flex min-w-[8.6rem] flex-col items-center justify-center gap-2 rounded-[1.8rem] border border-white/10 bg-white/8 px-3 py-4 text-center shadow-[0_20px_40px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-fuchsia-200/35 lg:min-w-0">
                  <span className="flex h-12 w-12 items-center justify-center rounded-[1.35rem] border border-white/10 bg-white/10 text-white transition group-hover:bg-fuchsia-500/16">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{action.title}</p>
                    <p className="text-[11px] text-white/60">{action.subtitle}</p>
                  </div>
                </Link>
              );
            })}
          </aside>
        </div>

        <div className="relative z-20 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link
            to="/communaute"
            className="flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 text-left backdrop-blur-md transition hover:border-fuchsia-200/35 hover:bg-white/12"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                Rechercher
              </p>
              <p className="font-semibold text-white">Social</p>
            </div>
            <Search className="h-5 w-5 text-white/85" />
          </Link>
          <button
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
            className="relative flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 text-left backdrop-blur-md transition hover:border-fuchsia-200/35 hover:bg-white/12"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                Notifications
              </p>
              <p className="font-semibold text-white">Alertes</p>
            </div>
            <Bell className="h-5 w-5 text-white/85" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>
          <Link
            to="/messages"
            className="relative flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 text-left backdrop-blur-md transition hover:border-fuchsia-200/35 hover:bg-white/12"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                Messages
              </p>
              <p className="font-semibold text-white">Boite</p>
            </div>
            <MessageCircleHeart className="h-5 w-5 text-white/85" />
            {unreadMessages > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </Link>
          <Link
            to="/compte"
            className="flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 text-left backdrop-blur-md transition hover:border-fuchsia-200/35 hover:bg-white/12"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/45">
                Menu
              </p>
              <p className="font-semibold text-white">Compte</p>
            </div>
            <Menu className="h-5 w-5 text-white/85" />
          </Link>
        </div>

        <div className="relative z-10 mt-1 flex flex-col gap-3 lg:mt-0 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3 rounded-[1.6rem] border border-white/10 bg-white/8 px-4 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
            <div className={`h-2.5 w-2.5 rounded-full ${isLiveOn ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
            <div>
              <p className="text-[10px] uppercase tracking-[0.26em] text-white/55">Live rapide</p>
              <p className="text-sm font-semibold text-white">
                {activeLive ? activeLive.title || activeLive.username : "Aucun live actif"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={avatarLink} className="chip-app border-fuchsia-300/25 bg-fuchsia-500/14 text-fuchsia-50">
              <Gem className="h-3.5 w-3.5" />
              Avatar
            </Link>
            <Link to="/boutique" className="chip-app border-white/10 bg-white/8 text-white/85">
              <ShoppingBag className="h-3.5 w-3.5" />
              Boutique
            </Link>
            <Link to="/social/play" className="chip-app border-white/10 bg-white/8 text-white/85">
              <Users className="h-3.5 w-3.5" />
              Social
            </Link>
            <Link to="/mondes" className="chip-app border-white/10 bg-white/8 text-white/85">
              <Sparkles className="h-3.5 w-3.5" />
              Mondes
            </Link>
            <Link to={familiarLink} className="chip-app border-white/10 bg-white/8 text-white/85">
              <Heart className="h-3.5 w-3.5" />
              Familier
            </Link>
          </div>
        </div>

        {topFans.length > 0 && (
          <div className="relative z-10 mt-3 flex items-center gap-3 self-start rounded-[1.4rem] border border-white/10 bg-white/8 px-4 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.18)] backdrop-blur-md">
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
            <p className="text-sm text-white/75">Profils actifs et scènes vivantes mis en avant.</p>
          </div>
        )}
      </div>
    </section>
  );
}
