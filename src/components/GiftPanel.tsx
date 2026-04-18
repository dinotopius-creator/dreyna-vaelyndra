import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift as GiftIcon, Plus, ShieldAlert, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatSylvins } from "../lib/sylvins";
import type { Gift, GiftRarity } from "../types";

interface Props {
  /** ID du streamer qui reçoit les cadeaux. */
  hostId: string;
  /** Pseudo affiché pour le streamer. */
  hostName: string;
  /**
   * Callback visuel (facultatif) déclenché quand un cadeau part — utilisé
   * pour animer une envolée sur la scène live.
   */
  onGiftSent?: (gift: Gift) => void;
}

const RARITY_STYLES: Record<
  GiftRarity,
  { ring: string; label: string; bg: string }
> = {
  commun: {
    ring: "ring-amber-700/60",
    label: "text-amber-200/80",
    bg: "from-amber-900/30",
  },
  rare: {
    ring: "ring-slate-300/60",
    label: "text-slate-100/80",
    bg: "from-slate-500/25",
  },
  epique: {
    ring: "ring-emerald-400/60",
    label: "text-emerald-200/80",
    bg: "from-emerald-800/30",
  },
  legendaire: {
    ring: "ring-indigo-400/60",
    label: "text-indigo-200/80",
    bg: "from-indigo-900/30",
  },
  mythique: {
    ring: "ring-gold-400/70",
    label: "text-gold-200",
    bg: "from-gold-700/40",
  },
};

export function GiftPanel({ hostId, hostName, onGiftSent }: Props) {
  const { gifts, myWallet, dispatch } = useStore();
  const { user } = useAuth();
  const { notify } = useToast();
  const [selected, setSelected] = useState<Gift | null>(null);

  const sorted = useMemo(
    () => [...gifts].sort((a, b) => a.price - b.price),
    [gifts],
  );

  const canSend = !!user && user.id !== hostId;

  function send(gift: Gift) {
    if (!user) {
      notify("Connectez-vous pour offrir un cadeau.", "info");
      return;
    }
    if (user.id === hostId) {
      notify("Vous ne pouvez pas vous offrir vos propres cadeaux.", "info");
      return;
    }
    if (myWallet.balance < gift.price) {
      notify(
        "Solde insuffisant — rechargez vos Sylvins dans la boutique.",
        "info",
      );
      return;
    }
    dispatch({
      type: "sendGift",
      gift,
      fromId: user.id,
      fromName: user.username,
      fromAvatar: user.avatar,
      toId: hostId,
      toName: hostName,
    });
    setSelected(null);
    onGiftSent?.(gift);
    notify(`${gift.name} envoyé à ${hostName} ✨`, "success");
  }

  return (
    <section className="card-royal p-5 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <GiftIcon className="h-4 w-4 text-gold-300" />
        <h3 className="font-display text-lg text-gold-200">
          Offrir des cadeaux à {hostName}
        </h3>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-gold-400/40 bg-night-900/50 px-3 py-1">
            <img
              src="/sylvin-coin-icon.png"
              alt="Sylvin"
              className="h-4 w-4"
            />
            <span className="font-display text-sm text-gold-200">
              {formatSylvins(myWallet.balance)} Sylvins
            </span>
          </div>
          <Link
            to="/boutique"
            className="btn-royal text-xs"
            title="Acheter des Sylvins"
          >
            <Plus className="h-3 w-3" /> Recharger
          </Link>
        </div>
      </header>

      {!user && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-royal-500/30 bg-night-900/40 p-3 text-xs text-ivory/60">
          <ShieldAlert className="h-4 w-4 text-gold-300" />
          Connectez-vous pour offrir des cadeaux pendant le live.
        </p>
      )}

      {user?.id === hostId && (
        <p className="mt-3 rounded-lg border border-royal-500/30 bg-night-900/40 p-3 text-xs text-ivory/60">
          Vous ne pouvez pas vous offrir de cadeaux — mais les viewers, si ✨
        </p>
      )}

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {sorted.map((g) => {
          const style = RARITY_STYLES[g.rarity];
          const insufficient = !!user && myWallet.balance < g.price;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSelected(g)}
                disabled={!canSend}
                className={`group relative flex w-full flex-col items-center rounded-xl border border-royal-500/30 bg-gradient-to-b ${style.bg} to-night-900/60 p-3 text-center transition hover:border-gold-400/50 disabled:cursor-not-allowed disabled:opacity-60`}
                title={g.description}
              >
                <img
                  src={g.icon}
                  alt={g.name}
                  className={`h-16 w-16 rounded-full ring-2 ${style.ring} transition group-hover:scale-105`}
                />
                <p className={`mt-2 font-regal text-[9px] uppercase tracking-[0.22em] ${style.label}`}>
                  {g.rarity}
                </p>
                <p className="mt-1 font-display text-[13px] leading-tight text-gold-200">
                  {g.name}
                </p>
                <p className={`mt-1 inline-flex items-center gap-1 text-xs ${insufficient ? "text-rose-300" : "text-ivory/70"}`}>
                  <Coins className="h-3 w-3 text-gold-300" />
                  {formatSylvins(g.price)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/80 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-royal w-full max-w-sm p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selected.icon}
                alt={selected.name}
                className={`mx-auto h-28 w-28 rounded-full ring-4 ${RARITY_STYLES[selected.rarity].ring}`}
              />
              <p className={`mt-3 font-regal text-[10px] uppercase tracking-[0.22em] ${RARITY_STYLES[selected.rarity].label}`}>
                {selected.rarity}
              </p>
              <h4 className="mt-1 font-display text-2xl text-gold-200">
                {selected.name}
              </h4>
              <p className="mt-2 text-sm text-ivory/70">
                {selected.description}
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-night-900/50 px-4 py-1.5 font-display text-gold-200">
                <Coins className="h-4 w-4 text-gold-300" />
                {formatSylvins(selected.price)} Sylvins
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn-royal"
                  onClick={() => setSelected(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-gold"
                  onClick={() => send(selected)}
                  disabled={myWallet.balance < selected.price}
                >
                  Offrir à {hostName}
                </button>
              </div>
              {myWallet.balance < selected.price && (
                <p className="mt-3 text-xs text-rose-300">
                  Il vous manque{" "}
                  {formatSylvins(selected.price - myWallet.balance)} Sylvins —{" "}
                  <Link to="/boutique" className="underline">
                    recharger
                  </Link>
                  .
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
