export type Category = "Lore" | "Lifestyle" | "Annonces" | "Communauté";

export interface User {
  id: string;
  username: string;
  /**
   * PR S — identifiant public unique `@handle` (ex. `le_roi_des_zems`).
   * Dérivé automatiquement du pseudo à l'inscription, modifiable via
   * `/compte` avec un cooldown de 30 jours. Optionnel tant que les
   * profils pré-PR S n'ont pas été backfillés au démarrage backend.
   */
  handle?: string;
  email: string;
  avatar: string;
  role: "queen" | "knight" | "elf";
  joinedAt: string;
  bio?: string;
  /** Slug de la créature choisie à l'inscription (cf. `CREATURES`). */
  creatureId?: string;
}

/**
 * Créature choisie à l'inscription. Catalogue figé côté backend
 * (`/creatures`) et dupliqué côté front dans `src/data/creatures.ts` pour
 * ne pas bloquer l'UI sur un appel réseau avant l'étape de sélection.
 */
export interface Creature {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  /** PR S — `@handle` de l'auteur, résolu côté backend au serialize. */
  authorHandle?: string | null;
  authorAvatar: string;
  content: string;
  createdAt: string;
  likes: string[]; // userIds
  parentId?: string | null;
  replyToAuthorId?: string | null;
  replyToAuthorName?: string | null;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: Category;
  cover: string;
  author: string;
  createdAt: string;
  readingTime: number;
  tags: string[];
  likes: string[];
  comments: Comment[];
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  currency: "€";
  image: string;
  category: "Merch" | "Digital" | "VIP" | "Exclusif" | "Sylvins";
  /**
   * Amount of Sylvins (virtual currency) granted when this product is purchased.
   * Only set on products of category "Sylvins".
   */
  sylvins?: number;
  rating: number;
  stock: number;
  featured?: boolean;
  tags: string[];
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: { productId: string; quantity: number; priceAtPurchase: number }[];
  total: number;
  createdAt: string;
  status: "pending" | "paid" | "shipped";
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  /** PR S — `@handle` de l'auteur, résolu côté backend au serialize. */
  authorHandle?: string | null;
  authorAvatar: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
  reactions: Record<string, string[]>; // emoji -> userIds
  comments: Comment[];
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
  highlight?: boolean;
  /**
   * Diminutif 3 lettres du grade de l'auteur au moment où il a parlé (ex.
   * "BRM", "LEG"). Affiché entre crochets devant le pseudo dans le chat.
   * `null`/absent = auteur sans grade connu (message système, bot, auteur
   * pré-PR grades, etc.) → on n'affiche rien plutôt que d'afficher `[?]`.
   */
  gradeShort?: string | null;
}

export interface LiveSession {
  id: string;
  title: string;
  description: string;
  cover: string;
  startedAt: string;
  durationMinutes?: number;
  peakViewers: number;
  replay?: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: "commun" | "rare" | "mythique" | "royale";
}

export type GiftRarity =
  | "commun"
  | "rare"
  | "epique"
  | "legendaire"
  | "mythique";

export interface Gift {
  id: string;
  name: string;
  /** Coût en Sylvins (retiré du wallet du viewer et crédité au streamer). */
  price: number;
  /** Chemin vers l'icône SVG (public/gifts/xxx.svg). */
  icon: string;
  rarity: GiftRarity;
  description: string;
}

/**
 * Portefeuille Sylvins d'un membre.
 * - `balance` : Sylvins achetés que le membre peut dépenser en cadeaux.
 * - `earnings` : Sylvins reçus en cadeaux (solde streamer, convertible en €).
 * - `history` : trace des cadeaux envoyés/reçus (tronquée aux 50 plus récents
 *   pour ne pas exploser le localStorage).
 * - `giftsSentCount` / `giftsReceivedCount` : compteurs cumulatifs complets
 *   (non tronqués) utilisés pour l'affichage des stats durables.
 */
export interface Wallet {
  userId: string;
  balance: number;
  earnings: number;
  history: GiftEvent[];
  giftsSentCount: number;
  giftsReceivedCount: number;
}

export interface GiftEvent {
  id: string;
  giftId: string;
  /** Celui qui a offert. */
  fromId: string;
  fromName: string;
  fromAvatar: string;
  /** Celui qui reçoit (streamer). */
  toId: string;
  toName: string;
  createdAt: string;
}

/**
 * Événement de cadeau diffusé en temps réel sur le live courant via
 * la DataConnection WebRTC (PeerJS). Mêmes principes de transport que
 * `ChatMessage` :
 *   - Viewer → host (le viewer publie son cadeau).
 *   - Host re-broadcast à TOUS les viewers (y compris l'émetteur, pour
 *     que tout le monde voie le même état dans le même ordre).
 *   - Aucun stockage : un viewer qui rejoint le live après le cadeau
 *     ne le voit pas (volatil, façon "bullet curtain" Twitch).
 *
 * Ce qui circule = les infos minimales pour reconstituer l'effet visuel
 * + le top-soutien chez chaque viewer. Le `giftId` est résolu chez le
 * client contre `GIFT_CATALOGUE` (icon, prix, rareté). Le host valide
 * que `giftId` existe avant de re-broadcaster — sans ça un viewer
 * malveillant pourrait spammer un faux cadeau "mythique" à 1 Sylvin.
 */
export interface LiveGiftEvent {
  /** Identifiant unique de l'événement (dédoublonnage). */
  id: string;
  /** ID du cadeau du catalogue (`GIFT_CATALOGUE`). */
  giftId: string;
  /** Celui qui a offert le cadeau. */
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  createdAt: string;
}
