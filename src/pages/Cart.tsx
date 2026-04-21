import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "../contexts/StoreContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { formatPrice, generateId } from "../lib/helpers";
import { apiCreateSylvinsCheckout } from "../lib/stripeApi";
import { useState } from "react";

export function Cart() {
  const { cart, products, cartTotal, dispatch } = useStore();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);

  const lines = cart.map((c) => {
    const product = products.find((p) => p.id === c.productId);
    return { ...c, product };
  });

  /**
   * Packs de Sylvins dans le panier (paiement réel via Stripe).
   * Les autres catégories (Merch, Digital, VIP, Exclusif) restent sur le
   * chemin historique "sceller la commande en simulé" le temps qu'on
   * bâtisse un flux multi-line-item côté Stripe.
   */
  const sylvinsInCart = cart.filter((c) => {
    const p = products.find((pp) => pp.id === c.productId);
    return p?.category === "Sylvins" && (p?.sylvins ?? 0) > 0;
  });
  const otherInCart = cart.filter((c) => {
    const p = products.find((pp) => pp.id === c.productId);
    return !(p?.category === "Sylvins");
  });

  async function checkoutStripeSylvinsSingle(productId: string) {
    try {
      const out = await apiCreateSylvinsCheckout(productId);
      // Redirection complete vers Stripe Checkout (Stripe-hosted).
      window.location.href = out.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Paiement impossible : ${msg}`, "error");
      setProcessing(false);
    }
  }

  async function checkout() {
    if (!user) {
      notify("Connectez-vous pour finaliser votre commande.", "info");
      navigate("/connexion", { state: { from: "/panier" } });
      return;
    }

    // Si le panier contient au moins un pack Sylvins, on passe par Stripe.
    // MVP : un seul pack Sylvins à la fois (le plus coûteux si plusieurs).
    // Les autres items restent en panier après le retour du paiement.
    if (sylvinsInCart.length > 0) {
      // On redirige sur le pack le plus cher du panier (ordre décidable
      // par l'utilisateur : il peut virer les autres s'il ne veut pas
      // celui-là).
      const firstSylvin = sylvinsInCart[0];
      if (otherInCart.length > 0) {
        notify(
          "Stripe ne gère pour l'instant qu'un pack Sylvins à la fois. " +
            "Les autres objets restent dans ton panier.",
          "info",
        );
      }
      setProcessing(true);
      await checkoutStripeSylvinsSingle(firstSylvin.productId);
      return;
    }

    setProcessing(true);
    setTimeout(() => {
      // Total des Sylvins à créditer au wallet du membre pour les packs de
      // monnaie virtuelle présents dans le panier.
      let sylvinsGained = 0;
      for (const c of cart) {
        const prod = products.find((p) => p.id === c.productId);
        if (prod?.category === "Sylvins" && prod.sylvins) {
          sylvinsGained += prod.sylvins * c.quantity;
        }
      }
      dispatch({
        type: "checkout",
        order: {
          id: generateId("order"),
          userId: user.id,
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            priceAtPurchase:
              products.find((p) => p.id === c.productId)?.price ?? 0,
          })),
          total: cartTotal,
          createdAt: new Date().toISOString(),
          status: "paid",
        },
      });
      if (sylvinsGained > 0) {
        dispatch({
          type: "creditSylvins",
          userId: user.id,
          amount: sylvinsGained,
        });
      }
      notify(
        sylvinsGained > 0
          ? `✨ Commande scellée — ${sylvinsGained.toLocaleString("fr-FR")} Sylvins crédités !`
          : "✨ Paiement simulé — votre commande est scellée !",
      );
      setProcessing(false);
    }, 1200);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading
        eyebrow="Votre panier royal"
        title={<>Objets sacrés à emporter</>}
        align="left"
      />

      {lines.length === 0 ? (
        <div className="card-royal mt-10 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-gold-300" />
          <p className="mt-4 text-ivory/70">
            Votre panier est vide — la boutique vous attend.
          </p>
          <Link to="/boutique" className="btn-gold mt-6">
            Voir la boutique
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr,340px]">
          <ul className="space-y-4">
            {lines.map((l) =>
              !l.product ? null : (
                <li
                  key={l.productId}
                  className="card-royal flex gap-4 overflow-hidden p-4"
                >
                  <img
                    src={l.product.image}
                    alt={l.product.name}
                    className="h-28 w-28 rounded-xl object-cover"
                  />
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                          {l.product.tagline}
                        </p>
                        <h3 className="font-display text-lg text-gold-200">
                          {l.product.name}
                        </h3>
                      </div>
                      <button
                        onClick={() =>
                          dispatch({
                            type: "removeFromCart",
                            productId: l.productId,
                          })
                        }
                        className="text-ivory/50 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-2 py-1">
                        <button
                          onClick={() =>
                            dispatch({
                              type: "updateCartQty",
                              productId: l.productId,
                              quantity: l.quantity - 1,
                            })
                          }
                          className="rounded-full p-1 text-ivory/70 hover:text-gold-200"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-6 text-center text-sm">
                          {l.quantity}
                        </span>
                        <button
                          onClick={() =>
                            dispatch({
                              type: "updateCartQty",
                              productId: l.productId,
                              quantity: l.quantity + 1,
                            })
                          }
                          className="rounded-full p-1 text-ivory/70 hover:text-gold-200"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="font-display text-lg text-ivory">
                        {formatPrice(l.product.price * l.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>

          <aside className="card-royal h-fit p-6">
            <h3 className="font-display text-xl text-gold-200">Récapitulatif</h3>
            <div className="mt-4 space-y-2 text-sm text-ivory/75">
              <div className="flex justify-between">
                <span>Sous-total</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Livraison magique</span>
                <span className="text-gold-300">Offerte</span>
              </div>
            </div>
            <div className="mt-4 flex justify-between border-t border-royal-500/30 pt-4 font-display text-lg text-gold-200">
              <span>Total</span>
              <span>{formatPrice(cartTotal)}</span>
            </div>
            <button
              onClick={checkout}
              disabled={processing}
              className="btn-gold mt-6 w-full justify-center disabled:opacity-60"
            >
              {processing
                ? "Sortilège en cours..."
                : sylvinsInCart.length > 0
                  ? "Payer par carte (Stripe)"
                  : "Payer (simulé)"}
            </button>
            <p className="mt-3 text-center text-xs text-ivory/40">
              {sylvinsInCart.length > 0
                ? "Paiement sécurisé via Stripe. Les Sylvins sont crédités sur ton compte après confirmation."
                : "Paiement simulé. Prêt à brancher Stripe en production."}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
