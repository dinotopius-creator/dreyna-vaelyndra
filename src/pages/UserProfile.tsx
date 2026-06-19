import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Banknote,
  Coins,
  ArrowLeft,
  Camera,
  Check,
  Gift,
  Loader2,
  MessageCircle,
  Play,
  Trash2,
  X,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarViewer } from "../components/AvatarViewer";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { FollowButton } from "../components/FollowButton";
import { FamiliarPortrait } from "../components/FamiliarPortrait";
import SoulBondsModal from "../components/SoulBondsModal";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { WishlistSection } from "../components/WishlistSection";
import { AdminUserPanel } from "../components/AdminUserPanel";
import { ReportButton } from "../components/ReportButton";
import { AvatarProfileBanner } from "../components/AvatarProfileBanner";
import { formatDate, formatRelative } from "../lib/helpers";
import { roleLabelWithIcon } from "../lib/roleLabel";
import { formatSylvins } from "../lib/sylvins";
import { apiDeletePost, apiGetProfile, apiUpdatePost, apiUploadCommunityImage, type UserProfileDto } from "../lib/api";
import {
  fetchUserFamiliars,
  giftFamiliar,
  EVOLUTION_TIERS,
  RARITY_LABELS,
  type OwnedFamiliar,
} from "../lib/familiarsApi";
import { useToast } from "../contexts/ToastContext";
import type { User } from "../types";

export function UserProfile() {
  const { userId = "" } = useParams();
  const { users, user: currentUser } = useAuth();
  const { posts, walletOf, dispatch } = useStore();
  const { notify } = useToast();

  const localProfile = useMemo(
    () => users.find((u) => u.id === userId),
    [users, userId],
  );

  const [serverProfile, setServerProfile] = useState<UserProfileDto | null>(
    null,
  );
  // "loading" tant que le fetch tourne, "ok" si 2xx, "missing" si 404 /
  // erreur serveur explicite. On n'affiche l'écran "profil disparu" QUE
  // si le fetch serveur est en "missing" ET qu'on n'a pas non plus le
  // profil en cache local — sinon un admin qui clique sur un autre user
  // depuis /admin (donc pas dans `users` local) voyait la page vide.
  const [serverState, setServerState] = useState<"loading" | "ok" | "missing">(
    "loading",
  );
  const [bondsTab, setBondsTab] = useState<"followers" | "following" | null>(
    null,
  );
  const [activeFamiliar, setActiveFamiliar] = useState<OwnedFamiliar | null>(
    null,
  );
  const [giftAmount, setGiftAmount] = useState("");
  const [giftSending, setGiftSending] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [thumbnailEditorPostId, setThumbnailEditorPostId] = useState<string | null>(null);
  const [thumbnailUrlDraft, setThumbnailUrlDraft] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailSaving, setThumbnailSaving] = useState(false);
  const thumbnailPreviewUrl = useMemo(() => {
    if (!thumbnailFile) return null;
    return URL.createObjectURL(thumbnailFile);
  }, [thumbnailFile]);

  useEffect(() => {
    return () => {
      if (thumbnailPreviewUrl) {
        URL.revokeObjectURL(thumbnailPreviewUrl);
      }
    };
  }, [thumbnailPreviewUrl]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUserFamiliars(userId)
      .then((col) => {
        if (!cancelled) {
          setActiveFamiliar(col.owned.find((f) => f.isActive) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveFamiliar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) return;
      // Reset différé d'un tick : évite le setState synchrone dans l'effet
      // tout en retirant l'ancien avatar serveur avant la réponse réseau.
      setServerProfile(null);
      setServerState("loading");
    }, 0);
    apiGetProfile(userId)
      .then((p) => {
        if (!cancelled) {
          setServerProfile(p);
          setServerState("ok");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerProfile(null);
          setServerState("missing");
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [userId]);

  const refreshServerProfile = useCallback(() => {
    if (!userId) return;
    apiGetProfile(userId)
      .then((p) => {
        setServerProfile(p);
        setServerState("ok");
      })
      .catch(() => {
        /* silencieux — on garde l'état précédent */
      });
  }, [userId]);

  // Fallback : si le profil n'est pas dans le cache local `users`
  // (cas typique : admin qui clique sur un user arbitraire depuis la
  // liste admin, user jamais rencontré dans ce navigateur…) on
  // reconstruit un objet `User`-compatible à partir du DTO serveur.
  const profile = useMemo(() => {
    if (localProfile) return localProfile;
    if (!serverProfile) return undefined;
    const fallback: User = {
      id: serverProfile.id,
      username: serverProfile.username,
      handle: serverProfile.handle ?? undefined,
      email: `${serverProfile.id}@vaelyndra.realm`,
      avatar:
        serverProfile.avatarImageUrl ||
        `https://i.pravatar.cc/150?u=${serverProfile.id}`,
      role:
        serverProfile.role === "admin"
          ? "queen"
          : serverProfile.role === "animator"
            ? "knight"
            : "elf",
      joinedAt: serverProfile.createdAt,
      bio: "",
      creatureId: serverProfile.creature?.id,
    };
    return fallback;
  }, [localProfile, serverProfile]);

  if (!profile) {
    // Aucune donnée locale ET pas de profil serveur : soit le fetch est
    // encore en cours (on reste silencieux), soit il a renvoyé 404 (on
    // affiche l'écran "disparu").
    if (serverState === "loading") {
      return (
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-sm text-ivory/50">Chargement du profil…</p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <SectionHeading eyebrow="Page manquante" title="Ce profil a disparu" />
        <p className="mt-6 text-sm text-ivory/60">
          Le profil demandé n'existe pas (ou plus) sur Vaelyndra.
        </p>
        <Link to="/communaute" className="btn-gold mt-8 inline-flex">
          <ArrowLeft className="h-4 w-4" /> Retour au fil
        </Link>
      </div>
    );
  }

  const wallet = walletOf(profile.id);
  const profileId = profile.id;
  const myPosts = posts
    .filter((p) => p.authorId === profileId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  async function deleteOwnPost(postId: string) {
    if (!currentUser || currentUser.id !== profileId) return;
    const confirmed = window.confirm(
      "Supprimer ce post ? Cette action est définitive.",
    );
    if (!confirmed) return;

    setDeletingPostId(postId);
    try {
      await apiDeletePost(postId, currentUser.id);
      dispatch({ type: "deletePost", id: postId });
      notify("Post supprimé.", "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossible de supprimer le post.",
        "error",
      );
    } finally {
      setDeletingPostId(null);
    }
  }

  function openThumbnailEditor(postId: string) {
    const post = myPosts.find((entry) => entry.id === postId);
    if (!post) return;
    setThumbnailEditorPostId(postId);
    setThumbnailUrlDraft(post.videoThumbnailUrl ?? "");
    setThumbnailFile(null);
  }

  async function saveThumbnail() {
    if (!currentUser || currentUser.id !== profileId || !thumbnailEditorPostId) return;
    const post = myPosts.find((entry) => entry.id === thumbnailEditorPostId);
    if (!post) return;
    setThumbnailSaving(true);
    try {
      let uploadedUrl = thumbnailUrlDraft.trim();
      if (thumbnailFile) {
        const uploaded = await apiUploadCommunityImage(thumbnailFile);
        uploadedUrl = uploaded.imageUrl;
      }
      const updated = await apiUpdatePost(post.id, {
        userId: currentUser.id,
        videoThumbnailUrl: uploadedUrl || undefined,
      });
      dispatch({ type: "replacePost", post: updated });
      notify("Miniature mise à jour.", "success");
      setThumbnailEditorPostId(null);
      setThumbnailUrlDraft("");
      setThumbnailFile(null);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossible de modifier la miniature.",
        "error",
      );
    } finally {
      setThumbnailSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-8 sm:px-6 sm:py-14">
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
        className="card-royal relative overflow-hidden p-4 sm:p-8 md:p-10"
      >
        <AvatarProfileBanner
          title={profile.username}
          subtitle="Les avatars complets vivent désormais dans un studio dédié. Le profil se contente d'une bannière élégante qui ouvre l'espace Avatar 3D."
          cta="Entrer dans l'atelier Avatar"
        />
        <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          {serverProfile?.avatarUrl ? (
            <div className="hidden w-24 sm:w-32 md:w-40">
              <AvatarViewer
                src={serverProfile.avatarUrl}
                fallbackImage={serverProfile.avatarImageUrl || profile.avatar}
                alt={profile.username}
                size="portrait"
                framing="face"
                equippedFrameId={serverProfile.equipped?.frame ?? null}
                equippedSceneId={serverProfile.equipped?.scene ?? null}
                equippedOutfit3DId={serverProfile.equipped?.outfit3d ?? null}
                equippedAccessory3DId={
                  serverProfile.equipped?.accessory3d ?? null
                }
              />
            </div>
          ) : (
            <img
              src={profile.avatar}
              alt={profile.username}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50 sm:h-28 sm:w-28"
            />
          )}
          <div className="w-full flex-1">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              {roleLabelWithIcon(serverProfile?.role ?? profile.role)}
            </p>
            <h1 className="mt-1 font-display text-2xl text-gold-200 sm:text-3xl md:text-4xl">
              {profile.username}
            </h1>
            {/* PR S — `@handle` public juste sous le pseudo. */}
            <Handle
              handle={serverProfile?.handle ?? profile.handle}
              size="base"
              className="mt-0.5 block"
            />
            <UserBadges
              creatureId={serverProfile?.creature?.id ?? profile.creatureId}
              role={serverProfile?.role}
              size="md"
              className="mt-2"
            />
            <p className="mt-2 text-sm text-ivory/60">
              Inscrit·e le {formatDate(profile.joinedAt)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
              <Link
                to="/avatar"
                className="panel-app-soft flex items-center justify-between p-3 text-left"
              >
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                    Avatar
                  </span>
                  <span className="mt-1 block font-display text-sm text-gold-100">
                    Ouvrir le studio
                  </span>
                </span>
                <Sparkles className="h-4 w-4 text-gold-200" />
              </Link>
              <Link
                to="/familier"
                className="panel-app-soft flex items-center justify-between p-3 text-left"
              >
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-ivory/45">
                    Familier
                  </span>
                  <span className="mt-1 block font-display text-sm text-gold-100">
                    Gérer
                  </span>
                </span>
                <Gift className="h-4 w-4 text-gold-200" />
              </Link>
            </div>
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
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
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
              <Link
                to={`/messages/${encodeURIComponent(profile.id)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20"
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer un message
              </Link>
            )}
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

      <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-royal p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-300" />
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              Lueurs possedees
            </p>
          </div>
          <p className="mt-3 font-display text-2xl text-gold-200">
            {serverProfile ? serverProfile.lueurs.toLocaleString("fr-FR") : "—"}
          </p>
        </div>
        <div className="card-royal p-5">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-gold-300" />
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              Sylvins possedes
            </p>
          </div>
          <p className="mt-3 font-display text-2xl text-gold-200">
            {serverProfile ? formatSylvins(serverProfile.sylvins) : "—"}
          </p>
        </div>
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

      {activeFamiliar && (
        <section className="mt-10">
          <SectionHeading
            align="left"
            eyebrow="Familier"
            title={`${activeFamiliar.nickname || activeFamiliar.name}`}
          />
          <motion.div
            className="card-royal mt-4 overflow-hidden p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${activeFamiliar.color}44, transparent 70%)`,
              }}
              aria-hidden
            />
            <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
              <FamiliarPortrait familiar={activeFamiliar} size="md" />

              <div className="flex-1 text-center sm:text-left">
                <h3 className="font-display text-xl text-gold-200">
                  {activeFamiliar.nickname || activeFamiliar.name}
                </h3>
                <p className="mt-0.5 text-xs text-ivory/55">
                  {activeFamiliar.name} —{" "}
                  {RARITY_LABELS[activeFamiliar.rarity] ??
                    activeFamiliar.rarity}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-200">
                    Niveau {activeFamiliar.level}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ivory/15 bg-night-700/60 px-3 py-1 text-xs text-ivory/70">
                    {
                      (
                        EVOLUTION_TIERS[activeFamiliar.evolution.id] ?? {
                          emoji: "✨",
                          label: activeFamiliar.evolution.name,
                        }
                      ).emoji
                    }{" "}
                    {
                      (
                        EVOLUTION_TIERS[activeFamiliar.evolution.id] ?? {
                          label: activeFamiliar.evolution.name,
                        }
                      ).label
                    }
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-ivory/50">
                    <span>Progression</span>
                    <span>
                      {activeFamiliar.xpIntoLevel} /{" "}
                      {activeFamiliar.xpToNextLevel > 0
                        ? activeFamiliar.xpToNextLevel
                        : "MAX"}{" "}
                      XP
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-night-700">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${activeFamiliar.color}, ${activeFamiliar.color}cc)`,
                      }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${activeFamiliar.xpToNextLevel <= 0 ? 100 : Math.min(100, Math.round((activeFamiliar.xpIntoLevel / activeFamiliar.xpToNextLevel) * 100))}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ivory/40">
                    XP totale : {activeFamiliar.xp}
                  </p>
                </div>

                {currentUser && currentUser.id !== userId && (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[10, 50, 100, 500].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftAmount(String(preset))}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            giftAmount === String(preset)
                              ? "border-gold-400/70 bg-gold-500/20 text-gold-200"
                              : "border-royal-500/30 text-ivory/60 hover:border-gold-400/40 hover:text-gold-200"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        placeholder="Autre"
                        value={giftAmount}
                        onChange={(e) => setGiftAmount(e.target.value)}
                        className="w-20 rounded-full border border-royal-500/30 bg-night-800/60 px-3 py-1 text-center text-xs text-ivory/90 outline-none focus:border-gold-400/60"
                      />
                      <span className="text-[11px] text-ivory/40">Sylvins</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          giftSending || !giftAmount || Number(giftAmount) < 1
                        }
                        onClick={async () => {
                          const amt = Number(giftAmount);
                          if (!currentUser || amt < 1) return;
                          setGiftSending(true);
                          try {
                            const result = await giftFamiliar(
                              userId,
                              currentUser.id,
                              amt,
                            );
                            notify(
                              `${result.familiarIcon} +${result.xpGranted} XP pour ${result.familiarName} ! (Niveau ${result.newLevel})`,
                              "success",
                            );
                            setGiftAmount("");
                            setActiveFamiliar((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    xp: result.newXp,
                                    level: result.newLevel,
                                  }
                                : prev,
                            );
                            fetchUserFamiliars(userId)
                              .then((col) => {
                                setActiveFamiliar(
                                  col.owned.find((f) => f.isActive) ?? null,
                                );
                              })
                              .catch(() => {});
                          } catch (e: unknown) {
                            const msg =
                              e instanceof Error && e.message
                                ? e.message
                                : "Échec de l'offrande.";
                            notify(msg, "error");
                          } finally {
                            setGiftSending(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/20 px-4 py-1.5 text-xs font-semibold text-gold-200 transition hover:bg-gold-500/30 disabled:opacity-50"
                      >
                        {giftSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Gift className="h-3.5 w-3.5" />
                        )}
                        Offrir{" "}
                        {giftAmount ? `${giftAmount} Sylvins` : "au familier"}
                      </button>
                    </div>
                    <p className="text-[11px] text-ivory/40">
                      1 Sylvin = 1 XP pour le familier. Ton familier gagne aussi
                      1 XP tous les 3 Sylvins offerts.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      )}

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
          eyebrow="Publications"
          title="Ses dernières publications"
        />
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {myPosts.map((p) => {
            const likes = Object.values(p.reactions ?? {}).reduce(
              (acc, users) => acc + users.length,
              0,
            );
            const isVideo = Boolean(p.videoUrl);
            const poster = p.videoThumbnailUrl || p.imageUrl || "";
            return (
              <li
                key={p.id}
                className="group relative overflow-hidden rounded-[22px] border border-white/8 bg-night-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
              >
                <Link
                  to={`/communaute/post/${p.id}`}
                  className="absolute inset-0 z-10"
                  aria-label={`Ouvrir le post de ${profile.username}`}
                />
                <article className="relative flex aspect-[4/5] flex-col overflow-hidden">
                  <div className="absolute inset-0 bg-night-950">
                    {poster ? (
                      <img
                        src={poster}
                        alt={p.content}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : isVideo ? (
                      <video
                        src={p.videoUrl}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        loop
                        autoPlay
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_35%),linear-gradient(180deg,#18111f,#09060d)] px-3 text-center">
                        <p className="line-clamp-8 whitespace-pre-wrap text-[11px] leading-5 text-ivory/88">
                          {p.content}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.08)_35%,rgba(2,6,23,0.88)_100%)]" />

                  {isVideo && (
                    <div className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-night-950/70 text-white/85 backdrop-blur-md">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </div>
                  )}

                  {currentUser?.id === profileId && (
                    <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openThumbnailEditor(p.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-night-950/75 text-gold-100 backdrop-blur-md transition hover:border-gold-300/45 hover:text-gold-50"
                        aria-label="Modifier la miniature"
                      >
                        <Camera className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void deleteOwnPost(p.id);
                        }}
                        disabled={deletingPostId === p.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-night-950/75 text-rose-200 backdrop-blur-md transition hover:border-rose-300/50 hover:text-rose-100 disabled:opacity-60"
                        aria-label="Supprimer mon post"
                      >
                        {deletingPostId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 z-20 p-2.5">
                    <div className="rounded-[18px] border border-white/10 bg-night-950/72 p-2.5 backdrop-blur-md">
                      <p className="line-clamp-2 text-[11px] leading-4 text-ivory/88">
                        {p.content}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ivory/55">
                        <span>{likes} likes</span>
                        <span>{p.comments.length} comm.</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2.5 pt-2.5 text-[10px] uppercase tracking-[0.18em] text-ivory/60">
                    <span>{isVideo ? "Vidéo" : p.imageUrl ? "Photo" : "Texte"}</span>
                    <span>{formatRelative(p.createdAt)}</span>
                  </div>
                </article>
              </li>
            );
          })}
          {myPosts.length === 0 && (
            <li className="col-span-full rounded-[24px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
              Ce membre n'a pas encore publié.
            </li>
          )}
        </ul>
      </section>

      {thumbnailEditorPostId && (
        <div className="fixed inset-0 z-[260] bg-night-950/85 backdrop-blur-md">
          <div className="flex h-full w-full items-end justify-center p-4 sm:items-center">
            <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-night-950 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
                    Miniature
                  </p>
                  <h3 className="mt-1 font-display text-2xl text-gold-100">
                    Modifier la miniature
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setThumbnailEditorPostId(null);
                    setThumbnailUrlDraft("");
                    setThumbnailFile(null);
                  }}
                  className="rounded-full border border-white/10 p-2 text-ivory/60"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/70">
                Choisis une image de couverture pour ce post. Elle sera affichée dans
                la grille du profil et en aperçu.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
                    Importer une image
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) =>
                      setThumbnailFile(event.target.files?.[0] ?? null)
                    }
                    className="glass-input mt-2 w-full"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
                    Ou coller une URL d’image
                  </span>
                  <input
                    value={thumbnailUrlDraft}
                    onChange={(event) => setThumbnailUrlDraft(event.target.value)}
                    placeholder="https://…"
                    className="glass-input mt-2 w-full"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/10 bg-night-900/65 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ivory/55">
                  Aperçu
                </p>
                <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-night-800">
                  {thumbnailPreviewUrl ? (
                    <img
                      src={thumbnailPreviewUrl}
                      alt="Aperçu miniature"
                      className="h-full w-full object-cover"
                    />
                  ) : thumbnailUrlDraft.trim() ? (
                    <img
                      src={thumbnailUrlDraft.trim()}
                      alt="Aperçu miniature"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_35%),linear-gradient(180deg,#18111f,#09060d)] px-4 text-center">
                      <p className="text-sm leading-6 text-ivory/70">
                        La miniature actuelle sera remplacée ici.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setThumbnailEditorPostId(null);
                    setThumbnailUrlDraft("");
                    setThumbnailFile(null);
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void saveThumbnail()}
                  disabled={thumbnailSaving}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500/20 px-4 py-2 text-sm font-semibold text-gold-100 disabled:opacity-60"
                >
                  {thumbnailSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sauvegarde…
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
