import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <Sparkles className="mx-auto h-10 w-10 text-gold-300" />
      <h1 className="heading-gold mt-5 text-5xl">404</h1>
      <p className="mt-2 font-display text-xl text-gold-200">
        Cette page s'est perdue dans la brume.
      </p>
      <p className="mt-3 text-ivory/70">
        Peut-être qu'un sortilège mal prononcé vous a fait dévier du chemin.
      </p>
      <Link to="/" className="btn-gold mt-6">
        Retour au royaume
      </Link>
    </div>
  );
}
