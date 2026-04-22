import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useMessages } from "../contexts/MessagesContext";
import { useNotifications } from "../contexts/NotificationsContext";
import {
  Bell,
  Crown,
  CheckCheck,
  Menu,
  MessageCircle,
  ShoppingBag,
  Radio,
  LogOut,
  UserCircle2,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";

const NAV = [
  { to: "/", label: "Royaume" },
  { to: "/blog", label: "Chroniques" },
  { to: "/boutique", label: "Boutique" },
  { to: "/live", label: "Live" },
  { to: "/communaute", label: "Communauté" },
];

export function Navbar() {
  const { user, isQueen, logout, backendMe } = useAuth();
  const { cartCount, isLiveOn } = useStore();
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
  const navigate = useNavigate();
  const canAccessAdmin =
    isQueen || backendMe?.role === "admin" || backendMe?.role === "animator";
  const adminLabel =
    backendMe?.role === "animator" ? "Chroniques" : "Salle du Trone";

  useEffect(() => {
    if (!notificationsOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-royal-600/20 bg-night-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-5">
          <Link to="/" className="group flex min-w-0 items-center gap-2">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold transition group-hover:scale-105">
              <Crown className="h-5 w-5" />
            </span>
            <span className="hidden font-display text-lg font-bold text-gold-200 sm:inline">
              Vaelyndra
            </span>
            {isLiveOn && (
              <span className="ml-1 hidden items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-rose-300 sm:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                Live
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] transition",
                    isActive
                      ? "bg-gold-500/15 text-gold-200 shadow-[inset_0_0_0_1px_rgba(230,194,116,0.4)]"
                      : "text-ivory/70 hover:text-gold-200",
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
              className="hidden items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-2 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 md:inline-flex"
              aria-label="Espace live streamer"
            >
              <Radio className="h-4 w-4" />
              Mon live
            </Link>
            {user && (
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen((value) => !value)}
                  className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Notifs</span>
                  {notificationUnreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-shine px-1 text-[10px] font-bold text-night-900">
                      {notificationUnreadCount > 99
                        ? "99+"
                        : notificationUnreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="fixed inset-0 z-50 flex items-end bg-night-950/70 p-0 backdrop-blur-sm sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:block sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
                    <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-royal-500/30 bg-night-900/98 shadow-2xl shadow-night-950/60 backdrop-blur-xl sm:max-h-[min(42rem,calc(100vh-6rem))] sm:w-[min(22rem,calc(100vw-2rem))] sm:rounded-2xl">
                      <div className="flex items-center justify-between gap-3 border-b border-royal-600/25 px-4 py-3">
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
                            onClick={markAllRead}
                            className="rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:border-gold-400/60 hover:text-gold-200"
                            aria-label="Tout marquer comme lu"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setNotificationsOpen(false)}
                            className="rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:border-gold-400/60 hover:text-gold-200 sm:hidden"
                            aria-label="Fermer les notifications"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        {notifications.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-ivory/60">
                            Aucune notification pour le moment.
                          </p>
                        ) : (
                          notifications.slice(0, 12).map((notification) => (
                            <div
                              key={notification.id}
                              className={clsx(
                                "flex gap-3 border-b border-royal-600/15 px-4 py-3 last:border-b-0",
                                notification.readAt
                                  ? "bg-transparent"
                                  : "bg-gold-500/10",
                              )}
                            >
                              <img
                                src={notification.actorAvatar || "/vite.svg"}
                                alt=""
                                className="h-9 w-9 flex-none rounded-full object-cover ring-1 ring-gold-400/40"
                              />
                              <div className="min-w-0 flex-1">
                                <Link
                                  to={notification.url ?? "/communaute"}
                                  onClick={() => {
                                    markRead(notification.id);
                                    setNotificationsOpen(false);
                                  }}
                                  className="block"
                                >
                                  <p className="truncate text-sm font-semibold text-ivory">
                                    {notification.title}
                                  </p>
                                  <p className="line-clamp-2 text-xs text-ivory/65">
                                    {notification.body}
                                  </p>
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-gold-200/70">
                                    {new Date(
                                      notification.createdAt,
                                    ).toLocaleDateString("fr-FR", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </Link>
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
                          ))
                        )}
                      </div>

                      <div className="flex-none space-y-2 border-t border-royal-600/25 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                          Dans l'app
                          <input
                            type="checkbox"
                            checked={preferences.inApp}
                            onChange={(event) =>
                              updatePreferences({ inApp: event.target.checked })
                            }
                            className="h-4 w-4 accent-gold-400"
                          />
                        </label>
                        <label className="flex min-h-10 items-center justify-between gap-3 text-xs text-ivory/75">
                          Likes communaute
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
                        <div className="flex min-h-10 items-center justify-between gap-3 pt-1">
                          <span className="text-xs text-ivory/75">
                            Notifications PC/tel
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
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {user && (
              <Link
                to="/messages"
                className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3"
                aria-label="Messagerie privée"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Messages</span>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-shine px-1 text-[10px] font-bold text-night-900">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <Link
              to="/panier"
              className="relative inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-full border border-royal-500/30 p-0 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 sm:w-auto sm:px-3"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Panier</span>
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
                    className="hidden items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20 md:inline-flex"
                  >
                    <ShieldCheck className="h-4 w-4" /> {adminLabel}
                  </Link>
                )}
                <Link
                  to="/moi"
                  className="relative flex h-10 items-center gap-2 rounded-full border border-royal-500/30 bg-night-800/60 py-1 pl-1 pr-1 sm:pr-3"
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
                  <span className="hidden text-xs font-medium text-ivory/90 sm:inline">
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
        {open && (
          <nav className="mx-auto grid max-w-7xl gap-1 border-t border-royal-600/20 px-5 py-4 lg:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/" || n.to === "/live"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "rounded-xl px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em]",
                    isActive ? "bg-gold-500/15 text-gold-200" : "text-ivory/70",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
            {user && (
              <>
                <NavLink
                  to="/live/studio"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-royal-500/30 px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em] text-ivory/80"
                >
                  Mon live
                </NavLink>
                <NavLink
                  to="/compte"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-royal-500/30 px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em] text-ivory/80"
                >
                  Mon compte
                </NavLink>
                <NavLink
                  to="/connexions"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-royal-500/30 px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em] text-ivory/80"
                >
                  Historique & appareils
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    logout();
                    navigate("/");
                  }}
                  className="rounded-xl border border-royal-500/30 px-4 py-3 text-left font-regal text-xs font-semibold tracking-[0.22em] text-ivory/80"
                >
                  Deconnexion
                </button>
              </>
            )}
            {canAccessAdmin && (
              <NavLink
                to="/admin"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em] text-gold-200"
              >
                {adminLabel}
              </NavLink>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
