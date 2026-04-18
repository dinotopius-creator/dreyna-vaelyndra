import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

const CONSENT_KEY = "vaelyndra_cookie_consent_v1";

/**
 * Bandeau discret de première visite. Tant que le Royaume n'utilise que des
 * traceurs strictement nécessaires (session, panier, préférences), un
 * consentement explicite n'est pas légalement requis — on affiche quand
 * même un bandeau informatif pour la transparence. Le "ok" est mémorisé
 * dans le localStorage pour ne jamais ré-afficher le bandeau au même
 * visiteur.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) setVisible(true);
    } catch {
      // localStorage peut être indisponible (Safari private, SSR) : on
      // n'affiche rien plutôt que de bloquer le rendu.
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ accepted: true, at: new Date().toISOString() }),
      );
    } catch {
      // ignore — on masque quand même le bandeau pour la session en cours.
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-live="polite"
          aria-label="Information sur les cookies"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-gold-400/30 bg-night-900/90 p-4 text-sm shadow-2xl backdrop-blur md:inset-x-auto md:right-6 md:bottom-6 md:left-auto"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-gold-shine text-night-900">
              <Cookie className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="font-display text-gold-200">
                Un parchemin pour se souvenir de toi
              </p>
              <p className="mt-1 text-ivory/75">
                Vaelyndra garde en mémoire locale ta session, tes préférences
                et ton panier, pour que l'expérience reste fluide. Aucun
                cookie de mesure d'audience ni de publicité n'est déposé. Plus
                de détails dans notre{" "}
                <Link
                  to="/cookies"
                  className="text-gold-300 underline underline-offset-4 hover:text-gold-200"
                >
                  politique de cookies
                </Link>
                .
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={accept} className="btn-gold">
                  J'ai compris
                </button>
                <Link to="/cookies" className="btn-ghost">
                  En savoir plus
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={accept}
              aria-label="Fermer"
              className="rounded-full p-1 text-ivory/60 hover:text-gold-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
