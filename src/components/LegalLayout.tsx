import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ScrollText, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Gabarit commun aux 5 pages légales (mentions, confidentialité, CGU, CGV,
 * cookies). On reprend volontairement le vocabulaire fantasy du site sans
 * sacrifier la rigueur juridique : chaque clause reste valide même si elle
 * est introduite par "Décret de la Reine".
 */
export function LegalLayout({
  eyebrow,
  title,
  lastUpdated,
  children,
}: {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs text-ivory/60 hover:text-gold-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au royaume
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mt-6"
      >
        <p className="font-regal text-[11px] tracking-[0.4em] text-gold-300">
          {eyebrow}
        </p>
        <h1 className="heading-gold mt-3 flex items-center gap-3 text-3xl md:text-5xl">
          <ScrollText className="h-7 w-7 text-gold-300 md:h-9 md:w-9" />
          {title}
        </h1>
        <p className="mt-3 text-xs text-ivory/55">
          Dernière mise à jour : {lastUpdated}
        </p>
      </motion.div>
      <article className="prose-legal mt-10 space-y-6 text-ivory/80 leading-relaxed">
        {children}
      </article>
    </div>
  );
}
