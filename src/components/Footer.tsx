import { Link } from "react-router-dom";
import { Crown, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-royal-600/20 bg-night-900/60 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-center sm:px-6 md:grid-cols-3 md:gap-10 md:py-14 md:text-left">
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 md:justify-start">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900">
              <Crown className="h-5 w-5" />
            </span>
            <span className="font-display text-lg text-gold-200">
              Vaelyndra
            </span>
          </div>
          <p className="text-sm text-ivory/70">
            Mini-reseau social magique. Streamers, createurs, ames connectees
            : chacun peut percer, chacun peut briller.
          </p>
        </div>

        <div>
          <p className="font-regal text-[11px] text-gold-300">Le Royaume</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li>
              <Link to="/" className="hover:text-gold-200">
                Accueil
              </Link>
            </li>
            <li>
              <Link to="/blog" className="hover:text-gold-200">
                Chroniques
              </Link>
            </li>
            <li>
              <Link to="/boutique" className="hover:text-gold-200">
                Boutique
              </Link>
            </li>
            <li>
              <Link to="/live" className="hover:text-gold-200">
                Live
              </Link>
            </li>
            <li>
              <Link to="/mondes" className="hover:text-gold-200">
                Mondes
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-regal text-[11px] text-gold-300">La Cour</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li>
              <Link to="/communaute" className="hover:text-gold-200">
                Communaute
              </Link>
            </li>
            <li>
              <Link to="/connexion" className="hover:text-gold-200">
                Connexion
              </Link>
            </li>
            <li>
              <Link to="/inscription" className="hover:text-gold-200">
                Rejoindre la cour
              </Link>
            </li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-ivory/50">
            <Sparkles className="h-3 w-3 text-gold-300" />
            "Par la Lumiere d'Elennor"
          </p>
        </div>
      </div>

      <div className="border-t border-royal-600/20">
        <nav
          aria-label="Parchemins legaux"
          className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-4 pt-5 text-center text-xs text-ivory/70 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-2 sm:px-6"
        >
          <Link to="/mentions-legales" className="hover:text-gold-200">
            Mentions legales
          </Link>
          <span aria-hidden="true" className="hidden text-royal-500/40 sm:inline">
            ·
          </span>
          <Link to="/confidentialite" className="hover:text-gold-200">
            Confidentialite
          </Link>
          <span aria-hidden="true" className="hidden text-royal-500/40 sm:inline">
            ·
          </span>
          <Link to="/cgu" className="hover:text-gold-200">
            CGU
          </Link>
          <span aria-hidden="true" className="hidden text-royal-500/40 sm:inline">
            ·
          </span>
          <Link to="/cgv" className="hover:text-gold-200">
            CGV
          </Link>
          <span aria-hidden="true" className="hidden text-royal-500/40 sm:inline">
            ·
          </span>
          <Link to="/cookies" className="hover:text-gold-200">
            Cookies
          </Link>
        </nav>
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-5 text-center text-xs text-ivory/40 sm:px-6">
          <p>© {new Date().getFullYear()} Royaume de Vaelyndra. Tous droits reserves.</p>
          <p className="text-[11px]">
            Site independant. Les marques tierces mentionnees restent la
            propriete de leurs detenteurs respectifs.
          </p>
        </div>
      </div>
    </footer>
  );
}
