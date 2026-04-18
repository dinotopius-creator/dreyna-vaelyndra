/**
 * Constantes économiques du royaume de Vaelyndra.
 *
 * Le prix de référence est le pack d'entrée "Pochée de Sylvins" (100 Sylvins
 * pour 1,99 €), soit **0,0199 € / Sylvin**. Cette conversion n'est utilisée
 * que pour estimer les recettes des streamers en € ; la monnaie réelle
 * manipulée en live reste le Sylvin.
 */
export const SYLVIN_TO_EUR = 1.99 / 100;

/**
 * Part que la plateforme Vaelyndra prélève sur les gains des streamers
 * (0,30 = 30 %). Le streamer touche donc `1 - PLATFORM_CUT` (70 %) net.
 */
export const PLATFORM_CUT = 0.3;

/**
 * Seuil minimum de retrait en €. Tant que le solde net du streamer est
 * inférieur, le bouton "Retirer" reste désactivé.
 */
export const MIN_PAYOUT_EUR = 20;

/** Calcule la valeur brute en € d'un solde en Sylvins. */
export function sylvinsToGrossEur(sylvins: number): number {
  return sylvins * SYLVIN_TO_EUR;
}

/** Calcule la valeur nette en € (après la marge plateforme). */
export function sylvinsToNetEur(sylvins: number): number {
  return sylvinsToGrossEur(sylvins) * (1 - PLATFORM_CUT);
}

/** Formate un montant en €. */
export function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Formate un nombre de Sylvins. */
export function formatSylvins(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}
