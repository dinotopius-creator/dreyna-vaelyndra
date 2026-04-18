import { Link } from "react-router-dom";
import { Crown, Sparkles, PlayCircle, Gem } from "lucide-react";
import { DREYNA_PROFILE } from "../data/mock";

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
          <div className="mt-3 flex flex-wrap gap-3 text-ivory/75">
            <a
              href={DREYNA_PROFILE.socials.zepeto}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ZEPETO de Dreyna"
              className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-3 py-1.5 text-xs hover:border-gold-400/60 hover:text-gold-200"
            >
              <Gem className="h-3.5 w-3.5" />
              ZEPETO
            </a>
            <a
              href={DREYNA_PROFILE.socials.youtube}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube de Dreyna"
              className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-3 py-1.5 text-xs hover:border-gold-400/60 hover:text-gold-200"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              YouTube
            </a>
          </div>
          <p className="mt-4 text-[11px] text-ivory/55">
            ZEPETO : <span className="text-gold-200">{DREYNA_PROFILE.socials.zepetoHandle}</span>
            <br />
            YouTube : <span className="text-gold-200">{DREYNA_PROFILE.socials.youtubeHandle}</span>
          </p>
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
          <span aria-hidden="true" className="text-royal-500/40">
            ·
          </span>
          <Link to="/confidentialite" className="hover:text-gold-200">
            Confidentialité
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">
            ·
          </span>
          <Link to="/cgu" className="hover:text-gold-200">
            CGU
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">
            ·
          </span>
          <Link to="/cgv" className="hover:text-gold-200">
            CGV
          </Link>
          <span aria-hidden="true" className="text-royal-500/40">
            ·
          </span>
          <Link to="/cookies" className="hover:text-gold-200">
            Cookies
          </Link>
        </nav>
        <div className="mx-auto max-w-7xl space-y-2 px-6 py-5 text-center text-xs text-ivory/40">
          <p>
            © {new Date().getFullYear()} Royaume de Vaelyndra — Tous droits
            réservés. Contact :{" "}
            <a
              href="mailto:support@vaelyndra.com"
              className="text-gold-300/80 hover:text-gold-200"
            >
              support@vaelyndra.com
            </a>
          </p>
          <p className="text-ivory/35">
            Site de fan indépendant, non affilié à ZEPETO ni à Naver Z Corp.
            ZEPETO et les marques associées appartiennent à leurs détenteurs
            respectifs.
          </p>
        </div>
      </div>
    </footer>
  );
}
