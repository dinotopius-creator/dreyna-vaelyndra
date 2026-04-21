/**
 * Modal "Liens d'âme" — liste des âmes liées à un profil (followers) ou
 * des liens tissés par ce profil (following).
 *
 * Sert à la fois pour la page /u/:id et /moi : on passe le user_id cible et
 * l'onglet initial, la modal fetch à l'ouverture et affiche la liste.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, Users } from "lucide-react";
import {
  apiListFollowers,
  apiListFollowing,
  type FollowerDto,
} from "../lib/api";
import { CreatureBadge, RoleBadge } from "./UserBadges";

type Tab = "followers" | "following";

interface Props {
  userId: string;
  username: string;
  open: boolean;
  initialTab: Tab;
  onClose: () => void;
}

export default function SoulBondsModal({
  userId,
  username,
  open,
  initialTab,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<FollowerDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setError(null);
    const fetcher = tab === "followers" ? apiListFollowers : apiListFollowing;
    fetcher(userId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les liens d'âme.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, userId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Liens d'âme"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            className="w-full max-w-md rounded-2xl border border-gold-400/30 bg-night-900/95 shadow-glow"
          >
            <header className="flex items-center justify-between border-b border-ivory/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gold-300" />
                <h2 className="font-display text-lg text-gold-100">
                  Liens d'âme · {username}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1 text-ivory/60 transition hover:bg-night-800 hover:text-ivory"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex gap-2 border-b border-ivory/10 px-5 py-2">
              <TabButton
                active={tab === "followers"}
                onClick={() => setTab("followers")}
              >
                Âmes liées
              </TabButton>
              <TabButton
                active={tab === "following"}
                onClick={() => setTab("following")}
              >
                Liens tissés
              </TabButton>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-2 py-3">
              {items === null && !error && (
                <div className="flex items-center justify-center py-8 text-ivory/60">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {error && (
                <p className="px-4 py-6 text-center text-sm text-rose-300">
                  {error}
                </p>
              )}
              {items && items.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-ivory/60">
                  {tab === "followers"
                    ? "Aucune âme liée pour l'instant."
                    : "Aucun lien tissé pour l'instant."}
                </p>
              )}
              {items && items.length > 0 && (
                <ul className="space-y-1">
                  {items.map((u) => (
                    <li key={u.id}>
                      <Link
                        to={`/u/${encodeURIComponent(u.id)}`}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-night-800/70"
                      >
                        <img
                          src={u.avatarImageUrl}
                          alt={u.username}
                          className="h-9 w-9 rounded-full border border-gold-400/30 bg-night-800 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-regal text-sm text-ivory">
                            {u.username}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {u.creature && (
                              <CreatureBadge
                                creatureId={u.creature.id}
                                size="sm"
                              />
                            )}
                            {u.role === "animator" && (
                              <RoleBadge role={u.role} size="sm" />
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-regal tracking-wide transition ${
        active
          ? "bg-gold-500/20 text-gold-100"
          : "text-ivory/60 hover:bg-night-800 hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}
