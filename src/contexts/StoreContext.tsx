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
import {
  fetchCatalogArticles,
  fetchCatalogProducts,
} from "../lib/catalogApi";
import { useAuth } from "./AuthContext";

interface StoreState {
  articles: Article[];
  products: Product[];
  posts: CommunityPost[];
  lives: LiveSession[];
  cart: CartItem[];
  orders: Order[];
  /**
   * IDs of products (mock from INITIAL_PRODUCTS ou admin-créés) que l'admin a
   * explicitement supprimés. On les garde pour que la logique de merge ne les
   * ressuscite pas au reload (mock) et que d'éventuels seeds futurs les
   * respectent aussi (custom). Clé localStorage conservée (`deletedMockProductIds`)
   * pour la rétro-compat avec les stores déjà persistés.
   */
  deletedProductIds: string[];
  /**
   * IDs d'articles supprimés par l'admin (mock ou custom). Même logique que
   * `deletedProductIds`.
   */
  deletedArticleIds: string[];
  /**
   * Per-user Sylvins wallets (balance, streamer earnings, gift history).
   */
  wallets: Record<string, Wallet>;
}

type Action =
  | { type: "load"; state: StoreState }
  | { type: "setProducts"; products: Product[] }
  | { type: "setArticles"; articles: Article[] }
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
  | { type: "creditSylvins"; userId: string; amount: number }
  | {
      /**
       * Synchronise le wallet local depuis la source de vérité serveur
       * (`backendMe.sylvins_paid + sylvins_promo`). Sans ça, après un
       * paiement Stripe (qui crédite uniquement côté backend), la balance
       * affichée dans /moi, /panier et le GiftPanel resterait à 0 jusqu'à
       * ce que l'utilisateur dépense quelque chose. Idem au login : un
       * compte chargé d'achats antérieurs n'affichait jamais ses Sylvins.
       */
      type: "syncWalletFromServer";
      userId: string;
      balance: number;
      earnings: number;
    };

const STORAGE_KEY = "vaelyndra_store_v1";

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "load":
      return action.state;
    case "setProducts":
      return { ...state, products: action.products };
    case "setArticles":
      return { ...state, articles: action.articles };
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
        deletedArticleIds: state.deletedArticleIds.includes(action.id)
          ? state.deletedArticleIds
          : [...state.deletedArticleIds, action.id],
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
        deletedProductIds: state.deletedProductIds.includes(action.id)
          ? state.deletedProductIds
          : [...state.deletedProductIds, action.id],
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
    case "syncWalletFromServer": {
      const wallet = getWallet(state.wallets, action.userId);
      // Idempotence : si rien n'a bougé, on évite un re-render inutile.
      if (
        wallet.balance === action.balance &&
        wallet.earnings === action.earnings
      ) {
        return state;
      }
      return {
        ...state,
        wallets: {
          ...state.wallets,
          [action.userId]: {
            ...wallet,
            balance: action.balance,
            earnings: action.earnings,
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
  deletedProductIds: [],
  deletedArticleIds: [],
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
  const { user, backendMe } = useAuth();
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
      // Lecture avec rétro-compat : les stores existants utilisent
      // `deletedMockProductIds` (ancien nom, même sémantique étendue).
      const parsedAny = parsed as Partial<StoreState> & {
        deletedMockProductIds?: string[];
      };
      const deletedProductIds =
        parsedAny.deletedProductIds ??
        parsedAny.deletedMockProductIds ??
        [];
      // Pour les articles, pas de champ équivalent avant ce fix. Si le store
      // n'a pas `deletedArticleIds` (= user antérieur à ce PR), on infère
      // qu'un mock manquant dans storedArticles a été supprimé volontairement
      // par l'admin, et on le garde comme "deleted" pour ne pas le ressusciter.
      const storedArticlesRaw = parsed.articles;
      const deletedArticleIds =
        parsedAny.deletedArticleIds ??
        (storedArticlesRaw
          ? init.articles
              .filter(
                (mock) => !storedArticlesRaw.some((a) => a.id === mock.id),
              )
              .map((a) => a.id)
          : []);

      // --- Migration one-shot PR L (pivot mini-réseau) ----------------------
      //
      // Les users déjà connectés ont persisté dans leur localStorage :
      //  - des mock products avec les anciens noms ZEPETO
      //  - l'article "art-2" avec slug/title ZEPETO et catégorie "IRL / ZEPETO"
      //  - le live "live-2" avec titre ZEPETO
      //
      // On applique **une seule fois** un patch pour les rattraper, gardé
      // derrière un flag de version (`vaelyndra_migration_v`). Sans ce flag,
      // la réécriture serait permanente : les futures customisations admin
      // via `updateProduct`/`updateArticle` seraient silencieusement écrasées
      // au prochain reload. Après le passage de cette migration, les données
      // stockées sont la source de vérité et la boucle ne touche plus à rien.
      const MIGRATION_KEY = "vaelyndra_migration_v";
      const MIGRATION_TARGET = 1; // PR L
      const runMigration = (() => {
        try {
          const current = Number(localStorage.getItem(MIGRATION_KEY) ?? "0");
          return current < MIGRATION_TARGET;
        } catch {
          return true;
        }
      })();

      // On scope strictement la migration aux produits seed qui portaient
      // réellement une référence ZEPETO (actuellement uniquement `prod-pack` :
      // "Pack ZEPETO · Elennor" → "Pack Avatar · Elennor"). Les autres mock
      // products (prod-crown, prod-vip, prod-sylvins-*, etc.) n'ont pas besoin
      // de patch — si un admin les avait customisés via `updateProduct`, les
      // écraser ici reviendrait à annuler silencieusement sa modification.
      // Pour les prochains rebrands, ajouter l'id dans ce tableau.
      const MIGRATION_PRODUCT_IDS = new Set(["prod-pack"]);

      const deletedSet = new Set(deletedProductIds);
      const mergedProducts = [
        ...storedProducts
          .filter((stored) => !deletedSet.has(stored.id))
          .map((stored) => {
            if (!runMigration) return stored;
            if (!MIGRATION_PRODUCT_IDS.has(stored.id)) return stored;
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
            !deletedSet.has(mock.id),
        ),
      ];

      const storedArticles = parsed.articles ?? init.articles;
      const deletedArticleSet = new Set(deletedArticleIds);
      const migratedArticles = runMigration
        ? storedArticles.map((art) => {
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
          })
        : storedArticles;
      const finalArticles = [
        ...migratedArticles.filter((a) => !deletedArticleSet.has(a.id)),
        ...init.articles.filter(
          (mock) =>
            !migratedArticles.some((a) => a.id === mock.id) &&
            !deletedArticleSet.has(mock.id),
        ),
      ];

      // Lives : même logique — on ne rafraîchit le titre depuis le mock QUE
      // pour les lives seed (ids présents dans init.lives). Les lives créés
      // par la cour (archives, lives admin) ne sont jamais touchés.
      const storedLives = parsed.lives ?? init.lives;
      const migratedLives = runMigration
        ? storedLives.map((live) => {
            const mock = init.lives.find((m) => m.id === live.id);
            if (!mock) return live;
            // On rafraîchit uniquement les champs potentiellement ZEPETO
            // (title, description) pour live-2 ; pour les autres lives seed
            // on laisse tel quel afin de ne pas écraser une édition admin.
            if (live.id === "live-2") {
              return {
                ...live,
                title: mock.title,
                description: mock.description,
              };
            }
            return live;
          })
        : storedLives;

      if (runMigration) {
        try {
          localStorage.setItem(MIGRATION_KEY, String(MIGRATION_TARGET));
        } catch {
          // Best-effort : si localStorage est plein / désactivé, on tolère
          // une ré-exécution — l'idempotence de la migration garantit que
          // ça ne casse rien (les champs sont juste ré-écrits à l'identique).
        }
      }

      return {
        articles: finalArticles,
        products: mergedProducts,
        posts: parsed.posts ?? init.posts,
        lives: migratedLives,
        cart: parsed.cart ?? [],
        orders: parsed.orders ?? [],
        deletedProductIds,
        deletedArticleIds,
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

  // Boutique + chroniques : la source de vérité est le backend (PR #76). On
  // remplace complètement les listes locales au premier succès. Tant que le
  // backend répond pas, on affiche le cache localStorage (fallback offline).
  // Refresh toutes les 60 s pour propager les changements admin.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [products, articles] = await Promise.all([
          fetchCatalogProducts(),
          fetchCatalogArticles(),
        ]);
        if (!cancelled) {
          dispatch({ type: "setProducts", products });
          dispatch({ type: "setArticles", articles });
        }
      } catch (err) {
        if (!cancelled)
          console.warn("Impossible de rafraîchir le catalogue :", err);
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Source de vérité du wallet : `backendMe` (`/auth/me`). Sans ce sync, la
  // balance locale (`state.wallets[user.id]`) ne reçoit jamais les Sylvins
  // crédités côté serveur (achats Stripe via webhook, top-ups admin, gains
  // streamer). Résultat : "Solde à dépenser : 0 Sylvins" même après un
  // paiement réussi. On dispatche dès que les pots changent côté serveur.
  useEffect(() => {
    if (!user?.id || !backendMe) return;
    const balance =
      (backendMe.sylvins_paid ?? 0) + (backendMe.sylvins_promo ?? 0);
    const earnings =
      (backendMe.earnings_paid ?? 0) + (backendMe.earnings_promo ?? 0);
    dispatch({
      type: "syncWalletFromServer",
      userId: user.id,
      balance,
      earnings,
    });
  }, [
    user?.id,
    backendMe?.sylvins_paid,
    backendMe?.sylvins_promo,
    backendMe?.earnings_paid,
    backendMe?.earnings_promo,
  ]);

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
