/**
 * Bouton Suivre / Ne plus suivre.
 *
 * Source de vérité : l'endpoint `/users/{target_id}/follow-status` renvoie
 * l'état courant pour le follower connecté. On le synchronise côté client
 * avec un state optimiste pour masquer la latence réseau.
 *
 * Si l'utilisateur n'est pas connecté, ou s'il regarde son propre profil,
 * le composant ne rend rien (pas de self-follow possible).
 */
import { useEffect, useState } from "react";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { apiFollowStatus } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

interface FollowButtonProps {
  targetId: string;
  targetUsername?: string;
  /**
   * Callback invoqué après un follow/unfollow réussi, pour permettre au
   * parent de rafraîchir son compteur sans round-trip réseau.
   */
  onChange?: (nowFollowing: boolean) => void;
  size?: "sm" | "md";
}

export function FollowButton({
  targetId,
  targetUsername,
  onChange,
  size = "md",
}: FollowButtonProps) {
  const { user } = useAuth();
  const { follow, unfollow } = useProfile();
  const { notify } = useToast();
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user || user.id === targetId) {
      setIsFollowing(null);
      return;
    }
    // Reset avant fetch : sinon, si le composant reste monté en naviguant
    // d'un profil à l'autre, le bouton affiche l'état du profil précédent
    // tant que la nouvelle réponse n'est pas arrivée.
    setIsFollowing(null);
    let cancelled = false;
    apiFollowStatus(targetId, user.id)
      .then((res) => {
        if (!cancelled) setIsFollowing(res.following);
      })
      .catch(() => {
        if (!cancelled) setIsFollowing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, targetId]);

  if (!user || user.id === targetId || isFollowing === null) {
    return null;
  }

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    const previous = isFollowing;
    // UI optimiste : on flip tout de suite, on rollback si l'API échoue.
    setIsFollowing(!previous);
    try {
      if (previous) {
        await unfollow(targetId);
        notify(
          targetUsername
            ? `Tu ne suis plus ${targetUsername}.`
            : "Abonnement retiré.",
        );
      } else {
        await follow(targetId);
        notify(
          targetUsername
            ? `Tu suis maintenant ${targetUsername} ✨`
            : "Abonnement scellé ✨",
        );
      }
      onChange?.(!previous);
    } catch {
      setIsFollowing(previous);
      notify("Le sortilège d'abonnement a échoué.");
    } finally {
      setPending(false);
    }
  };

  const sizeClasses =
    size === "sm"
      ? "px-3 py-1 text-xs"
      : "px-4 py-1.5 text-sm";

  if (isFollowing) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full border border-ivory/20 bg-night-800/60 ${sizeClasses} font-regal tracking-wide text-ivory/80 transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-60`}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserMinus className="h-3.5 w-3.5" />
        )}
        Abonné·e
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-500/15 ${sizeClasses} font-regal tracking-wide text-gold-100 transition hover:border-gold-300 hover:bg-gold-500/25 disabled:opacity-60`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" />
      )}
      Suivre
    </button>
  );
}
