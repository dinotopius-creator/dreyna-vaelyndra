import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Loader2,
  MessageCircle,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { ProfileGrid } from "../components/ProfileGrid";
import { UserBadges } from "../components/UserBadges";
import { Handle } from "../components/Handle";
import { FollowButton } from "../components/FollowButton";
import SoulBondsModal from "../components/SoulBondsModal";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { ReportButton } from "../components/ReportButton";
import { formatDate } from "../lib/helpers";
import { roleLabelWithIcon } from "../lib/roleLabel";
import { apiGetProfile, apiUpdateAvatar, apiUploadCommunityImage, type UserProfileDto } from "../lib/api";
import { useProfile } from "../contexts/ProfileContext";
import type { User } from "../types";

export function UserProfile() {
  const { userId = "" } = useParams();
  const { users, user: currentUser, updateProfile: updateAuthProfile } = useAuth();
  const { posts } = useStore();
  const { notify } = useToast();
  const { refresh: refreshProfile } = useProfile();

  const localProfile = useMemo(
    () => users.find((entry) => entry.id === userId),
    [users, userId],
  );

  const [serverProfile, setServerProfile] = useState<UserProfileDto | null>(null);
  const [serverState, setServerState] = useState<"loading" | "ok" | "missing">("loading");
  const [bondsTab, setBondsTab] = useState<"followers" | "following" | null>(null);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setServerProfile(null);
      setServerState("loading");
    }, 0);

    apiGetProfile(userId)
      .then((profile) => {
        if (!cancelled) {
          setServerProfile(profile);
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
      window.clearTimeout(timer);
    };
  }, [userId]);

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
      bio: serverProfile.bio ?? "",
      creatureId: serverProfile.creature?.id,
    };
    return fallback;
  }, [localProfile, serverProfile]);

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
      setServerProfile((prev) => (prev ? { ...prev, avatarImageUrl: uploaded.imageUrl } : prev));
      refreshProfile();
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

  if (!profile) {
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
          Le profil demandé n&apos;existe pas (ou plus) sur Vaelyndra.
        </p>
        <Link to="/communaute" className="btn-gold mt-8 inline-flex">
          <ArrowLeft className="h-4 w-4" /> Retour au fil
        </Link>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  const myPosts = posts
    .filter((post) => post.authorId === profile.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <SoulBondsModal
        userId={profile.id}
        username={profile.username}
        open={bondsTab !== null}
        initialTab={bondsTab ?? "followers"}
        onClose={() => setBondsTab(null)}
      />

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal relative overflow-hidden p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <AvatarImage
              candidates={[serverProfile?.avatarImageUrl, profile.avatar]}
              fallbackSeed={profile.id}
              alt={profile.username}
              className="h-20 w-20 rounded-full object-cover ring-4 ring-gold-400/50 sm:h-24 sm:w-24"
            />
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => setEditingAvatar((current) => !current)}
                className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-lg ring-2 ring-night-900 transition hover:scale-105"
                title="Changer ma photo de profil"
                aria-label="Changer ma photo de profil"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  {roleLabelWithIcon(serverProfile?.role ?? profile.role)}
                </p>
                <h1 className="mt-1 truncate font-display text-2xl text-gold-200 sm:text-3xl">
                  {profile.username}
                </h1>
                <Handle
                  handle={serverProfile?.handle ?? profile.handle}
                  size="base"
                  className="mt-0.5 block"
                />
              </div>
              {serverProfile?.grade && (
                <div className="shrink-0">
                  <StreamerGradeBadge grade={serverProfile.grade} size="md" />
                </div>
              )}
            </div>

            <UserBadges
              creatureId={serverProfile?.creature?.id ?? profile.creatureId}
              role={serverProfile?.role}
              size="md"
              className="mt-2"
            />

            <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-gold-300/35"
              >
                <div className="font-display text-lg text-gold-100">{myPosts.length}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ivory/55">
                  Posts
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBondsTab("followers")}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-gold-300/35"
              >
                <div className="font-display text-lg text-gold-100">
                  {serverProfile?.followersCount ?? 0}
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ivory/55">
                  Followers
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBondsTab("following")}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-gold-300/35"
              >
                <div className="font-display text-lg text-gold-100">
                  {serverProfile?.followingCount ?? 0}
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ivory/55">
                  Suivis
                </div>
              </button>
            </div>

            {profile.bio && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ivory/78">
                {profile.bio}
              </p>
            )}

            <p className="mt-2 text-[11px] text-ivory/50">
              Inscrit·e le {formatDate(profile.joinedAt)}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isOwnProfile ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingAvatar((current) => !current)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gold-400/45 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-100 transition hover:bg-gold-500/20"
                  >
                    <Sparkles className="h-4 w-4" />
                    Modifier mon profil
                  </button>
                  <Link
                    to="/avatar"
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Mes avatars
                  </Link>
                  <Link
                    to="/familier"
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Familier
                  </Link>
                </>
              ) : (
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
                  <Link
                    to={`/messages/${encodeURIComponent(profile.id)}`}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-gold-400/50 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-gold-500/20"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Link>
                  <Link
                    to={`/u/${profile.id}/familier`}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Voir le familier
                  </Link>
                  <ReportButton
                    targetType="user"
                    targetId={profile.id}
                    targetLabel={profile.username}
                    targetUrl={`/u/${profile.id}`}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {isOwnProfile && editingAvatar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-5 rounded-2xl border border-gold-400/30 bg-night-900/40 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                Photo de profil
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
                onClick={() => avatarFileRef.current?.click()}
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
          </motion.div>
        )}
      </motion.header>

      <section className="mt-8">
        <SectionHeading
          align="left"
          eyebrow="Profil"
          title={isOwnProfile ? "Mon activité" : "Ses publications"}
          subtitle="Une grille propre, compacte et lisible, comme la référence sociale du projet."
        />
      </section>

      <ProfileGrid
        posts={myPosts}
        ownerName={profile.username}
        canEditPosts={false}
        ownEmptyLabel="Crée ta première publication."
      />

      <section className="mt-10">
        <SectionHeading
          align="left"
          eyebrow="Raccourcis"
          title="Accès rapide"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/avatar"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
          >
            <Sparkles className="h-4 w-4" />
            Studio Avatar
          </Link>
          <Link
            to="/familier"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
          >
            <Sparkles className="h-4 w-4" />
            Familier
          </Link>
        </div>
      </section>
    </div>
  );
}
