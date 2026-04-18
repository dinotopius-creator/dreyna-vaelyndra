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
  LiveSession,
  Order,
  Product,
  Comment,
} from "../types";
import {
  INITIAL_ARTICLES,
  INITIAL_COMMUNITY_POSTS,
  INITIAL_LIVES,
  INITIAL_PRODUCTS,
} from "../data/mock";
import { useAuth } from "./AuthContext";

interface StoreState {
  articles: Article[];
  products: Product[];
  posts: CommunityPost[];
  lives: LiveSession[];
  cart: CartItem[];
  orders: Order[];
}

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
  | { type: "addPost"; post: CommunityPost }
  | { type: "deletePost"; id: string }
  | { type: "reactPost"; postId: string; emoji: string; userId: string }
  | { type: "addPostComment"; postId: string; comment: Comment }
  | { type: "addLive"; live: LiveSession }
  | { type: "deleteLive"; id: string };

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
    case "deleteProduct":
      return {
        ...state,
        products: state.products.filter((p) => p.id !== action.id),
      };
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
    case "addLive":
      return { ...state, lives: [action.live, ...state.lives] };
    case "deleteLive":
      return { ...state, lives: state.lives.filter((l) => l.id !== action.id) };
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
};

interface StoreCtx extends StoreState {
  dispatch: React.Dispatch<Action>;
  cartTotal: number;
  cartCount: number;
  isLiveOn: boolean;
  toggleLive: () => void;
  setLiveOn: (value: boolean) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return init;
      const parsed = JSON.parse(raw) as Partial<StoreState>;
      return {
        articles: parsed.articles ?? init.articles,
        products: parsed.products ?? init.products,
        posts: parsed.posts ?? init.posts,
        lives: parsed.lives ?? init.lives,
        cart: parsed.cart ?? [],
        orders: parsed.orders ?? [],
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
    }),
    [state, cartTotal, cartCount, isLiveOn, toggleLive, setLiveOnValue],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used in StoreProvider");
  return ctx;
}
