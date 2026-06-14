import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useMessages } from "../contexts/MessagesContext";
import { useNotifications } from "../contexts/NotificationsContext";
import type { AppNotification } from "../contexts/NotificationsContext";
import { resolveNotificationUrl } from "../lib/notificationRoutes";
import {
  AtSign,
  Bell,
  Crown,
  CheckCheck,
  Gamepad2,
  Gift,
  House,
  Menu,
  MessageCircle,
  ShoppingBag,
  Radio,
  Settings,
  LogOut,
  UserCircle2,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  Users,
  X,
  Heart,
  MessageSquare,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { formatRelative } from "../lib/helpers";

const NAV = [
  { to: "/", label: "Royaume" },
  { to: "/blog", label: "Chroniques" },
  { to: "/boutique", label: "Boutique" },
  { to: "/live", label: "Live" },
  { to: "/mondes", label: "Mondes" },
  { to: "/wiki", label: "Wiki" },
  { to: "/communaute", label: "Communauté" },
];

const MOBILE_TABS = [
  { to: "/", label: "Accueil", icon: House, match: (path: string) => path === "/" },
  {
    to: "/mondes",
    label: "Monde",
    icon: Gamepad2,
    match: (path: string) => path.startsWith("/mondes"),
  },
  {
    to: "/live",
    label: "Lives",
    icon: Radio,
    match: (path: string) => path.startsWith("/live"),
  },
  {
    to: "/communaute",
    label: "Social",
    icon: Users,
    match: (path: string) => path.startsWith("/communaute"),
  },
  {
    to: "/moi",
    label: "Profil",
    icon: UserRound,
    match: (path: string) =>
      path.startsWith("/moi") ||
      path.startsWith("/compte") ||
      path.startsWith("/avatar") ||
      path.startsWith("/familier"),
  },
];

type MobileMenuLink = {
  to: string;
  label: string;
  icon: typeof House;
  end?: boolean;
  badge?: string;
};

type NotificationFilter = "all" | "mentions" | "community" | "lives" | "staff";

const NOTIFICATION_FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "mentions", label: "Mentions" },
  { id: "community", label: "Communauté" },
  { id: "lives", label: "Lives" },
  { id: "staff", label: "Staff" },
];

export function Navbar() {
  const { user, isQueen, logout, backendMe } = useAuth();
  const { cartCount } = useStore();
  const { unreadCount } = useMessages();
  const {
    notifications,
    unreadCount: notificationUnreadCount,
    preferences,
    permission,
    markRead,
    markAllRead,
    clearNotification,
    updatePreferences,
    requestBrowserPermission,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    useState(false);
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilter>("all");
  const navigate = useNavigate();
  const location = useLocation();
  const canAccessAdmin =
    isQueen ||
    backendMe?.role === "architect" ||
    backendMe?.role === "admin" ||
    backendMe?.role === "animator";
  const adminLabel = "Salle du Trône";
  const mobileMainLinks: MobileMenuLink[] = [
    { to: "/", label: "Accueil", icon: House, end: true },
    { to: "/blog", label: "Chroniques", icon: Crown },
    { to: "/communaute", label: "Communauté", icon: Users },
    { to: "/mondes", label: "Monde", icon: Gamepad2 },
    { to: "/live", label: "Lives", icon: Radio, end: true },
    { to: "/boutique", label: "Boutique", icon: ShoppingBag },
    { to: "/wiki", label: "Wiki / Aide", icon: Settings },
  ];
  const mobileAccountLinks: MobileMenuLink[] = user
    ? [
        { to: "/moi", label: "Profil", icon: UserRound },
        {
          to: "/messages",
          label: "Messages",
          icon: MessageCircle,
          badge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : undefined,
        },
        { to: "/familier", label: "Familiers", icon: Gift },
        { to: "/compte", label: "Compte", icon: Settings },
        { to: "/connexions", label: "Appareils", icon: ShieldCheck },
        {
          to: "/panier",
          label: "Panier",
          icon: ShoppingBag,
          badge: cartCount > 0 ? String(cartCount) : undefined,
        },
      ]
    : [];
  const mobileStaffLinks: MobileMenuLink[] =
    canAccessAdmin ? [{ to: "/admin", label: adminLabel, icon: ShieldCheck }] : [];
  const filteredNotifications = notifications.filter((notification) => {
    if (notificationFilter === "all") return true;
    if (notificationFilter === "mentions") {
      return notification.kind === "community_mention" || notification.kind === "live_mention";
    }
    if (notificationFilter === "community") {
      return notification.kind.startsWith("community_") || notification.kind === "official_event";
    }
    if (notificationFilter === "lives") {
      return notification.kind === "live_mention" || notification.entityType === "live";
    }
    if (notificationFilter === "staff") {
      return notification.kind === "admin_request" || notification.entityType === "admin_request";
    }
    return true;
  });

  const renderMobileMenuLink = (link: MobileMenuLink, tone: "default" | "staff" = "default") => {
    const Icon = link.icon;
    return (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.end}
        onClick={() => setOpen(false)}
        className={({ isActive }) =>
          clsx(
            "flex min-h-10 items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.99]",
            tone === "staff"
              ? isActive
                ? "border-gold-200/60 bg-gold-300/18 text-gold-50 shadow-[0_0_26px_rgba(250,204,21,0.16)]"
                : "border-gold-300/35 bg-gold-500/10 text-gold-100 hover:border-gold-200/60"
              : isActive
                ? "border-gold-300/40 bg-gold-500/14 text-gold-100"
                : "border-white/8 bg-white/[0.035] text-ivory/74 hover:border-white/16 hover:bg-white/[0.06] hover:text-ivory",
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
        {link.badge && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-shine px-1.5 text-[10px] font-bold text-night-950">
            {link.badge}
          </span>
        )}
      </NavLink>
    );
  };

  const openNotification = (notification: AppNotification) => {
    markRead(notification.id);
    setNotificationsOpen(false);
    setNotificationSettingsOpen(false);
    navigate(resolveNotificationUrl(notification), {
      state: {
        notificationId: notification.id,
      },
    });
  };

  const notificationIcon = (notification: AppNotification) => {
    if (notification.kind === "community_mention" || notification.kind === "live_mention") {
      return AtSign;
    }
    if (notification.kind === "community_like") return Heart;
    if (notification.kind === "community_comment") return MessageSquare;
    if (notification.kind === "admin_request") return ShieldCheck;
    if (notification.kind === "familiar_gift") return Gift;
    return Bell;
  };

  useEffect(() => {
    if (!notificationsOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const closeMenus = window.setTimeout(() => {
      setNotificationsOpen(false);
      setNotificationSettingsOpen(false);
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(closeMenus);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-royal-600/20 bg-night-900/80 backdrop-blur-xl">
        <div className="mx-auto flex items-center justify-between gap-2 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-4 sm:px-5 lg:px-8 lg:pt-3 xl:px-10">
          <Link to="/" className="group flex min-w-0 items-center gap-2">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold transition group-hover:scale-105">
              <Crown className="h-5 w-5" />
            </span>
            <span className="hidden font-display text-base font-bold text-gold-200 min-[360px]:inline sm:text-lg">
              Vaelyndra
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 px-2 lg:flex xl:gap-2.5 xl:px-4 2xl:gap-4 2xl:px-6">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx(
                    "whitespace-nowrap rounded-full px-2.5 py-1.5 font-regal text-[11px] font-semibold tracking-[0.2em] transition xl:px-3 2xl:px-4 2xl:py-2",
                    isActive
                      ? "bg-gold-500/15 text-gold-200 shadow-[inset_0_0_0_1px_rgba(230,194,116,0.4)]"
                      : "text-ivory/70 hover:bg-white/[0.03] hover:text-gold-200",
                  )
                }
                end={n.to === "/" || n.to === "/live"}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Link
              to={user ? "/live/studio" : "/connexion"}
              className="hidden items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-2 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 md:inline-flex lg:hidden 2xl:inline-flex"
              aria-label="Espace live streamer"
            >
              <Radio className="h-4 w-4" />
              Mon live
            </Link>
            {user && (
              <div className="relative">
                <button
                  onClick={() => {
                    setNotificationsOpen((value) => {
                      if (value) setNotificationSettingsOpen(false);
                      return !value;
                    });
                  }}
                  className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3 lg:w-10 lg:p-0 2xl:w-auto 2xl:px-3"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline lg:hidden 2xl:inline">Notifs</span>
                  {notificationUnreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-shine px-1 text-[10px] font-bold text-night-900">
                      {notificationUnreadCount > 99
                        ? "99+"
                        : notificationUnreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen &&
                  createPortal(
                    <div className="fixed inset-0 z-[100] flex bg-night-950 p-0 sm:items-start sm:justify-end sm:bg-night-950/35 sm:p-4">
                      <button
                        type="button"
                        className="absolute inset-0 hidden sm:block"
                        aria-label="Fermer les notifications"
                        onClick={() => {
                          setNotificationsOpen(false);
                          setNotificationSettingsOpen(false);
                        }}
                      />
                      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-night-900 sm:mt-12 sm:h-auto sm:max-h-[min(42rem,calc(100vh-6rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-2xl sm:border sm:border-royal-500/30 sm:bg-night-900/95 sm:shadow-2xl sm:shadow-night-950/60">
                        <div className="flex items-center justify-between gap-3 border-b border-royal-600/25 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:py-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-200">
                              Notifications
                            </p>
                            <p className="truncate text-[11px] text-ivory/55">
                              Likes, commentaires et identifications
                            </p>
                          </div>
                          <div className="flex flex-none items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setNotificationSettingsOpen((value) => !value)
                              }
                              className={clsx(
                                "rounded-full border p-2 transition",
                                notificationSettingsOpen
                                  ? "border-gold-400/60 bg-gold-500/10 text-gold-200"
                                  : "border-royal-500/30 text-ivory/70 hover:border-gold-400/60 hover:text-gold-200",
                              )}
                              aria-label="Réglages notifications"
                              aria-pressed={notificationSettingsOpen}
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={markAllRead}
                              className="rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:border-gold-400/60 hover:text-gold-200"
                              aria-label="Tout marquer comme lu"
                            >
                              <CheckCheck className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNotificationsOpen(false);
                                setNotificationSettingsOpen(false);
                              }}
                              className="rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:border-gold-400/60 hover:text-gold-200 sm:hidden"
                              aria-label="Fermer les notifications"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="border-b border-royal-600/20 px-4 py-2">
                          <div className="flex gap-1 overflow-x-auto pb-1">
                            {NOTIFICATION_FILTERS.map((filter) => (
                              <button
                                key={filter.id}
                                type="button"
                                onClick={() => setNotificationFilter(filter.id)}
                                className={clsx(
                                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                                  notificationFilter === filter.id
                                    ? "border-gold-300/60 bg-gold-500/15 text-gold-100"
                                    : "border-white/10 bg-white/[0.03] text-ivory/55 hover:border-white/20 hover:text-ivory",
                                )}
                              >
                                {filter.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                          {notifications.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center px-5 py-8 text-center">
                              <Bell className="mb-3 h-8 w-8 text-gold-200/60" />
                              <p className="text-sm font-semibold text-ivory/85">
                                Aucune notification pour le moment
                              </p>
                              <p className="mt-1 max-w-56 text-xs leading-relaxed text-ivory/55">
                                Les mentions, commentaires, lives et événements importants arriveront ici.
                              </p>
                            </div>
                          ) : filteredNotifications.length === 0 ? (
                            <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
                              <Bell className="mb-3 h-7 w-7 text-gold-200/45" />
                              <p className="text-sm font-semibold text-ivory/80">
                                Rien dans ce filtre
                              </p>
                              <p className="mt-1 max-w-56 text-xs leading-relaxed text-ivory/50">
                                Change de catégorie pour voir les autres notifications.
                              </p>
                            </div>
                          ) : (
                            filteredNotifications.slice(0, 20).map((notification) => {
                              const Icon = notificationIcon(notification);
                              const targetUrl = resolveNotificationUrl(notification);
                              return (
                              <div
                                key={notification.id}
                                className={clsx(
                                  "flex gap-3 border-b border-royal-600/15 px-4 py-3 transition last:border-b-0",
                                  notification.readAt
                                    ? "bg-transparent"
                                    : "bg-gold-500/10 shadow-[inset_3px_0_0_rgba(230,194,116,0.65)]",
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => openNotification(notification)}
                                  className="relative h-10 w-10 flex-none overflow-hidden rounded-full bg-night-800 text-left ring-1 ring-gold-400/25 transition hover:ring-gold-300/60"
                                >
                                  {notification.actorAvatar ? (
                                    <img
                                      src={notification.actorAvatar}
                                      alt={notification.actorName ?? "Notification"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center">
                                      <Icon className="h-4 w-4 text-gold-200/80" />
                                    </span>
                                  )}
                                  {notification.actorAvatar && (
                                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-night-950 ring-1 ring-gold-400/35">
                                      <Icon className="h-3 w-3 text-gold-200" />
                                    </span>
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => openNotification(notification)}
                                    className="block w-full text-left"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ivory">
                                        {notification.title}
                                      </p>
                                      {!notification.readAt && (
                                        <span className="mt-1 h-2 w-2 flex-none rounded-full bg-gold-300 shadow-[0_0_10px_rgba(230,194,116,0.75)]" />
                                      )}
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ivory/68">
                                      {notification.body}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-200/70">
                                      {notification.locationLabel && (
                                        <span className="max-w-full truncate rounded-full border border-gold-400/20 bg-gold-500/10 px-2 py-0.5">
                                          {notification.locationLabel}
                                        </span>
                                      )}
                                      <span>{formatRelative(notification.createdAt)}</span>
                                    </div>
                                  </button>
                                  {notification.actionUrl && (
                                    <Link
                                      to={notification.actionUrl}
                                      onClick={() => {
                                        markRead(notification.id);
                                        setNotificationsOpen(false);
                                        setNotificationSettingsOpen(false);
                                      }}
                                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 px-3 py-1 text-[11px] font-semibold text-gold-200 ring-1 ring-gold-400/30 transition hover:bg-gold-500/25"
                                    >
                                      <Gift className="h-3.5 w-3.5" />
                                      {notification.actionLabel ?? "Voir"}
                                    </Link>
                                  )}
                                  <p className="mt-1 truncate text-[10px] text-ivory/35">
                                    Ouvre : {targetUrl}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    clearNotification(notification.id)
                                  }
                                  className="self-start rounded-full p-1 text-ivory/45 transition hover:text-gold-200"
                                  aria-label="Supprimer la notification"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              );
                            })
                          )}
                        </div>

                        <div
                          className={clsx(
                            "flex-none border-t border-royal-600/25 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
                            notificationSettingsOpen
                              ? "space-y-2 py-3"
                              : "py-2",
                          )}
                        >
                          {!notificationSettingsOpen && (
                            <button
                              type="button"
                              onClick={() => setNotificationSettingsOpen(true)}
                              className="flex min-h-10 w-full items-center justify-between rounded-xl px-1 text-left text-xs text-ivory/65 transition hover:text-gold-200"
                            >
                              <span>Réglages notifications</span>
                              <Settings className="h-4 w-4" />
                            </button>
                          )}
                          {notificationSettingsOpen && (
                            <>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Dans l'app
                                <input
                                  type="checkbox"
                                  checked={preferences.inApp}
                                  onChange={(event) =>
                                    updatePreferences({
                                      inApp: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Likes communauté
                                <input
                                  type="checkbox"
                                  checked={preferences.communityLikes}
                                  onChange={(event) =>
                                    updatePreferences({
                                      communityLikes: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Commentaires
                                <input
                                  type="checkbox"
                                  checked={preferences.communityComments}
                                  onChange={(event) =>
                                    updatePreferences({
                                      communityComments: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Identifications
                                <input
                                  type="checkbox"
                                  checked={preferences.mentions}
                                  onChange={(event) =>
                                    updatePreferences({
                                      mentions: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Offrandes familier
                                <input
                                  type="checkbox"
                                  checked={preferences.familiarGifts}
                                  onChange={(event) =>
                                    updatePreferences({
                                      familiarGifts: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                                Vibration mobile
                                <input
                                  type="checkbox"
                                  checked={preferences.vibration}
                                  onChange={(event) =>
                                    updatePreferences({
                                      vibration: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-gold-400"
                                />
                              </label>
                              <div className="flex min-h-10 items-center justify-between gap-3 pt-1">
                                <span className="text-xs text-ivory/75">
                                  Notifications navigateur
                                </span>
                                {permission === "granted" ? (
                                  <input
                                    type="checkbox"
                                    checked={preferences.browser}
                                    onChange={(event) =>
                                      updatePreferences({
                                        browser: event.target.checked,
                                      })
                                    }
                                    className="h-4 w-4 accent-gold-400"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={requestBrowserPermission}
                                    className="rounded-full border border-gold-400/45 px-3 py-1 text-[11px] font-semibold text-gold-200 transition hover:bg-gold-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={permission === "unsupported"}
                                  >
                                    Activer
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
            )}
            {user && (
              <Link
                to="/messages"
                className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3 lg:w-10 lg:p-0 2xl:w-auto 2xl:px-3"
                aria-label="Messagerie privée"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline lg:hidden 2xl:inline">Messages</span>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-shine px-1 text-[10px] font-bold text-night-900">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <Link
              to="/panier"
              className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3 lg:w-10 lg:p-0 2xl:w-auto 2xl:px-3"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline lg:hidden 2xl:inline">Panier</span>
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-shine px-1 text-[10px] font-bold text-night-900">
                  {cartCount}
                </span>
              )}
            </Link>
            {user ? (
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                {canAccessAdmin && (
                  <Link
                    to="/admin"
                    className="hidden items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20 md:inline-flex lg:hidden 2xl:inline-flex"
                  >
                    <ShieldCheck className="h-4 w-4" /> {adminLabel}
                  </Link>
                )}
                <Link
                  to="/moi"
                  className="relative flex h-10 items-center gap-2 rounded-full border border-royal-500/30 bg-night-800/60 py-1 pl-1 pr-1 sm:pr-3 lg:pr-1 2xl:pr-3"
                  title={
                    backendMe?.totp_enabled
                      ? "Double authentification activée"
                      : backendMe
                        ? "Active la double authentification"
                        : undefined
                  }
                >
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-gold-400/60"
                  />
                  <span className="hidden text-xs font-medium text-ivory/90 sm:inline lg:hidden 2xl:inline">
                    {user.username}
                  </span>
                  {backendMe?.totp_enabled && (
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/90 ring-2 ring-night-900">
                      <ShieldCheck className="h-2.5 w-2.5 text-night-900" />
                    </span>
                  )}
                  {backendMe && !backendMe.totp_enabled && (
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 ring-2 ring-night-900">
                      <ShieldAlert className="h-2.5 w-2.5 text-night-900" />
                    </span>
                  )}
                </Link>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="hidden rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:text-gold-200 sm:inline-flex"
                  aria-label="Déconnexion"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/connexion"
                className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20"
              >
                <UserCircle2 className="h-4 w-4" />
                Entrer à la cour
              </Link>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-full border border-royal-500/30 p-2 text-ivory/70 lg:hidden"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open &&
          createPortal(
            <div className="fixed inset-0 z-[95] lg:hidden">
              <button
                type="button"
                aria-label="Fermer le menu"
                className="absolute inset-0 bg-night-950/45 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />
              <nav
                className="absolute right-3 top-[calc(4.35rem+env(safe-area-inset-top))] flex max-h-[calc(100dvh-5.35rem)] w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.55rem] border border-white/10 bg-night-950/94 shadow-[0_26px_90px_rgba(0,0,0,0.58)] backdrop-blur-2xl"
                aria-label="Menu mobile"
              >
                <div className="border-b border-white/8 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-gold-200/70">
                    Menu Vaelyndra
                  </p>
                  <p className="mt-1 truncate text-sm text-ivory/58">
                    {user ? user.username : "Navigation rapide"}
                  </p>
                </div>
                <div className="min-h-0 overflow-y-auto px-3 py-3">
                  <MobileMenuSection title="Principal">
                    {mobileMainLinks.map((link) => renderMobileMenuLink(link))}
                  </MobileMenuSection>

                  {user && (
                    <MobileMenuSection title="Compte">
                      {mobileAccountLinks.map((link) => renderMobileMenuLink(link))}
                    </MobileMenuSection>
                  )}

                  {mobileStaffLinks.length > 0 && (
                    <MobileMenuSection title="Staff">
                      {mobileStaffLinks.map((link) => renderMobileMenuLink(link, "staff"))}
                    </MobileMenuSection>
                  )}
                </div>
                {user && (
                  <div className="border-t border-white/8 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-sm font-semibold text-ivory/70 transition hover:border-rose-300/35 hover:bg-rose-500/10 hover:text-rose-100 active:scale-[0.99]"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Déconnexion</span>
                    </button>
                  </div>
                )}
              </nav>
            </div>,
            document.body,
          )}
      </div>
      <nav
        className="mobile-tabbar fixed inset-x-3 bottom-[calc(0.55rem+env(safe-area-inset-bottom))] z-50 grid grid-cols-5 rounded-[1.55rem] border border-white/10 bg-night-950/88 p-1.5 shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:hidden"
        aria-label="Navigation mobile principale"
      >
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(location.pathname);
          const target = tab.to === "/moi" && !user ? "/connexion" : tab.to;
          return (
            <Link
              key={tab.to}
              to={target}
              className={clsx(
                "flex min-h-[3.15rem] flex-col items-center justify-center gap-1 rounded-[1.15rem] text-[10px] font-semibold transition active:scale-95",
                active
                  ? "bg-gold-shine text-night-950 shadow-glow-gold"
                  : "text-ivory/62 hover:bg-white/5 hover:text-gold-100",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function MobileMenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 first:mt-0">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ivory/38">
        {title}
      </p>
      <div className="grid gap-1.5">{children}</div>
    </section>
  );
}
