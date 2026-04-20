import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { DREYNA_PROFILE } from "../data/mock";

interface StoredUser extends User {
  passwordHash: string;
}

interface AuthCtx {
  user: User | null;
  users: User[];
  isQueen: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  register: (
    username: string,
    email: string,
    password: string,
    creatureId: string,
  ) => { ok: boolean; error?: string };
  logout: () => void;
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

function hash(input: string) {
  // Pas un vrai hash sécurisé — suffisant pour démo locale.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return `h${h}`;
}

// Compte admin officiel (miroir de `backend/app/main.py:OFFICIAL_ACCOUNTS` +
// `src/data/officials.ts`). Role "queen" côté frontend pour débloquer la
// Salle du Trône (isQueen === role === "queen") ; le badge 💎 admin vient
// du ProfileContext (role serveur "admin") via `OFFICIALS`.
const ROI_DES_ZEMS: StoredUser = {
  id: "user-roi-des-zems",
  username: "Le roi des zems💎",
  email: "roi@vaelyndra.realm",
  avatar: "https://api.dicebear.com/7.x/personas/svg?seed=RoiDesZems",
  role: "queen",
  joinedAt: "2024-01-01T00:00:00Z",
  bio: "Gardien du trésor du royaume — admin de Vaelyndra.",
  creatureId: "dragon",
  passwordHash: hash("zemsdiamant"),
};

const DEFAULT_SEED: StoredUser[] = [
  {
    ...DREYNA_PROFILE,
    creatureId: "elfe",
    passwordHash: hash("vaelyndra"),
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
    passwordHash: hash("lumiere"),
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
    passwordHash: hash("lumiere"),
  },
];

function seedUsers(): StoredUser[] {
  const existing = localStorage.getItem(USERS_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as StoredUser[];
      // Migration : ajoute le compte admin "Le roi des zems💎" aux
      // installations existantes qui ont un localStorage pré-PR. On ne
      // touche pas aux comptes utilisateur existants (y compris Dreyna
      // s'ils l'ont personnalisée).
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<StoredUser[]>(() => seedUsers());
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );

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

  const user = useMemo<User | null>(() => {
    if (!userId) return null;
    const u = users.find((x) => x.id === userId);
    if (!u) return null;
    // strip passwordHash
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

  const login = useCallback(
    (email: string, password: string) => {
      const u = users.find(
        (x) => x.email.toLowerCase() === email.toLowerCase(),
      );
      if (!u) return { ok: false, error: "Aucun elfe ne porte ce nom à la cour." };
      if (u.passwordHash !== hash(password))
        return { ok: false, error: "Le sortilège d'entrée est incorrect." };
      setUserId(u.id);
      return { ok: true };
    },
    [users],
  );

  const register = useCallback(
    (
      username: string,
      email: string,
      password: string,
      creatureId: string,
    ) => {
      if (username.length < 2)
        return { ok: false, error: "Votre nom elfique est trop court." };
      if (!/^\S+@\S+\.\S+$/.test(email))
        return { ok: false, error: "Un mail valide est requis." };
      if (password.length < 4)
        return { ok: false, error: "Le sortilège doit faire 4 caractères." };
      if (!creatureId)
        return { ok: false, error: "Choisis ta créature pour franchir le portail." };
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
        return { ok: false, error: "Ce mail est déjà inscrit aux archives." };
      const id = `user-${Math.random().toString(36).slice(2, 9)}`;
      const newUser: StoredUser = {
        id,
        username,
        email,
        avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
        role: "elf",
        joinedAt: new Date().toISOString(),
        bio: "Nouvel enfant de Vaelyndra.",
        creatureId,
        passwordHash: hash(password),
      };
      setUsers((arr) => [...arr, newUser]);
      setUserId(id);
      return { ok: true };
    },
    [users],
  );

  const logout = useCallback(() => setUserId(null), []);

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
      login,
      register,
      logout,
      updateBio,
      updateProfile,
    }),
    [user, users, login, register, logout, updateBio, updateProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used in AuthProvider");
  return ctx;
}
