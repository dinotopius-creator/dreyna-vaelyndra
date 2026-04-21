/**
 * Helper unique pour afficher le "rôle" d'un utilisateur de façon sobre.
 *
 * Historiquement, l'app affichait des titres fantasy ("Reine de Vaelyndra",
 * "Chevalier·e lunaire", "Elfe de la cour") en dur sur les profils. Sur
 * un vrai réseau social, le rôle doit juste dire ce que la personne EST
 * sur la plateforme (admin / animateur / membre), sans fiction narrative.
 *
 * On accepte aussi les valeurs legacy locales (`queen` / `knight` / `elf`)
 * pour garder la cohérence avec les users encore synchronisés côté
 * `localStorage` seed.
 *
 * Le `role` du backend est la source de vérité quand il est disponible :
 * `admin` | `animator` | `user`.
 */
export type UserRole =
  | "admin"
  | "animator"
  | "user"
  | "queen"
  | "knight"
  | "elf"
  | string
  | null
  | undefined;

export function roleLabel(role: UserRole): string {
  if (role === "admin" || role === "queen") return "Administrateur";
  if (role === "animator" || role === "knight") return "Animateur";
  return "Membre";
}

/** Avec une pincée d'emoji pour les cartes profil. */
export function roleLabelWithIcon(role: UserRole): string {
  if (role === "admin" || role === "queen") return "🛡️ Administrateur";
  if (role === "animator" || role === "knight") return "🎭 Animateur";
  return "✨ Membre";
}
