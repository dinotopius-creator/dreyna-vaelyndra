import { Link } from "react-router-dom";
import { Sparkles, Plus, Search } from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";

export function ClubHub() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-10">
      <SectionHeading
        eyebrow="Clubs"
        title={
          <>
            Rejoins ou crée{" "}
            <span className="text-mystic">ton club</span>
          </>
        }
        subtitle="Espace propre pour préparer la structure Clubs sans bouton mort."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="card-royal p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/20 bg-gold-500/10 text-gold-200">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-2xl text-gold-100">Créer un club</h3>
              <p className="mt-2 text-sm leading-6 text-ivory/75">
                Prépare la base du club, son nom, sa description et son identité visuelle.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/compte" className="btn-gold">Gérer mon compte</Link>
            <Link to="/social/play" className="btn-ghost">Voir la communauté</Link>
          </div>
        </article>

        <article className="card-royal p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/20 bg-gold-500/10 text-gold-200">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-2xl text-gold-100">Rejoindre un club</h3>
              <p className="mt-2 text-sm leading-6 text-ivory/75">
                La découverte des clubs est préparée ici. Pour l’instant, la communauté reste accessible via Social.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/communaute" className="btn-gold">Explorer Social</Link>
            <Link to="/mondes" className="btn-ghost">Voir les Mondes</Link>
          </div>
        </article>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-ivory/70">
        <div className="flex items-center gap-2 text-gold-200">
          <Sparkles className="h-4 w-4" />
          <p className="font-semibold">Préparation Clubs</p>
        </div>
        <p className="mt-3 leading-6">
          Cette page évite tout bouton mort sur l’Accueil et prépare une vraie couche Clubs si la fonctionnalité est étendue ensuite.
        </p>
      </div>
    </div>
  );
}
