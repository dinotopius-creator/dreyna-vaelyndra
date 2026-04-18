import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import {
  Crown,
  Menu,
  ShoppingBag,
  Radio,
  LogOut,
  UserCircle2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

const NAV = [
  { to: "/", label: "Royaume" },
  { to: "/blog", label: "Chroniques" },
  { to: "/boutique", label: "Boutique" },
  { to: "/live", label: "Lives" },
  { to: "/communaute", label: "Communauté" },
  { to: "/dreyna", label: "La Reine" },
];

export function Navbar() {
  const { user, isQueen, logout } = useAuth();
  const { cartCount, isLiveOn } = useStore();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-royal-600/20 bg-night-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="group flex items-center gap-2">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold transition group-hover:scale-105">
              <Crown className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold text-gold-200">
              Vaelyndra
            </span>
            {isLiveOn && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-rose-300">
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
                end={n.to === "/"}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] transition",
                    isActive
                      ? "bg-gold-500/15 text-gold-200 shadow-[inset_0_0_0_1px_rgba(230,194,116,0.4)]"
                      : "text-ivory/70 hover:text-gold-200",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/live"
              className="hidden items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-2 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200 md:inline-flex"
              aria-label="Lives"
            >
              <Radio className="h-4 w-4" />
              Lives
            </Link>
            <Link
              to="/panier"
              className="relative inline-flex items-center gap-1.5 rounded-full border border-royal-500/30 px-3 py-2 text-xs text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200"
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
              <div className="flex items-center gap-2">
                {isQueen && (
                  <Link
                    to="/admin"
                    className="hidden items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20 md:inline-flex"
                  >
                    <ShieldCheck className="h-4 w-4" /> Salle du Trône
                  </Link>
                )}
                <Link
                  to="/moi"
                  className="flex items-center gap-2 rounded-full border border-royal-500/30 bg-night-800/60 py-1 pl-1 pr-3"
                >
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-gold-400/60"
                  />
                  <span className="hidden text-xs font-medium text-ivory/90 sm:inline">
                    {user.username}
                  </span>
                </Link>
                <button
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  className="rounded-full border border-royal-500/30 p-2 text-ivory/70 transition hover:text-gold-200"
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
                end={n.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "rounded-xl px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em]",
                    isActive
                      ? "bg-gold-500/15 text-gold-200"
                      : "text-ivory/70",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
            {isQueen && (
              <NavLink
                to="/admin"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-4 py-3 font-regal text-xs font-semibold tracking-[0.22em] text-gold-200"
              >
                Salle du Trône
              </NavLink>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
