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
  category: "Merch" | "Digital" | "VIP" | "Exclusif";
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
