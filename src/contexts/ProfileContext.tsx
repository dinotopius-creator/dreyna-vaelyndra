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
  apiAddToWishlist,
  apiApplyWalletDelta,
  apiDailyClaim,
  apiFollow,
  apiGetProfile,
  apiGiftItem,
  apiRemoveFromWishlist,
  apiSetCreature,
  apiUnfollow,
  apiUpdateAvatar,
  apiUpdateInventory,
  apiUpsertProfile,
  ApiError,
  type DailyClaimDto,
  type GiftItemDto,
  type UserProfileDto,
} from "../lib/api";
import { useAuth } from "./AuthContext";

interface ProfileCtx {
  profile: UserProfileDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Persiste un nouvel avatar (URL DiceBear SVG, ou .glb légacy) et sa
   * vignette associée. Renvoie le profil mis à jour.
   */
  saveAvatar: (patch: {
    avatarUrl: string | null;
    avatarImageUrl?: string;
  }) => Promise<UserProfileDto | null>;
  /**
   * Achète un item cosmétique : débite la bourse, ajoute l'item à
   * l'inventaire. Refuse si le solde est insuffisant.
   */
  buyItem: (input: {
    itemId: string;
    currency: "lueurs" | "sylvins";
    price: number;
  }) => Promise<UserProfileDto | null>;
  /** Équipe ou retire un item dans un slot (ex. `frame`). */
  setEquipped: (
    slot: string,
    itemId: string | null,
  ) => Promise<UserProfileDto | null>;
  /** Réclame la récompense quotidienne (serveur gère cooldown). */
  claimDaily: () => Promise<DailyClaimDto | null>;
  /** Enregistre/change la créature (slug du catalogue figé). */
  setCreature: (creatureId: string) => Promise<UserProfileDto | null>;
  /** S'abonne à un autre user. */
  follow: (targetId: string) => Promise<UserProfileDto | null>;
  /** Se désabonne. */
  unfollow: (targetId: string) => Promise<UserProfileDto | null>;
  /** PR G — Ajoute un item à sa propre wishlist (idempotent côté serveur). */
  addToWishlist: (itemId: string) => Promise<UserProfileDto | null>;
  /** PR G — Retire un item de sa propre wishlist. */
  removeFromWishlist: (itemId: string) => Promise<UserProfileDto | null>;
  /**
   * PR G — Offre un item cosmétique depuis la wishlist d'un autre user.
   * Le serveur débite la bourse de l'expéditeur, ajoute l'item à
   * l'inventaire du destinataire et le retire de sa wishlist.
   */
  giftItem: (input: {
    receiverId: string;
    itemId: string;
    price: number;
    currency: "lueurs" | "sylvins";
  }) => Promise<GiftItemDto | null>;
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
      // et contient déjà l'avatar sauvegardé. On n'upsert (avec l'avatar
      // local par défaut) que si le profil n'existe pas encore en base, pour
      // ne jamais écraser un rendu déjà scellé.
      let fresh: UserProfileDto;
      try {
        fresh = await apiGetProfile(user.id);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        fresh = await apiUpsertProfile({
          id: user.id,
          username: user.username,
          avatarImageUrl: user.avatar,
          creatureId: user.creatureId,
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

  const setCreature = useCallback(
    async (creatureId: string): Promise<UserProfileDto | null> => {
      if (!user) return null;
      try {
        const updated = await apiSetCreature(user.id, creatureId);
        setProfile(updated);
        return updated;
      } catch (err) {
        console.warn("Échec choix créature :", err);
        throw err;
      }
    },
    [user],
  );

  const follow = useCallback(
    async (targetId: string): Promise<UserProfileDto | null> => {
      if (!user) return null;
      try {
        const target = await apiFollow(user.id, targetId);
        // Refresh profil courant pour mettre à jour `followingCount`.
        void refresh();
        return target;
      } catch (err) {
        console.warn("Échec follow :", err);
        throw err;
      }
    },
    [user, refresh],
  );

  const unfollow = useCallback(
    async (targetId: string): Promise<UserProfileDto | null> => {
      if (!user) return null;
      try {
        const target = await apiUnfollow(user.id, targetId);
        void refresh();
        return target;
      } catch (err) {
        console.warn("Échec unfollow :", err);
        throw err;
      }
    },
    [user, refresh],
  );

  const buyItem = useCallback(
    async (input: {
      itemId: string;
      currency: "lueurs" | "sylvins";
      price: number;
    }): Promise<UserProfileDto | null> => {
      if (!user) return null;
      // L'achat est en deux appels (débit de bourse puis ajout inventaire) :
      // faute d'endpoint atomique côté backend, on applique le pattern "saga"
      // avec une transaction compensatoire si l'étape 2 échoue, pour éviter
      // de laisser l'utilisateur débité sans item.
      // 1) Débit de la bourse (le backend rejette 400 si solde insuffisant).
      const debited = await apiApplyWalletDelta(user.id, {
        [input.currency]: -input.price,
        reason: `buy:${input.itemId}`,
      } as { lueurs?: number; sylvins?: number; reason?: string });
      // Synchronise l'état local dès le débit réussi : si le reste échoue on
      // a au moins le bon solde affiché, et le toast d'erreur ne sera pas
      // suivi d'une illusion de "solde inchangé" qui pousserait à réessayer.
      setProfile(debited);
      // 2) Ajout à l'inventaire (le serveur déduplique). Si ça plante, on
      // recrédite immédiatement la bourse.
      try {
        const currentInventory = debited.inventory ?? [];
        const updated = await apiUpdateInventory(user.id, {
          inventory: [...currentInventory, input.itemId],
        });
        setProfile(updated);
        return updated;
      } catch (err) {
        try {
          const refunded = await apiApplyWalletDelta(user.id, {
            [input.currency]: input.price,
            reason: `refund:${input.itemId}`,
          } as { lueurs?: number; sylvins?: number; reason?: string });
          setProfile(refunded);
        } catch (refundErr) {
          console.error(
            "Achat partiellement échoué — remboursement KO :",
            refundErr,
          );
        }
        throw err;
      }
    },
    [user],
  );

  const setEquipped = useCallback(
    async (
      slot: string,
      itemId: string | null,
    ): Promise<UserProfileDto | null> => {
      if (!user || !profile) return null;
      const next = { ...(profile.equipped ?? {}) };
      if (itemId) next[slot] = itemId;
      else delete next[slot];
      const updated = await apiUpdateInventory(user.id, { equipped: next });
      setProfile(updated);
      return updated;
    },
    [user, profile],
  );

  const addToWishlist = useCallback(
    async (itemId: string): Promise<UserProfileDto | null> => {
      if (!user) return null;
      const updated = await apiAddToWishlist(user.id, itemId);
      setProfile(updated);
      return updated;
    },
    [user],
  );

  const removeFromWishlist = useCallback(
    async (itemId: string): Promise<UserProfileDto | null> => {
      if (!user) return null;
      const updated = await apiRemoveFromWishlist(user.id, itemId);
      setProfile(updated);
      return updated;
    },
    [user],
  );

  const giftItem = useCallback(
    async (input: {
      receiverId: string;
      itemId: string;
      price: number;
      currency: "lueurs" | "sylvins";
    }): Promise<GiftItemDto | null> => {
      if (!user) return null;
      const res = await apiGiftItem({
        senderId: user.id,
        receiverId: input.receiverId,
        itemId: input.itemId,
        price: input.price,
        currency: input.currency,
        reason: `gift-item:${input.itemId}`,
      });
      // On met à jour le profil local avec le sender renvoyé (ne pas oublier
      // que l'appelant est forcément le sender — le receiver vit ailleurs).
      setProfile(res.sender);
      return res;
    },
    [user],
  );

  const claimDaily = useCallback(async (): Promise<DailyClaimDto | null> => {
    if (!user) return null;
    const res = await apiDailyClaim(user.id);
    setProfile(res.profile);
    return res;
  }, [user]);

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
    () => ({
      profile,
      loading,
      refresh,
      saveAvatar,
      buyItem,
      setEquipped,
      claimDaily,
      setCreature,
      follow,
      unfollow,
      addToWishlist,
      removeFromWishlist,
      giftItem,
      setProfile,
    }),
    [
      profile,
      loading,
      refresh,
      saveAvatar,
      buyItem,
      setEquipped,
      claimDaily,
      setCreature,
      follow,
      unfollow,
      addToWishlist,
      removeFromWishlist,
      giftItem,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfile must be used in ProfileProvider");
  return ctx;
}
