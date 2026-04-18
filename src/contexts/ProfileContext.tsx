/**
 * Contexte du profil serveur (avatar 3D, inventaire, bourses Lueurs/Sylvins).
 *
 * On sépare volontairement du AuthContext qui reste purement local (users +
 * session) pour éviter de casser l'existant. Dès qu'un utilisateur se
 * connecte, on upsert son profil en base (crée si absent, idempotent) puis
 * on le met à disposition aux composants via `useProfile()`.
 *
 * Si le backend est indisponible, on retombe silencieusement sur `null` :
 * les composants affichent leurs états par défaut et le site reste utilisable.
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
import {
  apiGetProfile,
  apiUpdateAvatar,
  apiUpsertProfile,
  ApiError,
  type UserProfileDto,
} from "../lib/api";
import { useAuth } from "./AuthContext";

interface ProfileCtx {
  profile: UserProfileDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Persiste un nouvel avatar Ready Player Me (URL .glb) et sa vignette .png
   * associée. Renvoie le profil mis à jour.
   */
  saveAvatar: (patch: {
    avatarUrl: string | null;
    avatarImageUrl?: string;
  }) => Promise<UserProfileDto | null>;
  /** Permet aux autres contextes (Store) de pousser un état serveur frais. */
  setProfile: (next: UserProfileDto | null) => void;
}

const Ctx = createContext<ProfileCtx | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(false);
  // Évite les races si l'utilisateur change avant la réponse du backend.
  const inflightIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      // Reset du marker in-flight : sinon un fetch encore en cours lancé
      // par le polling avant la déconnexion pourrait ressusciter le profil
      // juste après ce setProfile(null).
      inflightIdRef.current = null;
      setProfile(null);
      return;
    }
    inflightIdRef.current = user.id;
    setLoading(true);
    try {
      // On tente d'abord le GET : le profil serveur est la source de vérité
      // et contient déjà l'avatar RPM si l'utilisateur l'a sauvegardé. On
      // n'upsert (avec l'avatar local par défaut) que si le profil n'existe
      // pas encore en base, pour ne jamais écraser un rendu RPM existant.
      let fresh: UserProfileDto;
      try {
        fresh = await apiGetProfile(user.id);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        fresh = await apiUpsertProfile({
          id: user.id,
          username: user.username,
          avatarImageUrl: user.avatar,
        });
      }
      if (inflightIdRef.current !== user.id) return;
      setProfile(fresh);
    } catch (err) {
      console.warn("Profil serveur indisponible :", err);
      if (inflightIdRef.current === user.id) setProfile(null);
    } finally {
      if (inflightIdRef.current === user.id) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // Charge le profil à l'arrivée de l'utilisateur. Le setState est
    // déclenché via le callback async de `refresh`, pas synchroniquement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const saveAvatar = useCallback(
    async (patch: {
      avatarUrl: string | null;
      avatarImageUrl?: string;
    }): Promise<UserProfileDto | null> => {
      if (!user) return null;
      try {
        const updated = await apiUpdateAvatar(user.id, {
          avatarUrl: patch.avatarUrl,
          avatarImageUrl: patch.avatarImageUrl,
        });
        setProfile(updated);
        return updated;
      } catch (err) {
        console.warn("Échec sauvegarde avatar :", err);
        throw err;
      }
    },
    [user],
  );

  useEffect(() => {
    // Rafraîchit en fond toutes les 60 s pour capter les crédits Lueurs/Sylvins
    // servis par d'autres devices (achats Stripe, daily claim…).
    if (!user) return;
    const id = setInterval(async () => {
      try {
        const fresh = await apiGetProfile(user.id);
        if (inflightIdRef.current !== user.id) return;
        setProfile(fresh);
      } catch {
        /* silencieux */
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [user]);

  const value = useMemo<ProfileCtx>(
    () => ({ profile, loading, refresh, saveAvatar, setProfile }),
    [profile, loading, refresh, saveAvatar],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfile must be used in ProfileProvider");
  return ctx;
}
