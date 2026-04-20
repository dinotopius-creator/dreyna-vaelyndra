/**
 * Contexte d'authentification Vaelyndra.
 *
 * Source de vérité : **le backend FastAPI** (endpoints `/auth/*`, cookie
 * HttpOnly `vaelyndra_session`). Le `users` local (localStorage) est
 * conservé uniquement pour back-compat des écrans qui listent tous les
 * utilisateurs (Admin, annuaire…) et pour afficher le profil local
 * lorsque l'utilisateur est hors-ligne / non connecté.
 *
 * Flux :
 * - Au montage, on appelle `/auth/me` pour restaurer la session via le
 *   cookie. En cas de 401, on retombe sur la session `localStorage` pour
 *   un mode "hors-ligne" historique (utile tant que tous les comptes
 *   n'ont pas migré vers le backend).
 * - `login()` appelle `/auth/login` (argon2, rate-limit, JWT en cookie).
 *   En cas de succès, on merge l'utilisateur dans le cache local.
 *   En cas de 401, on tente un fallback localStorage (legacy accounts).
 * - `register()` appelle `/auth/register` et renvoie
 *   `{ ok: true, pendingVerification: true }` — l'utilisateur reçoit un
 *   email de confirmation avant de pouvoir se connecter.
 * - `logout()` appelle `/auth/logout` puis nettoie le state local.
 *
 * Les consommateurs de l'ancien API (`user`, `users`, `isQueen`,
 * `updateBio`, `updateProfile`) restent compatibles : la shape de
 * `User` ne change pas.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { DREYNA_PROFILE } from "../data/mock";
import { ApiError } from "../lib/api";
import {
  authLogin,
  authLogout,
  authMe,
  authRegister,
  type AuthMe,
} from "../lib/authApi";

interface StoredUser extends User {
  passwordHash: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  /** True si le backend a répondu 403 "Email non vérifié". */
  pendingEmailVerification?: boolean;
  /** True si le backend demande un code 2FA (réessaye avec totpCode). */
  requires2FA?: boolean;
  /** True si on est retombé sur le fallback localStorage (legacy). */
  legacy?: boolean;
}

export interface RegisterResult {
  ok: boolean;
  error?: string;
  /** True : compte créé, email de confirmation envoyé, pas encore connecté. */
  pendingVerification?: boolean;
  /** Message serveur à afficher à l'utilisateur (ex. "vérifie ta boîte mail"). */
  message?: string;
}

interface AuthCtx {
  user: User | null;
  users: User[];
  isQueen: boolean;
  /** `true` tant qu'on n'a pas fini le premier `/auth/me` au montage. */
  initializing: boolean;
  /** Données brutes renvoyées par `/auth/me` (email, 2FA, timestamps…). */
  backendMe: AuthMe | null;
  login: (
    email: string,
    password: string,
    options?: { totpCode?: string; recoveryCode?: string },
  ) => Promise<LoginResult>;
  register: (
    username: string,
    email: string,
    password: string,
    creatureId: string,
  ) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshBackendMe: () => Promise<AuthMe | null>;
  updateBio: (bio: string) => void;
  updateProfile: (patch: {
    username?: string;
    avatar?: string;
    bio?: string;
  }) => { ok: boolean; error?: string };
}

const Ctx = createContext<AuthCtx | null>(null);

const USERS_KEY = "vaelyndra_users_v1";
const SESSION_KEY = "vaelyndra_session_v1";

function legacyHash(input: string) {
  // Hash non cryptographique : utilisé uniquement pour le fallback
  // "legacy account" (localStorage). Les vrais comptes passent par
  // argon2id côté backend.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return `h${h}`;
}

const ROI_DES_ZEMS: StoredUser = {
  id: "user-roi-des-zems",
  username: "Le roi des zems💎",
  email: "roi@vaelyndra.realm",
  avatar: "https://api.dicebear.com/7.x/personas/svg?seed=RoiDesZems",
  role: "queen",
  joinedAt: "2024-01-01T00:00:00Z",
  bio: "Gardien du trésor du royaume — admin de Vaelyndra.",
  creatureId: "dragon",
  passwordHash: legacyHash("zemsdiamant"),
};

const DEFAULT_SEED: StoredUser[] = [
  {
    ...DREYNA_PROFILE,
    creatureId: "elfe",
    passwordHash: legacyHash("reineelfes2024"),
  },
  ROI_DES_ZEMS,
  {
    id: "user-lyria",
    username: "Lyria",
    email: "lyria@vaelyndra.realm",
    avatar: "https://i.pravatar.cc/150?u=lyria",
    role: "knight",
    joinedAt: "2022-05-14T00:00:00Z",
    bio: "Chevalière lunaire, dévouée à la reine.",
    creatureId: "gardien",
    passwordHash: legacyHash("lumiere"),
  },
  {
    id: "user-caelum",
    username: "Caelum",
    email: "caelum@vaelyndra.realm",
    avatar: "https://i.pravatar.cc/150?u=caelum",
    role: "elf",
    joinedAt: "2023-01-01T00:00:00Z",
    bio: "Archer d'argent.",
    creatureId: "elfe",
    passwordHash: legacyHash("lumiere"),
  },
];

function seedUsers(): StoredUser[] {
  const existing = localStorage.getItem(USERS_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as StoredUser[];
      if (!parsed.some((u) => u.id === ROI_DES_ZEMS.id)) {
        const merged = [...parsed, ROI_DES_ZEMS];
        localStorage.setItem(USERS_KEY, JSON.stringify(merged));
        return merged;
      }
      return parsed;
    } catch {
      /* empty */
    }
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_SEED));
  return DEFAULT_SEED;
}

/** Transforme un `AuthMe` backend en `StoredUser` local (pour sync cache). */
function normalizeRole(role: string): StoredUser["role"] {
  if (role === "admin" || role === "queen") return "queen";
  if (role === "knight") return "knight";
  return "elf";
}

function backendToStored(me: AuthMe): StoredUser {
  return {
    id: me.id,
    username: me.username,
    email: me.email ?? `${me.id}@vaelyndra.realm`,
    avatar: me.avatar_image_url || `https://i.pravatar.cc/150?u=${me.id}`,
    role: normalizeRole(me.role),
    joinedAt: me.created_at,
    bio: "",
    creatureId: me.creature_id ?? undefined,
    passwordHash: "__backend__",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<StoredUser[]>(() => seedUsers());
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  const [backendMe, setBackendMe] = useState<AuthMe | null>(null);
  const [initializing, setInitializing] = useState(true);
  const firstRun = useRef(true);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (err) {
      console.warn("Impossible de sauvegarder les utilisateurs :", err);
    }
  }, [users]);

  useEffect(() => {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  }, [userId]);

  /** Merge ou crée un `StoredUser` à partir du backend dans le cache local. */
  const syncBackendUser = useCallback((me: AuthMe) => {
    setUsers((arr) => {
      const existing = arr.find((u) => u.id === me.id);
      if (existing) {
        return arr.map((u) =>
          u.id === me.id
            ? {
                ...u,
                username: me.username,
                email: me.email ?? u.email,
                avatar: me.avatar_image_url || u.avatar,
                role: normalizeRole(me.role),
                creatureId: me.creature_id ?? u.creatureId,
              }
            : u,
        );
      }
      return [...arr, backendToStored(me)];
    });
  }, []);

  const refreshBackendMe = useCallback(async (): Promise<AuthMe | null> => {
    try {
      const me = await authMe();
      setBackendMe(me);
      if (me) {
        syncBackendUser(me);
        setUserId(me.id);
      }
      return me;
    } catch (err) {
      console.warn("authMe failed:", err);
      return null;
    }
  }, [syncBackendUser]);

  // Restaure la session depuis le cookie au premier rendu.
  useEffect(() => {
    if (!firstRun.current) return;
    firstRun.current = false;
    (async () => {
      try {
        const me = await authMe();
        if (me) {
          setBackendMe(me);
          syncBackendUser(me);
          setUserId(me.id);
        }
      } catch (err) {
        console.warn("auth bootstrap failed:", err);
      } finally {
        setInitializing(false);
      }
    })();
  }, [syncBackendUser]);

  const user = useMemo<User | null>(() => {
    if (!userId) return null;
    const u = users.find((x) => x.id === userId);
    if (!u) return null;
    const rest: User = {
      id: u.id,
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      role: u.role,
      joinedAt: u.joinedAt,
      bio: u.bio,
      creatureId: u.creatureId,
    };
    return rest;
  }, [userId, users]);

  const login = useCallback<AuthCtx["login"]>(
    async (email, password, options) => {
      // 1) Tentative backend (source de vérité).
      try {
        const res = await authLogin({
          email,
          password,
          totpCode: options?.totpCode,
          recoveryCode: options?.recoveryCode,
        });
        setBackendMe(res.user);
        syncBackendUser(res.user);
        setUserId(res.user.id);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) {
          // 2FA requis : on le signale au front pour ouvrir le champ code.
          if (err.status === 401 && /totp|2fa/i.test(err.message)) {
            return {
              ok: false,
              requires2FA: true,
              error: "Code 2FA requis pour ce compte.",
            };
          }
          if (err.status === 403 && /verif/i.test(err.message)) {
            return {
              ok: false,
              pendingEmailVerification: true,
              error:
                "Email non vérifié. Consulte ta boîte mail pour activer le compte.",
            };
          }
          if (err.status === 429) {
            return {
              ok: false,
              error:
                "Trop de tentatives. Réessaie dans quelques minutes.",
            };
          }
          // 2) Fallback legacy (localStorage) sur 401/404 — pour les
          //    comptes créés avant la migration backend.
          if (err.status === 401 || err.status === 404) {
            const local = users.find(
              (x) => x.email.toLowerCase() === email.toLowerCase(),
            );
            if (local && local.passwordHash === legacyHash(password)) {
              setUserId(local.id);
              setBackendMe(null);
              return { ok: true, legacy: true };
            }
            return {
              ok: false,
              error:
                "Identifiants incorrects — ou compte non encore migré. Recrée un compte.",
            };
          }
          return { ok: false, error: err.message || "Erreur backend." };
        }
        // Erreur réseau : fallback localStorage pour ne pas bloquer la démo.
        const local = users.find(
          (x) => x.email.toLowerCase() === email.toLowerCase(),
        );
        if (local && local.passwordHash === legacyHash(password)) {
          setUserId(local.id);
          setBackendMe(null);
          return { ok: true, legacy: true };
        }
        return { ok: false, error: "Serveur injoignable." };
      }
    },
    [users, syncBackendUser],
  );

  const register = useCallback<AuthCtx["register"]>(
    async (username, email, password, creatureId) => {
      if (username.length < 2)
        return { ok: false, error: "Votre nom elfique est trop court." };
      if (!/^\S+@\S+\.\S+$/.test(email))
        return { ok: false, error: "Un mail valide est requis." };
      if (password.length < 8)
        return {
          ok: false,
          error: "Le sortilège doit faire 8 caractères minimum.",
        };
      if (!creatureId)
        return {
          ok: false,
          error: "Choisis ta créature pour franchir le portail.",
        };
      try {
        const res = await authRegister({
          email,
          username,
          password,
          creatureId,
        });
        return {
          ok: true,
          pendingVerification: true,
          message:
            res.message ||
            "Compte créé ✨ — regarde ta boîte mail pour activer ton accès au royaume.",
        };
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409)
            return { ok: false, error: "Ce mail est déjà inscrit aux archives." };
          if (err.status === 429)
            return {
              ok: false,
              error:
                "Trop d'inscriptions récentes — réessaie dans quelques minutes.",
            };
          return { ok: false, error: err.message || "Erreur backend." };
        }
        return { ok: false, error: "Serveur injoignable." };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } catch {
      /* noop */
    }
    setUserId(null);
    setBackendMe(null);
  }, []);

  const updateBio = useCallback(
    (bio: string) => {
      if (!userId) return;
      setUsers((arr) =>
        arr.map((u) => (u.id === userId ? { ...u, bio } : u)),
      );
    },
    [userId],
  );

  const updateProfile = useCallback(
    (patch: { username?: string; avatar?: string; bio?: string }) => {
      if (!userId) return { ok: false, error: "Non connecté." };
      if (patch.username !== undefined && patch.username.trim().length < 2)
        return { ok: false, error: "Votre nom elfique est trop court." };
      if (patch.avatar !== undefined && patch.avatar.length > 200_000)
        return {
          ok: false,
          error: "Image trop grande : compresse-la ou utilise une URL.",
        };
      setUsers((arr) =>
        arr.map((u) => {
          if (u.id !== userId) return u;
          return {
            ...u,
            username:
              patch.username !== undefined ? patch.username.trim() : u.username,
            avatar:
              patch.avatar !== undefined && patch.avatar.trim().length > 0
                ? patch.avatar.trim()
                : u.avatar,
            bio: patch.bio !== undefined ? patch.bio : u.bio,
          };
        }),
      );
      return { ok: true };
    },
    [userId],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
        joinedAt: u.joinedAt,
        bio: u.bio,
        creatureId: u.creatureId,
      })),
      isQueen: user?.role === "queen",
      initializing,
      backendMe,
      login,
      register,
      logout,
      refreshBackendMe,
      updateBio,
      updateProfile,
    }),
    [
      user,
      users,
      initializing,
      backendMe,
      login,
      register,
      logout,
      refreshBackendMe,
      updateBio,
      updateProfile,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used in AuthProvider");
  return ctx;
}
