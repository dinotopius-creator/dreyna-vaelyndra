import { Link } from "react-router-dom";
import { Crown, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-royal-600/20 bg-night-900/60 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900">
              <Crown className="h-5 w-5" />
            </span>
            <span className="font-display text-lg text-gold-200">
              Vaelyndra
            </span>
          </div>
          <p className="text-sm text-ivory/70">
            Mini-réseau social magique. Streamers, créateurs, âmes connectées —
            chacun peut percer, chacun peut briller.
          </p>
        </div>
        <div>
          <p className="font-regal text-[11px] text-gold-300">Le Royaume</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li><Link to="/" className="hover:text-gold-200">Accueil</Link></li>
            <li><Link to="/blog" className="hover:text-gold-200">Chroniques</Link></li>
            <li><Link to="/boutique" className="hover:text-gold-200">Boutique</Link></li>
            <li><Link to="/live" className="hover:text-gold-200">Live</Link></li>
            <li><Link to="/mondes" className="hover:text-gold-200">Mondes</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-regal text-[11px] text-gold-300">La Cour</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li><Link to="/communaute" className="hover:text-gold-200">Communauté</Link></li>
            <li><Link to="/connexion" className="hover:text-gold-200">Connexion</Link></li>
            <li><Link to="/inscription" className="hover:text-gold-200">Rejoindre la cour</Link></li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-ivory/50">
            <Sparkles className="h-3 w-3 text-gold-300" />
            "Par la Lumière d'Elennor"
          </p>
        </div>
      </div>
      <div className="border-t border-royal-600/20">
        <nav
          aria-label="Parchemins légaux"
          className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 pt-5 text-xs text-ivory/70"
        >
          <Link to="/mentions-legales" className="hover:text-gold-200">
            Mentions légales
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">·</span>
          <Link to="/confidentialite" className="hover:text-gold-200">
            Confidentialité
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">·</span>
          <Link to="/cgu" className="hover:text-gold-200">
            CGU
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">·</span>
          <Link to="/cgv" className="hover:text-gold-200">
            CGV
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">·</span>
          <Link to="/cookies" className="hover:text-gold-200">
            Cookies
          </Link>
        </nav>
        <div className="mx-auto max-w-7xl space-y-2 px-6 py-5 text-center text-xs text-ivory/40">
          <p>© {new Date().getFullYear()} Royaume de Vaelyndra — Tous droits réservés.</p>
          <p className="text-[11px]">
            Site indépendant. Les marques tierces mentionnées restent la propriété de leurs détenteurs respectifs.
          </p>
        </div>
      </div>
    </footer>
  );
}
