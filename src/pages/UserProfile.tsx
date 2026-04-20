import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Banknote, Coins, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarViewer } from "../components/AvatarViewer";
import { UserBadges } from "../components/UserBadges";
import { FollowButton } from "../components/FollowButton";
import SoulBondsModal from "../components/SoulBondsModal";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { WishlistSection } from "../components/WishlistSection";
import { AdminUserPanel } from "../components/AdminUserPanel";
import { ReportButton } from "../components/ReportButton";
import { formatDate, formatRelative } from "../lib/helpers";
import { formatSylvins } from "../lib/sylvins";
import { apiGetProfile, type UserProfileDto } from "../lib/api";

export function UserProfile() {
  const { userId = "" } = useParams();
  const { users, user: currentUser } = useAuth();
  const { posts, walletOf } = useStore();

  const profile = useMemo(
    () => users.find((u) => u.id === userId),
    [users, userId],
  );

  const [serverProfile, setServerProfile] = useState<UserProfileDto | null>(
    null,
  );
  const [bondsTab, setBondsTab] = useState<"followers" | "following" | null>(
    null,
  );
  useEffect(() => {
    if (!userId) return;
    // Reset immédiat : sinon l'ancien avatar serveur reste affiché pendant
    // la latence de fetch quand on passe de /u/alice à /u/bob.
    setServerProfile(null);
    let cancelled = false;
    apiGetProfile(userId)
      .then((p) => {
        if (!cancelled) setServerProfile(p);
      })
      .catch(() => {
        // Pas encore de profil serveur (ex. user jamais connecté) — on laisse
        // le fallback 2D s'afficher.
        if (!cancelled) setServerProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshServerProfile = useCallback(() => {
    if (!userId) return;
    apiGetProfile(userId)
      .then((p) => setServerProfile(p))
      .catch(() => {
        /* silencieux — on garde l'état précédent */
      });
  }, [userId]);

  if (profile && profile.role === "queen") {
    // La reine a sa propre page dédiée — on redirige pour éviter un doublon.
    return <Navigate to="/dreyna" replace />;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <SectionHeading
          eyebrow="Page manquante"
          title="Cet elfe s'est volatilisé"
        />
        <p className="mt-6 text-sm text-ivory/60">
          Le profil demandé n'existe pas dans les archives de Vaelyndra.
        </p>
        <Link to="/communaute" className="btn-gold mt-8 inline-flex">
          <ArrowLeft className="h-4 w-4" /> Retour au fil
        </Link>
      </div>
    );
  }

  const wallet = walletOf(profile.id);
  const myPosts = posts
    .filter((p) => p.authorId === profile.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <SoulBondsModal
        userId={profile.id}
        username={profile.username}
        open={bondsTab !== null}
        initialTab={bondsTab ?? "followers"}
        onClose={() => setBondsTab(null)}
      />
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal relative overflow-hidden p-8 md:p-10"
      >
        <div className="flex flex-wrap items-center gap-6">
          {serverProfile?.avatarUrl ? (
            <div className="w-32 sm:w-40">
              <AvatarViewer
                src={serverProfile.avatarUrl}
                fallbackImage={serverProfile.avatarImageUrl || profile.avatar}
                alt={profile.username}
                size="portrait"
                framing="face"
                equippedFrameId={serverProfile.equipped?.frame ?? null}
                equippedSceneId={serverProfile.equipped?.scene ?? null}
              />
            </div>
          ) : (
            <img
              src={profile.avatar}
              alt={profile.username}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50"
            />
          )}
          <div className="flex-1">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              {profile.role === "knight"
                ? "Chevalier·e lunaire"
                : "Elfe de la cour"}
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-200 md:text-4xl">
              {profile.username}
            </h1>
            <UserBadges
              creatureId={serverProfile?.creature?.id ?? profile.creatureId}
              role={serverProfile?.role}
              size="md"
              className="mt-2"
            />
            <p className="mt-2 text-sm text-ivory/60">
              Entré·e à la cour le {formatDate(profile.joinedAt)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-ivory/70">
              <button
                type="button"
                onClick={() => setBondsTab("followers")}
                className="rounded-full transition hover:text-gold-100"
              >
                <strong className="font-display text-gold-200">
                  {serverProfile?.followersCount ?? 0}
                </strong>{" "}
                âmes liées
              </button>
              <button
                type="button"
                onClick={() => setBondsTab("following")}
                className="rounded-full transition hover:text-gold-100"
              >
                <strong className="font-display text-gold-200">
                  {serverProfile?.followingCount ?? 0}
                </strong>{" "}
                liens tissés
              </button>
            </div>
            {serverProfile?.grade && (
              <div className="mt-4 max-w-sm">
                <StreamerGradeBadge grade={serverProfile.grade} size="lg" />
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {profile.role === "queen" && (
              <span className="rounded-full border border-gold-400/50 bg-gold-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-gold-200">
                <Crown className="mr-1 inline h-3 w-3" /> Trône
              </span>
            )}
            <FollowButton
              targetId={profile.id}
              targetUsername={profile.username}
              onChange={(nowFollowing) => {
                setServerProfile((prev) =>
                  prev
                    ? {
                        ...prev,
                        followersCount:
                          prev.followersCount + (nowFollowing ? 1 : -1),
                      }
                    : prev,
                );
              }}
            />
            {currentUser && currentUser.id !== profile.id && (
              <ReportButton
                targetType="user"
                targetId={profile.id}
                targetLabel={profile.username}
                targetUrl={`/u/${profile.id}`}
              />
            )}
          </div>
        </div>
        {profile.bio && (
          <p className="mt-6 text-sm text-ivory/80">{profile.bio}</p>
        )}
      </motion.header>

      <section className="mt-10">
        <AdminUserPanel
          targetUserId={profile.id}
          targetUsername={profile.username}
          onChange={refreshServerProfile}
        />
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="card-royal p-5">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-gold-300" />
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              Cadeaux offerts
            </p>
          </div>
          <p className="mt-3 font-display text-2xl text-gold-200">
            {formatSylvins(wallet.giftsSentCount)} envoyés
          </p>
        </div>
        <div className="card-royal p-5">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-gold-300" />
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              Sylvins reçus en cadeaux
            </p>
          </div>
          <p className="mt-3 font-display text-2xl text-gold-200">
            {formatSylvins(wallet.earnings)}
          </p>
        </div>
      </section>

      {serverProfile && (
        <section className="mt-10">
          <WishlistSection
            wishlist={serverProfile.wishlist ?? []}
            ownedIds={serverProfile.inventory ?? []}
            targetUserId={profile.id}
            targetUsername={profile.username}
            isSelf={currentUser?.id === profile.id}
            onGifted={refreshServerProfile}
          />
        </section>
      )}

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Fil de la cour"
          title="Ses dernières paroles"
        />
        <ul className="mt-6 space-y-4">
          {myPosts.map((p) => (
            <li key={p.id} className="card-royal p-5">
              <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
                {formatRelative(p.createdAt)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ivory/85">
                {p.content}
              </p>
            </li>
          ))}
          {myPosts.length === 0 && (
            <li className="text-center text-sm text-ivory/50">
              Silence… cet elfe n'a pas encore pris la parole.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
