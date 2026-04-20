import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type {
  Article,
  CartItem,
  CommunityPost,
  Gift,
  GiftEvent,
  LiveSession,
  Order,
  Product,
  Comment,
  Wallet,
} from "../types";
import {
  GIFT_CATALOGUE,
  INITIAL_ARTICLES,
  INITIAL_COMMUNITY_POSTS,
  INITIAL_LIVES,
  INITIAL_PRODUCTS,
} from "../data/mock";
import { generateId } from "../lib/helpers";
import { apiListPosts } from "../lib/api";
import { useAuth } from "./AuthContext";

interface StoreState {
  articles: Article[];
  products: Product[];
  posts: CommunityPost[];
  lives: LiveSession[];
  cart: CartItem[];
  orders: Order[];
  /**
   * IDs of mock products (from INITIAL_PRODUCTS) that the admin has explicitly
   * deleted. We track them so the merge logic doesn't resurrect them on reload.
   */
  deletedMockProductIds: string[];
  /**
   * Per-user Sylvins wallets (balance, streamer earnings, gift history).
   */
  wallets: Record<string, Wallet>;
}

const MOCK_PRODUCT_IDS = new Set(INITIAL_PRODUCTS.map((p) => p.id));

type Action =
  | { type: "load"; state: StoreState }
  | { type: "addArticle"; article: Article }
  | { type: "updateArticle"; article: Article }
  | { type: "deleteArticle"; id: string }
  | { type: "toggleArticleLike"; articleId: string; userId: string }
  | {
      type: "addArticleComment";
      articleId: string;
      comment: Comment;
    }
  | { type: "addProduct"; product: Product }
  | { type: "updateProduct"; product: Product }
  | { type: "deleteProduct"; id: string }
  | { type: "addToCart"; productId: string; quantity?: number }
  | { type: "removeFromCart"; productId: string }
  | { type: "updateCartQty"; productId: string; quantity: number }
  | { type: "clearCart" }
  | { type: "checkout"; order: Order }
  | { type: "setPosts"; posts: CommunityPost[] }
  | { type: "replacePost"; post: CommunityPost }
  | { type: "addPost"; post: CommunityPost }
  | { type: "deletePost"; id: string }
  | { type: "reactPost"; postId: string; emoji: string; userId: string }
  | { type: "addPostComment"; postId: string; comment: Comment }
  | { type: "deletePostComment"; postId: string; commentId: string }
  | { type: "addLive"; live: LiveSession }
  | { type: "deleteLive"; id: string }
  | {
      type: "sendGift";
      gift: Gift;
      fromId: string;
      fromName: string;
      fromAvatar: string;
      toId: string;
      toName: string;
    }
  | { type: "creditSylvins"; userId: string; amount: number };

const STORAGE_KEY = "vaelyndra_store_v1";

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "load":
      return action.state;
    case "addArticle":
      return { ...state, articles: [action.article, ...state.articles] };
    case "updateArticle":
      return {
        ...state,
        articles: state.articles.map((a) =>
          a.id === action.article.id ? action.article : a,
        ),
      };
    case "deleteArticle":
      return {
        ...state,
        articles: state.articles.filter((a) => a.id !== action.id),
      };
    case "toggleArticleLike":
      return {
        ...state,
        articles: state.articles.map((a) => {
          if (a.id !== action.articleId) return a;
          const has = a.likes.includes(action.userId);
          return {
            ...a,
            likes: has
              ? a.likes.filter((u) => u !== action.userId)
              : [...a.likes, action.userId],
          };
        }),
      };
    case "addArticleComment":
      return {
        ...state,
        articles: state.articles.map((a) =>
          a.id === action.articleId
            ? { ...a, comments: [...a.comments, action.comment] }
            : a,
        ),
      };
    case "addProduct":
      return { ...state, products: [action.product, ...state.products] };
    case "updateProduct":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.product.id ? action.product : p,
        ),
      };
    case "deleteProduct": {
      const isMock = MOCK_PRODUCT_IDS.has(action.id);
      return {
        ...state,
        products: state.products.filter((p) => p.id !== action.id),
        deletedMockProductIds:
          isMock && !state.deletedMockProductIds.includes(action.id)
            ? [...state.deletedMockProductIds, action.id]
            : state.deletedMockProductIds,
      };
    }
    case "addToCart": {
      const quantity = action.quantity ?? 1;
      const existing = state.cart.find((c) => c.productId === action.productId);
      if (existing)
        return {
          ...state,
          cart: state.cart.map((c) =>
            c.productId === action.productId
              ? { ...c, quantity: c.quantity + quantity }
              : c,
          ),
        };
      return {
        ...state,
        cart: [...state.cart, { productId: action.productId, quantity }],
      };
    }
    case "removeFromCart":
      return {
        ...state,
        cart: state.cart.filter((c) => c.productId !== action.productId),
      };
    case "updateCartQty":
      return {
        ...state,
        cart: state.cart
          .map((c) =>
            c.productId === action.productId
              ? { ...c, quantity: action.quantity }
              : c,
          )
          .filter((c) => c.quantity > 0),
      };
    case "clearCart":
      return { ...state, cart: [] };
    case "checkout":
      return { ...state, cart: [], orders: [action.order, ...state.orders] };
    case "setPosts":
      return { ...state, posts: action.posts };
    case "replacePost":
      return {
        ...state,
        posts: state.posts.some((p) => p.id === action.post.id)
          ? state.posts.map((p) => (p.id === action.post.id ? action.post : p))
          : [action.post, ...state.posts],
      };
    case "addPost":
      return { ...state, posts: [action.post, ...state.posts] };
    case "deletePost":
      return { ...state, posts: state.posts.filter((p) => p.id !== action.id) };
    case "reactPost":
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          const current = p.reactions[action.emoji] ?? [];
          const has = current.includes(action.userId);
          return {
            ...p,
            reactions: {
              ...p.reactions,
              [action.emoji]: has
                ? current.filter((u) => u !== action.userId)
                : [...current, action.userId],
            },
          };
        }),
      };
    case "addPostComment":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? { ...p, comments: [...p.comments, action.comment] }
            : p,
        ),
      };
    case "deletePostComment":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? {
                ...p,
                comments: p.comments.filter((c) => c.id !== action.commentId),
              }
            : p,
        ),
      };
    case "addLive":
      return { ...state, lives: [action.live, ...state.lives] };
    case "deleteLive":
      return { ...state, lives: state.lives.filter((l) => l.id !== action.id) };
    case "sendGift": {
      // Garde-fou : s'offrir un cadeau à soi-même n'a aucun sens économique
      // (et casserait l'arithmétique : les deux clés `[fromId]` / `[toId]`
      // écraseraient l'une l'autre dans l'objet `wallets`). On rejette.
      if (action.fromId === action.toId) return state;
      const sender = getWallet(state.wallets, action.fromId);
      if (sender.balance < action.gift.price) return state;
      const receiver = getWallet(state.wallets, action.toId);
      const event: GiftEvent = {
        id: generateId("giftevt"),
        giftId: action.gift.id,
        fromId: action.fromId,
        fromName: action.fromName,
        fromAvatar: action.fromAvatar,
        toId: action.toId,
        toName: action.toName,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        wallets: {
          ...state.wallets,
          [action.fromId]: {
            ...sender,
            balance: sender.balance - action.gift.price,
            giftsSentCount: (sender.giftsSentCount ?? 0) + 1,
            history: [event, ...sender.history].slice(0, 50),
          },
          [action.toId]: {
            ...receiver,
            earnings: receiver.earnings + action.gift.price,
            giftsReceivedCount: (receiver.giftsReceivedCount ?? 0) + 1,
            history: [event, ...receiver.history].slice(0, 50),
          },
        },
      };
    }
    case "creditSylvins": {
      const wallet = getWallet(state.wallets, action.userId);
      return {
        ...state,
        wallets: {
          ...state.wallets,
          [action.userId]: {
            ...wallet,
            balance: wallet.balance + action.amount,
          },
        },
      };
    }
    default:
      return state;
  }
}

const INITIAL: StoreState = {
  articles: INITIAL_ARTICLES,
  products: INITIAL_PRODUCTS,
  posts: INITIAL_COMMUNITY_POSTS,
  lives: INITIAL_LIVES,
  cart: [],
  orders: [],
  deletedMockProductIds: [],
  wallets: {},
};

function getWallet(
  wallets: Record<string, Wallet>,
  userId: string,
): Wallet {
  const existing = wallets[userId];
  if (existing) {
    // Rétro-compat : les portefeuilles persistés avant l'ajout des compteurs
    // peuvent manquer de ces champs ; on les normalise à la volée.
    return {
      ...existing,
      giftsSentCount: existing.giftsSentCount ?? 0,
      giftsReceivedCount: existing.giftsReceivedCount ?? 0,
    };
  }
  return {
    userId,
    balance: 0,
    earnings: 0,
    history: [],
    giftsSentCount: 0,
    giftsReceivedCount: 0,
  };
}

interface StoreCtx extends StoreState {
  dispatch: React.Dispatch<Action>;
  cartTotal: number;
  cartCount: number;
  isLiveOn: boolean;
  toggleLive: () => void;
  setLiveOn: (value: boolean) => void;
  /** Portefeuille de l'utilisateur connecté (ou wallet vide si invité). */
  myWallet: Wallet;
  /** Lit le portefeuille d'un utilisateur arbitraire (streamer, etc.). */
  walletOf: (userId: string) => Wallet;
  /** Catalogue de cadeaux disponibles en live. */
  gifts: Gift[];
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return init;
      const parsed = JSON.parse(raw) as Partial<StoreState>;
      // Merge any new mock products (e.g. newly added Sylvins packs) into the
      // stored catalogue so existing users automatically get them without
      // losing their own admin-created products. Mock products that the admin
      // explicitly deleted are tracked in `deletedMockProductIds` so they are
      // NOT resurrected on reload.
      const storedProducts = parsed.products ?? init.products;
      const deletedMockProductIds = parsed.deletedMockProductIds ?? [];
      // Migration PR L (pivot mini-réseau) : rattrape les mock products
      // déjà persistés dans le localStorage des users existants — on réécrit
      // nom/description/tags depuis la source mock quand l'id match, ce qui
      // remplace automatiquement "Pack ZEPETO · Elennor" par le nouveau nom
      // sans effacer les produits admin personnalisés.
      const mergedProducts = [
        ...storedProducts.map((stored) => {
          const mock = init.products.find((m) => m.id === stored.id);
          return mock
            ? {
                ...stored,
                name: mock.name,
                description: mock.description,
                tags: mock.tags,
              }
            : stored;
        }),
        ...init.products.filter(
          (mock) =>
            !storedProducts.some((p) => p.id === mock.id) &&
            !deletedMockProductIds.includes(mock.id),
        ),
      ];
      // Migration PR L : rattrape la catégorie article "IRL / ZEPETO"
      // (obsolète) → "Lifestyle", + retitre "art-2" si l'ancien slug/title
      // ZEPETO est encore persisté. On ne touche pas aux articles custom
      // créés par l'admin.
      const storedArticles = parsed.articles ?? init.articles;
      const migratedArticles = storedArticles.map((art) => {
        const mock = init.articles.find((m) => m.id === art.id);
        const patch: Partial<typeof art> = {};
        if ((art.category as string) === "IRL / ZEPETO") {
          patch.category = "Lifestyle";
        }
        if (mock && art.id === "art-2") {
          patch.slug = mock.slug;
          patch.title = mock.title;
          patch.category = mock.category;
        }
        return Object.keys(patch).length > 0 ? { ...art, ...patch } : art;
      });
      return {
        articles: migratedArticles,
        products: mergedProducts,
        posts: parsed.posts ?? init.posts,
        lives: parsed.lives ?? init.lives,
        cart: parsed.cart ?? [],
        orders: parsed.orders ?? [],
        deletedMockProductIds,
        wallets: parsed.wallets ?? {},
      };
    } catch {
      return init;
    }
  });

  const [isLiveOn, setLiveOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vaelyndra_live_on") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Impossible de sauvegarder le royaume :", err);
    }
  }, [state]);

  useEffect(() => {
    localStorage.setItem("vaelyndra_live_on", isLiveOn ? "1" : "0");
  }, [isLiveOn]);

  // Récupère le fil depuis le backend au démarrage puis toutes les 30 s afin
  // que chaque membre voie les posts des autres sans refresh manuel. En cas
  // d'erreur (backend down), on garde silencieusement le cache localStorage.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const posts = await apiListPosts();
        if (!cancelled) dispatch({ type: "setPosts", posts });
      } catch (err) {
        if (!cancelled) console.warn("Impossible de rafraîchir le fil :", err);
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const cartTotal = useMemo(() => {
    return state.cart.reduce((acc, c) => {
      const p = state.products.find((p) => p.id === c.productId);
      return acc + (p ? p.price * c.quantity : 0);
    }, 0);
  }, [state.cart, state.products]);

  const cartCount = useMemo(
    () => state.cart.reduce((a, c) => a + c.quantity, 0),
    [state.cart],
  );

  const toggleLive = useCallback(() => setLiveOn((v) => !v), []);
  const setLiveOnValue = useCallback((value: boolean) => setLiveOn(value), []);

  const walletOf = useCallback(
    (userId: string) => getWallet(state.wallets, userId),
    [state.wallets],
  );
  const myWallet = useMemo(
    () => walletOf(user?.id ?? "__anon__"),
    [walletOf, user?.id],
  );

  // Keep a hint in localStorage of the current user (used by reducers indirectly via components)
  useEffect(() => {
    if (user) localStorage.setItem("vaelyndra_current_user", user.id);
  }, [user]);

  const value = useMemo<StoreCtx>(
    () => ({
      ...state,
      dispatch,
      cartTotal,
      cartCount,
      isLiveOn,
      toggleLive,
      setLiveOn: setLiveOnValue,
      myWallet,
      walletOf,
      gifts: GIFT_CATALOGUE,
    }),
    [
      state,
      cartTotal,
      cartCount,
      isLiveOn,
      toggleLive,
      setLiveOnValue,
      myWallet,
      walletOf,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used in StoreProvider");
  return ctx;
}
