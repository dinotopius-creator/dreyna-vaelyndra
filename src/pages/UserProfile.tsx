import { useEffect, useMemo, useState, useCallback, useRef, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Coins,
  Gift,
  Loader2,
  MessageCircle,
  Play,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { FollowButton } from "../components/FollowButton";
import { FamiliarPortrait } from "../components/FamiliarPortrait";
import SoulBondsModal from "../components/SoulBondsModal";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { WishlistSection } from "../components/WishlistSection";
import { AdminUserPanel } from "../components/AdminUserPanel";
import { ReportButton } from "../components/ReportButton";
import { formatDate, formatRelative } from "../lib/helpers";
import { roleLabelWithIcon } from "../lib/roleLabel";
import { formatSylvins } from "../lib/sylvins";
import { apiGetProfile, apiUpdateAvatar, apiUploadCommunityImage, type UserProfileDto } from "../lib/api";
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
  const { users, user: currentUser, updateProfile: updateAuthProfile } = useAuth();
  const { posts, walletOf } = useStore();
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
  const [activeFamiliar, setActiveFamiliar] = useState<OwnedFamiliar | null>(null);
  const [giftAmount, setGiftAmount] = useState("");
  const [giftSending, setGiftSending] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

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
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // Reset immédiat : sinon l'ancien avatar serveur reste affiché pendant
    // la latence de fetch quand on passe de /u/alice à /u/bob.
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) return;
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

  const openAvatarPicker = useCallback(() => {
    avatarFileRef.current?.click();
  }, []);

  async function handleAvatarPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !currentUser || currentUser.id !== userId) return;
    if (!file.type.startsWith("image/")) {
      notify("Choisis une image valide.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("Image trop lourde (max 5 Mo).", "error");
      return;
    }
    setAvatarSaving(true);
    try {
      const uploaded = await apiUploadCommunityImage(file);
      const result = await updateAuthProfile({ avatar: uploaded.imageUrl });
      if (!result.ok) throw new Error(result.error);
      await apiUpdateAvatar(currentUser.id, { avatarImageUrl: uploaded.imageUrl });
      setServerProfile((prev) =>
        prev
          ? { ...prev, avatarImageUrl: uploaded.imageUrl }
          : prev,
      );
      notify("Photo de profil mise à jour.", "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossible de mettre à jour la photo.",
        "error",
      );
    } finally {
      setAvatarSaving(false);
    }
  }

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
        <SectionHeading
          eyebrow="Page manquante"
          title="Ce profil a disparu"
        />
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
  const isOwnProfile = currentUser?.id === profile.id;
  const myPosts = posts
    .filter((p) => p.authorId === profile.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
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
        className="card-royal relative overflow-hidden p-6 sm:p-8 md:p-10"
      >
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative shrink-0">
            <AvatarImage
              candidates={[serverProfile?.avatarImageUrl, profile.avatar]}
              fallbackSeed={profile.id}
              alt={profile.username}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50 sm:h-28 sm:w-28"
            />
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => setEditingAvatar((current) => !current)}
                className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-lg ring-2 ring-night-900 transition hover:scale-105"
                title="Changer ma photo de profil"
                aria-label="Changer ma photo de profil"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="w-full flex-1">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              {roleLabelWithIcon(serverProfile?.role ?? profile.role)}
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-200 md:text-4xl">
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
            {!isOwnProfile ? (
              <>
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
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                <Link
                  to="/avatar"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gold-400/45 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-100 transition hover:bg-gold-500/20"
                >
                  <Sparkles className="h-4 w-4" />
                  Avatar / Studio
                </Link>
                <Link
                  to="/familier"
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/75 transition hover:border-gold-300/35 hover:text-gold-100"
                >
                  <Gift className="h-4 w-4" />
                  Mon familier
                </Link>
              </div>
            )}
          </div>
        </div>
        {profile.bio && (
          <p className="mt-6 text-sm text-ivory/80">{profile.bio}</p>
        )}
        {isOwnProfile && editingAvatar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-6 rounded-xl border border-gold-400/30 bg-night-900/40 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Nouvelle photo de profil
              </p>
              <button
                type="button"
                onClick={() => setEditingAvatar(false)}
                className="text-ivory/50 hover:text-rose-300"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*"
                ref={avatarFileRef}
                onChange={handleAvatarPick}
                className="hidden"
              />
              <button
                type="button"
                onClick={openAvatarPicker}
                disabled={avatarSaving}
                className="btn-royal w-full sm:w-auto disabled:opacity-70"
              >
                {avatarSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {avatarSaving ? "Sauvegarde…" : "Importer une image"}
              </button>
              <button
                type="button"
                onClick={() => setEditingAvatar(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75"
              >
                Annuler
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ivory/50">
              La nouvelle image est appliquée au profil et partout où ton avatar est affiché.
            </p>
          </motion.div>
        )}
      </motion.header>

      {!isOwnProfile && (
        <section className="mt-10">
          <AdminUserPanel
            targetUserId={profile.id}
            targetUsername={profile.username}
            onChange={refreshServerProfile}
          />
        </section>
      )}

      {!isOwnProfile && (
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
              <Sparkles className="h-5 w-5 text-gold-300" />
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                Sylvins reçus en cadeaux
              </p>
            </div>
            <p className="mt-3 font-display text-2xl text-gold-200">
              {formatSylvins(wallet.earnings)}
            </p>
          </div>
        </section>
      )}

      {!isOwnProfile && activeFamiliar && (
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
                  {activeFamiliar.name} — {RARITY_LABELS[activeFamiliar.rarity] ?? activeFamiliar.rarity}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-200">
                    Niveau {activeFamiliar.level}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ivory/15 bg-night-700/60 px-3 py-1 text-xs text-ivory/70">
                    {(EVOLUTION_TIERS[activeFamiliar.evolution.id] ?? { emoji: "✨", label: activeFamiliar.evolution.name }).emoji}{" "}
                    {(EVOLUTION_TIERS[activeFamiliar.evolution.id] ?? { label: activeFamiliar.evolution.name }).label}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-ivory/50">
                    <span>Progression</span>
                    <span>
                      {activeFamiliar.xpIntoLevel} / {activeFamiliar.xpToNextLevel > 0 ? activeFamiliar.xpToNextLevel : "MAX"} XP
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-night-700">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${activeFamiliar.color}, ${activeFamiliar.color}cc)` }}
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
                        disabled={giftSending || !giftAmount || Number(giftAmount) < 1}
                        onClick={async () => {
                          const amt = Number(giftAmount);
                          if (!currentUser || amt < 1) return;
                          setGiftSending(true);
                          try {
                            const result = await giftFamiliar(userId, currentUser.id, amt);
                            notify(
                              `${result.familiarIcon} +${result.xpGranted} XP pour ${result.familiarName} ! (Niveau ${result.newLevel})`,
                              "success",
                            );
                            setGiftAmount("");
                            setActiveFamiliar((prev) =>
                              prev
                                ? { ...prev, xp: result.newXp, level: result.newLevel }
                                : prev,
                            );
                            fetchUserFamiliars(userId).then((col) => {
                              setActiveFamiliar(col.owned.find((f) => f.isActive) ?? null);
                            }).catch(() => {});
                          } catch (e: unknown) {
                            const msg = e instanceof Error && e.message ? e.message : "Échec de l'offrande.";
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
                        Offrir {giftAmount ? `${giftAmount} Sylvins` : "au familier"}
                      </button>
                    </div>
                    <p className="text-[11px] text-ivory/40">
                      1 Sylvin = 1 XP pour le familier. Ton familier gagne aussi 1 XP tous les 3 Sylvins offerts.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {!isOwnProfile && serverProfile && (
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
              (acc, usersList) => acc + usersList.length,
              0,
            );
            const isVideo = Boolean(p.videoUrl);
            const poster = p.imageUrl || "";
            const postUrl = `/communaute#post-${p.id}`;
            return (
              <li
                key={p.id}
                className="group relative overflow-hidden rounded-[22px] border border-white/8 bg-night-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
              >
                <Link
                  to={postUrl}
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

                  {isOwnProfile && (
                    <div className="absolute right-2 top-2 z-20 flex gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          // miniatures modifiables : on garde l'accès via le post détail.
                          notify("Ouvre le post pour modifier sa miniature.", "info");
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
                          // suppression déjà gérée côté Social ; on garde l'accès visuel.
                          notify("Supprime le post depuis l'espace Social.", "info");
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-night-950/75 text-rose-200 backdrop-blur-md transition hover:border-rose-300/50 hover:text-rose-100"
                        aria-label="Supprimer mon post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
          {myPosts.length === 0 && (
            <li className="col-span-full rounded-[24px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
              {isOwnProfile ? "Crée ta première publication." : "Ce membre n'a pas encore publié."}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
