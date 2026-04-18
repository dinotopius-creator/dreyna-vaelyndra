import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, Sparkles, Star } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { formatPrice } from "../lib/helpers";
import clsx from "clsx";
import type { Product } from "../types";

type CategoryFilter = "Tous" | Product["category"];
const CATEGORIES: CategoryFilter[] = [
  "Tous",
  "Sylvins",
  "Merch",
  "Digital",
  "VIP",
  "Exclusif",
];

export function Shop() {
  const { products, dispatch, cartCount, cartTotal } = useStore();
  const { notify } = useToast();
  const [category, setCategory] = useState<CategoryFilter>("Tous");

  const filtered = useMemo(() => {
    return products.filter(
      (p) => category === "Tous" || p.category === category,
    );
  }, [products, category]);

  const featured = products.find((p) => p.featured);

  function addToCart(p: Product) {
    dispatch({ type: "addToCart", productId: p.id });
    notify(`${p.name} ajouté à votre panier royal`);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <SectionHeading
        eyebrow="Boutique Royale"
        title={<>Les trésors de <span className="text-mystic">Vaelyndra</span></>}
        subtitle="Merch fantasy, drops ZEPETO, accès VIP et objets sacrés. Stock limité."
      />

      {featured && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card-royal mt-10 grid gap-8 overflow-hidden p-0 md:grid-cols-2"
        >
          <div className="relative aspect-square md:aspect-auto">
            <img
              src={featured.image}
              alt={featured.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-transparent to-transparent md:bg-gradient-to-r" />
          </div>
          <div className="flex flex-col justify-center p-8 md:p-12">
            <span className="tag-gold">
              <Sparkles className="h-3 w-3" /> Mis en avant
            </span>
            <h3 className="heading-gold mt-4 text-3xl md:text-5xl">
              {featured.name}
            </h3>
            <p className="mt-2 font-regal text-[11px] tracking-[0.22em] text-ivory/60">
              {featured.tagline}
            </p>
            <p className="mt-5 text-ivory/80">{featured.description}</p>
            <div className="mt-6 flex items-center justify-between">
              <span className="font-display text-3xl text-ivory">
                {formatPrice(featured.price, featured.currency)}
              </span>
              <button onClick={() => addToCart(featured)} className="btn-gold">
                <ShoppingBag className="h-4 w-4" /> Ajouter
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={clsx(
                "rounded-full border px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em]",
                category === c
                  ? "border-gold-400/70 bg-gold-500/15 text-gold-200"
                  : "border-royal-500/30 text-ivory/70 hover:border-gold-400/40 hover:text-gold-200",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {cartCount > 0 && (
          <Link to="/panier" className="btn-royal">
            <ShoppingBag className="h-4 w-4" /> {cartCount} article
            {cartCount > 1 ? "s" : ""} · {formatPrice(cartTotal)}
          </Link>
        )}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="card-royal group flex flex-col overflow-hidden"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <img
                src={p.image}
                alt={p.name}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-900 via-transparent to-transparent" />
              <span className="absolute left-4 top-4 tag">{p.category}</span>
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-night-900/70 px-2 py-1 text-xs text-gold-300 backdrop-blur">
                <Star className="h-3 w-3 fill-gold-300 text-gold-300" />
                {p.rating.toFixed(1)}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                {p.tagline}
              </p>
              <h3 className="mt-1 font-display text-lg text-gold-200">
                {p.name}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm text-ivory/65">
                {p.description}
              </p>
              <div className="mt-auto flex items-center justify-between pt-5">
                <span className="font-display text-xl text-ivory">
                  {formatPrice(p.price, p.currency)}
                </span>
                <button onClick={() => addToCart(p)} className="btn-ghost">
                  <ShoppingBag className="h-3.5 w-3.5" /> Ajouter
                </button>
              </div>
              {p.stock < 20 && (
                <p className="mt-3 text-xs text-rose-300/80">
                  Plus que {p.stock} exemplaire{p.stock > 1 ? "s" : ""} dans les archives
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
