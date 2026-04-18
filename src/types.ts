export type Category = "Lore" | "IRL / ZEPETO" | "Annonces" | "Communauté";

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  role: "queen" | "knight" | "elf";
  joinedAt: string;
  bio?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
  likes: string[]; // userIds
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
 * - `history` : trace des cadeaux envoyés/reçus pour l'affichage.
 */
export interface Wallet {
  userId: string;
  balance: number;
  earnings: number;
  history: GiftEvent[];
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
