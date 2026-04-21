/**
 * PR S — Petit composant d'affichage pour le `@handle` public d'un membre.
 *
 * Utilisé sous chaque pseudo (posts, commentaires, header profil, live
 * chat, classement…). Centralise le style (ton doré discret, tracking
 * légèrement resserré) pour qu'on n'ait qu'un seul endroit à faire
 * évoluer si on veut changer l'apparence.
 *
 * Rend `null` quand le handle est absent (profil pré-PR S pas encore
 * backfillé) pour ne pas afficher un `@` orphelin.
 */
import type { HTMLAttributes } from "react";

interface HandleProps extends HTMLAttributes<HTMLSpanElement> {
  /** Handle sans le `@` (le composant l'ajoute). Peut être nullish. */
  handle?: string | null;
  /**
   * Taille visuelle. `sm` pour les posts/commentaires (défaut), `xs` pour
   * les listes très denses (recherche, chat live), `base` pour le header
   * de profil où on veut donner du poids à l'identifiant.
   */
  size?: "xs" | "sm" | "base";
}

const SIZE_CLASS: Record<NonNullable<HandleProps["size"]>, string> = {
  xs: "text-[11px]",
  sm: "text-xs",
  base: "text-sm",
};

export function Handle({
  handle,
  size = "sm",
  className = "",
  ...rest
}: HandleProps) {
  if (!handle) return null;
  return (
    <span
      className={`font-mono ${SIZE_CLASS[size]} tracking-tight text-gold-300/70 ${className}`}
      {...rest}
    >
      @{handle}
    </span>
  );
}
