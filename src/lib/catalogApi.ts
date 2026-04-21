/**
 * Client HTTP pour les endpoints `/catalog/*` et `/admin/catalog/*`.
 *
 * Ces endpoints sont la source de vérité unique pour la boutique et les
 * chroniques (avant PR #76 : le contenu vivait dans le `localStorage` de
 * chaque navigateur → suppressions qui revivaient au F5 + chaque appareil
 * voyait un catalogue différent).
 *
 * Les appels admin envoient `credentials: "include"` pour transmettre le
 * cookie de session HttpOnly (même stratégie que `adminApi.ts`).
 */
import type { Article, Product, Comment } from "../types";
import { API_BASE, ApiError } from "./api";

async function authRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail =
        typeof body?.detail === "string"
          ? body.detail
          : JSON.stringify(body?.detail ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

// --- Serialization backend <-> frontend ------------------------------------
//
// Le backend renvoie `sylvins: null` (Python `None`) quand le produit n'est
// pas de catégorie "Sylvins". En TypeScript on modélise ça par l'absence de
// la clé. De même, `currency` est toujours "€" côté front (literal type)
// alors que côté backend c'est juste une string.

interface BackendProduct {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  image: string;
  category: string;
  sylvins: number | null;
  rating: number;
  stock: number;
  featured: boolean;
  tags: string[];
}

function toProduct(p: BackendProduct): Product {
  const out: Product = {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    price: p.price,
    currency: "€",
    image: p.image,
    category: (p.category as Product["category"]) ?? "Merch",
    rating: p.rating,
    stock: p.stock,
    featured: p.featured,
    tags: p.tags,
  };
  if (p.sylvins !== null && p.sylvins !== undefined) {
    out.sylvins = p.sylvins;
  }
  return out;
}

interface BackendArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  cover: string;
  author: string;
  readingTime: number;
  tags: string[];
  likes: string[];
  comments: Array<{
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    createdAt: string;
    likes?: string[];
  }>;
  createdAt: string;
}

function toArticle(a: BackendArticle): Article {
  const comments: Comment[] = a.comments.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    authorName: c.authorName,
    authorAvatar: c.authorAvatar ?? "",
    content: c.content,
    createdAt: c.createdAt,
    likes: c.likes ?? [],
  }));
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    category: a.category as Article["category"],
    cover: a.cover,
    author: a.author,
    createdAt: a.createdAt,
    readingTime: a.readingTime,
    tags: a.tags,
    likes: a.likes,
    comments,
  };
}

// --- Lecture publique ------------------------------------------------------

export async function fetchCatalogProducts(): Promise<Product[]> {
  const data = (await authRequest<BackendProduct[]>("/catalog/products")) ?? [];
  return data.map(toProduct);
}

export async function fetchCatalogArticles(): Promise<Article[]> {
  const data = (await authRequest<BackendArticle[]>("/catalog/articles")) ?? [];
  return data.map(toArticle);
}

export async function toggleArticleLikeRemote(
  articleId: string,
): Promise<Article> {
  const a = (await authRequest<BackendArticle>(
    `/catalog/articles/${encodeURIComponent(articleId)}/like`,
    { method: "POST" },
  ))!;
  return toArticle(a);
}

export async function addArticleCommentRemote(
  articleId: string,
  content: string,
): Promise<Article> {
  const a = (await authRequest<BackendArticle>(
    `/catalog/articles/${encodeURIComponent(articleId)}/comments`,
    { method: "POST", body: JSON.stringify({ content }) },
  ))!;
  return toArticle(a);
}

// --- Mutations admin -------------------------------------------------------

export interface ProductInput {
  id?: string;
  name: string;
  tagline?: string;
  description?: string;
  price?: number;
  currency?: string;
  image?: string;
  category?: string;
  sylvins?: number | null;
  rating?: number;
  stock?: number;
  featured?: boolean;
  tags?: string[];
}

export async function createProductRemote(
  input: ProductInput,
): Promise<Product> {
  const body = { ...input, sylvins: input.sylvins ?? null };
  const p = (await authRequest<BackendProduct>("/admin/catalog/products", {
    method: "POST",
    body: JSON.stringify(body),
  }))!;
  return toProduct(p);
}

export async function updateProductRemote(
  productId: string,
  patch: Partial<ProductInput>,
): Promise<Product> {
  const p = (await authRequest<BackendProduct>(
    `/admin/catalog/products/${encodeURIComponent(productId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  ))!;
  return toProduct(p);
}

export async function deleteProductRemote(productId: string): Promise<void> {
  await authRequest<{ status: string }>(
    `/admin/catalog/products/${encodeURIComponent(productId)}`,
    { method: "DELETE" },
  );
}

export interface ArticleInput {
  id?: string;
  slug: string;
  title: string;
  excerpt?: string;
  content?: string;
  category?: string;
  cover?: string;
  author?: string;
  readingTime?: number;
  tags?: string[];
}

export async function createArticleRemote(
  input: ArticleInput,
): Promise<Article> {
  const a = (await authRequest<BackendArticle>("/admin/catalog/articles", {
    method: "POST",
    body: JSON.stringify(input),
  }))!;
  return toArticle(a);
}

export async function updateArticleRemote(
  articleId: string,
  patch: Partial<ArticleInput>,
): Promise<Article> {
  const a = (await authRequest<BackendArticle>(
    `/admin/catalog/articles/${encodeURIComponent(articleId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  ))!;
  return toArticle(a);
}

export async function deleteArticleRemote(articleId: string): Promise<void> {
  await authRequest<{ status: string }>(
    `/admin/catalog/articles/${encodeURIComponent(articleId)}`,
    { method: "DELETE" },
  );
}
