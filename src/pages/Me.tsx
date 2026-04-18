import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Heart, Save, ShoppingBag } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { formatDate, formatPrice } from "../lib/helpers";

export function Me() {
  const { user, updateBio } = useAuth();
  const { articles, orders, products } = useStore();
  const { notify } = useToast();
  const [bio, setBio] = useState(user?.bio ?? "");

  if (!user) return null;

  const myLikes = articles.filter((a) => a.likes.includes(user.id));
  const myComments = articles
    .flatMap((a) =>
      a.comments
        .filter((c) => c.authorId === user.id)
        .map((c) => ({ article: a, comment: c })),
    )
    .slice(0, 6);
  const myOrders = orders.filter((o) => o.userId === user.id);

  function saveBio(e: React.FormEvent) {
    e.preventDefault();
    updateBio(bio);
    notify("Votre biographie est inscrite aux archives ✨");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal relative overflow-hidden p-8 md:p-10"
      >
        <div className="flex flex-wrap items-center gap-6">
          <img
            src={user.avatar}
            alt={user.username}
            className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50"
          />
          <div className="flex-1">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              {user.role === "queen"
                ? "Reine de Vaelyndra"
                : user.role === "knight"
                  ? "Chevalier·e lunaire"
                  : "Elfe de la cour"}
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-200 md:text-4xl">
              {user.username}
            </h1>
            <p className="mt-1 text-sm text-ivory/60">
              Entré·e à la cour le {formatDate(user.joinedAt)}
            </p>
          </div>
          {user.role === "queen" && (
            <span className="rounded-full border border-gold-400/50 bg-gold-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-gold-200">
              <Crown className="mr-1 inline h-3 w-3" /> Trône
            </span>
          )}
        </div>
        <form onSubmit={saveBio} className="mt-6 space-y-3">
          <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
            Biographie
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="glass-input resize-none"
            placeholder="Parlez de votre place dans Vaelyndra..."
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-ghost">
              <Save className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </form>
      </motion.header>

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Activité"
          title="Votre place dans la cour"
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card-royal p-5">
            <Heart className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myLikes.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              chroniques aimées
            </p>
          </div>
          <div className="card-royal p-5">
            <ShoppingBag className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myOrders.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              commandes royales
            </p>
          </div>
          <div className="card-royal p-5">
            <Crown className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myComments.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              paroles au grimoire
            </p>
          </div>
        </div>
      </section>

      {myOrders.length > 0 && (
        <section className="mt-12">
          <SectionHeading
            align="left"
            eyebrow="Commandes"
            title="Vos trésors scellés"
          />
          <ul className="mt-6 space-y-3">
            {myOrders.map((o) => (
              <li key={o.id} className="card-royal p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ivory/75">
                    Commande{" "}
                    <span className="text-gold-300">#{o.id.slice(-6)}</span> ·{" "}
                    {formatDate(o.createdAt)}
                  </p>
                  <span className="rounded-full border border-gold-400/50 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-200">
                    {o.status === "paid" ? "Scellée" : o.status}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {o.items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    return (
                      <li
                        key={it.productId}
                        className="flex justify-between text-ivory/75"
                      >
                        <span>
                          {p?.name ?? "Article"} × {it.quantity}
                        </span>
                        <span>{formatPrice(it.priceAtPurchase * it.quantity)}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex justify-between border-t border-royal-500/30 pt-3 text-sm">
                  <span className="text-ivory/60">Total</span>
                  <span className="font-display text-gold-200">
                    {formatPrice(o.total)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
