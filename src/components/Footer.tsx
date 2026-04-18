import { Link } from "react-router-dom";
import { Crown, Sparkles, AtSign, RadioTower, Film } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-royal-600/20 bg-night-900/60 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
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
            Le royaume officiel de Dreyna, reine des elfes. Forgé à la lumière
            d'Elennor.
          </p>
        </div>
        <div>
          <p className="font-regal text-[11px] text-gold-300">Le Royaume</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li><Link to="/" className="hover:text-gold-200">Accueil</Link></li>
            <li><Link to="/blog" className="hover:text-gold-200">Chroniques</Link></li>
            <li><Link to="/boutique" className="hover:text-gold-200">Boutique</Link></li>
            <li><Link to="/live" className="hover:text-gold-200">Lives</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-regal text-[11px] text-gold-300">La cour</p>
          <ul className="mt-3 space-y-2 text-sm text-ivory/75">
            <li><Link to="/communaute" className="hover:text-gold-200">Communauté</Link></li>
            <li><Link to="/dreyna" className="hover:text-gold-200">La Reine</Link></li>
            <li><Link to="/connexion" className="hover:text-gold-200">Connexion</Link></li>
            <li><Link to="/inscription" className="hover:text-gold-200">Rejoindre la cour</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-regal text-[11px] text-gold-300">Étoiles filantes</p>
          <div className="mt-3 flex gap-3 text-ivory/75">
            <a href="#" aria-label="Instagram" className="rounded-full border border-royal-500/30 p-2 hover:text-gold-200"><AtSign className="h-4 w-4" /></a>
            <a href="#" aria-label="Twitch" className="rounded-full border border-royal-500/30 p-2 hover:text-gold-200"><RadioTower className="h-4 w-4" /></a>
            <a href="#" aria-label="YouTube" className="rounded-full border border-royal-500/30 p-2 hover:text-gold-200"><Film className="h-4 w-4" /></a>
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-ivory/50">
            <Sparkles className="h-3 w-3 text-gold-300" />
            "Par la Lumière d'Elennor"
          </p>
        </div>
      </div>
      <div className="border-t border-royal-600/20 py-5 text-center text-xs text-ivory/40">
        © {new Date().getFullYear()} Royaume de Vaelyndra — Tous droits réservés.
      </div>
    </footer>
  );
}
