import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Crown,
  BookmarkCheck,
  Check,
  Loader2,
  MoreVertical,
  Save,
  Play,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { useProfile } from "../contexts/ProfileContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { UserBadges } from "../components/UserBadges";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { CreaturePickerModal } from "../components/CreaturePickerModal";
import SoulBondsModal from "../components/SoulBondsModal";
import { formatDate, resizeImageToDataUrl } from "../lib/helpers";
import { roleLabelWithIcon } from "../lib/roleLabel";
import { apiUpdatePost, apiUploadCommunityImage } from "../lib/api";
import type { CommunityPost } from "../types";

function normalizeProfileKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

function hasVisibleMedia(post: CommunityPost) {
  return Boolean(post.videoUrl || post.imageUrl || post.videoThumbnailUrl);
}

export function Me() {
  const { user, updateProfile, backendMe, refreshBackendMe } = useAuth();
  const { posts, dispatch } = useStore();
  const { profile: serverProfile, refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  /**
   * Au retour d'un paiement Stripe, le flag `?payment=success` reste dans
   * l'URL. Le webhook Stripe peut prendre quelques secondes à tomber et
   * crédite seulement ensuite le wallet. On relance `refreshBackendMe`
   * quelques fois (toutes les 2 s pendant ~20 s) pour rafraîchir le wallet
   * affiché sans que l'utilisateur ait à faire F5 manuellement. Une fois
   * que les Sylvins payés ou les Lueurs ont bougé, on retire le flag de l'URL.
   */
  const startPaidRef = useRef<number | null>(null);
  const startLueursRef = useRef<number | null>(null);
  const backendMeLoaded = backendMe !== null;
  useEffect(() => {
    if (paymentStatus !== "success") return;
    // Le redirect Stripe est un full-page load : `backendMe` est `null`
    // pendant que `/auth/me` se résout. Si on capturait la baseline à
    // ce moment-là, elle vaudrait `0` et n'importe quel utilisateur qui
    // a déjà des Sylvins payés verrait le toast "paiement confirmé"
    // dès le premier tick (faux positif). On attend donc que
    // `backendMe` soit chargé avant de démarrer le polling.
    if (!backendMeLoaded) return;
    if (startPaidRef.current === null) {
      startPaidRef.current = backendMe?.sylvins_paid ?? 0;
    }
    if (startLueursRef.current === null) {
      startLueursRef.current = backendMe?.lueurs ?? 0;
    }
    let tries = 0;
    const interval = setInterval(async () => {
      tries += 1;
      const fresh = await refreshBackendMe().catch(() => null);
      const nowPaid = fresh?.sylvins_paid ?? backendMe?.sylvins_paid ?? 0;
      const nowLueurs = fresh?.lueurs ?? backendMe?.lueurs ?? 0;
      const startPaid = startPaidRef.current ?? 0;
      const startLueurs = startLueursRef.current ?? 0;
      if (nowPaid > startPaid || nowLueurs > startLueurs || tries >= 10) {
        clearInterval(interval);
        const next = new URLSearchParams(searchParams);
        next.delete("payment");
        next.delete("session_id");
        setSearchParams(next, { replace: true });
        if (nowPaid > startPaid || nowLueurs > startLueurs) {
          notify(
            nowLueurs > startLueurs
              ? "Paiement confirmé, Lueurs créditées ✨"
              : "Paiement confirmé, Sylvins crédités ✨",
            "success",
          );
        }
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, backendMeLoaded]);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [creaturePickerOpen, setCreaturePickerOpen] = useState(false);
  const [bondsTab, setBondsTab] = useState<"followers" | "following" | null>(
    null,
  );
  const [thumbnailEditorPostId, setThumbnailEditorPostId] = useState<string | null>(null);
  const [thumbnailUrlDraft, setThumbnailUrlDraft] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailSaving, setThumbnailSaving] = useState(false);
  const [savedPostIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem("vaelyndra-community-saved-posts");
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      /* ignore persisted save state */
    }
    return new Set<string>();
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const editLoaderRef = useRef<number | null>(null);

  if (!user) return null;
  const currentUser = user;
  const profileKeys = new Set(
    [
      currentUser.id,
      currentUser.username,
      currentUser.handle,
      serverProfile?.id,
      serverProfile?.username,
      serverProfile?.handle,
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeProfileKey(value))
      .filter(Boolean),
  );

  const myPosts = posts
    .filter((post) =>
      [
        normalizeProfileKey(post.authorId),
        normalizeProfileKey(post.authorName),
        normalizeProfileKey(post.authorHandle),
      ].some((key) => profileKeys.has(key)),
    )
    .filter(hasVisibleMedia)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const savedPosts = posts.filter((post) => savedPostIds.has(post.id)).filter(hasVisibleMedia);
  const isArchitect = backendMe?.role === "architect";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = await updateProfile({ username, avatar, bio });
    if (!res.ok) {
      notify(res.error ?? "Impossible d'enregistrer.", "error");
      return;
    }
    void refreshProfile();
    setEditingAvatar(false);
    notify("Votre profil a été scellé aux archives ✨");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("Image trop lourde (max 5 Mo).", "error");
      return;
    }
    try {
      const thumb = await resizeImageToDataUrl(file, 256, 0.82);
      setAvatar(thumb);
      setEditingAvatar(true);
      notify("Image chargée — n'oubliez pas d'enregistrer 💾", "info");
    } catch {
      notify("Image illisible, essaye un autre format.", "error");
    }
  }

  function openEditProfile() {
    if (editingAvatar || editLoading) return;
    setEditLoading(true);
    if (editLoaderRef.current !== null) {
      window.clearTimeout(editLoaderRef.current);
    }
    editLoaderRef.current = window.setTimeout(() => {
      setEditLoading(false);
      setEditingAvatar(true);
    }, 260);
  }

  function closeEditProfile() {
    setEditingAvatar(false);
    setEditLoading(false);
    setAvatar(currentUser.avatar);
    setUsername(currentUser.username);
    setBio(currentUser.bio ?? "");
  }

  function openThumbnailEditor(postId: string) {
    const post = myPosts.find((entry) => entry.id === postId);
    if (!post) return;
    setThumbnailEditorPostId(postId);
    setThumbnailUrlDraft(post.videoThumbnailUrl ?? "");
    setThumbnailFile(null);
  }

  async function saveThumbnail() {
    if (!user || !thumbnailEditorPostId) return;
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
        userId: user.id,
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
      {paymentStatus === "success" && (
        <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
            <div>
              <p className="font-regal tracking-wide">
                Paiement reçu — confirmation en cours
              </p>
              <p className="mt-1 text-xs text-emerald-100/80">
                Ton paiement Stripe a bien été accepté. Les Sylvins arrivent
                sur ton compte dès que la confirmation serveur nous parvient
                (quelques secondes).
              </p>
            </div>
          </div>
        </div>
      )}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal relative overflow-hidden p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <AvatarImage
              candidates={[serverProfile?.avatarImageUrl, user.avatar]}
              fallbackSeed={user.id}
              alt={user.username}
              className="h-20 w-20 rounded-full object-cover ring-4 ring-gold-400/50 sm:h-24 sm:w-24"
            />
              <button
                type="button"
                onClick={openEditProfile}
                className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-lg ring-2 ring-night-900 transition hover:scale-105"
                title="Changer ma photo de profil"
                aria-label="Changer ma photo de profil"
              >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  {roleLabelWithIcon(serverProfile?.role ?? user.role)}
                </p>
                <h1 className="mt-1 truncate font-display text-2xl text-gold-200 sm:text-3xl">
                  {user.username}
                </h1>
              </div>
              {serverProfile?.grade && (
                <div className="shrink-0">
                  <StreamerGradeBadge grade={serverProfile.grade} size="md" />
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <UserBadges
                creatureId={serverProfile?.creature?.id ?? user.creatureId}
                role={serverProfile?.role}
                size="md"
              />
              <button
                type="button"
                onClick={() => setCreaturePickerOpen(true)}
                className="text-[11px] font-regal tracking-wide text-ivory/50 underline-offset-4 transition hover:text-gold-200 hover:underline"
              >
                Changer
              </button>
            </div>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-ivory/78">
              {serverProfile?.bio || bio || " "}
            </p>

            <p className="mt-2 text-[11px] text-ivory/50">
              Inscrit·e le {formatDate(user.joinedAt)}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
              <div className="min-h-20 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                <div className="font-display text-lg text-gold-100 leading-none">
                  {myPosts.length}
                </div>
                <div className="mt-1 text-[10px] leading-tight uppercase tracking-[0.16em] text-ivory/55 sm:text-[11px]">
                  Posts
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBondsTab("followers")}
                className="min-h-20 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center transition hover:border-gold-300/35"
              >
                <div className="font-display text-lg text-gold-100 leading-none">
                  {serverProfile?.followersCount ?? 0}
                </div>
                <div className="mt-1 text-[10px] leading-tight uppercase tracking-[0.16em] text-ivory/55 sm:text-[11px]">
                  Abonnés
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBondsTab("following")}
                className="min-h-20 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center transition hover:border-gold-300/35"
              >
                <div className="font-display text-lg text-gold-100 leading-none">
                  {serverProfile?.followingCount ?? 0}
                </div>
                <div className="mt-1 text-[10px] leading-tight uppercase tracking-[0.16em] text-ivory/55 sm:text-[11px]">
                  Suivis
                </div>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openEditProfile}
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
              <a
                href="#saved-posts"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
              >
                <BookmarkCheck className="h-4 w-4" />
                Sauvé
              </a>
            </div>
          </div>
        </div>
        {serverProfile?.grade && (
          <div className="mt-4 max-w-sm">
            <StreamerGradeBadge grade={serverProfile.grade} size="lg" />
          </div>
        )}
        {isArchitect && (
          <div className="mt-6 rounded-2xl border border-gold-400/40 bg-gradient-to-r from-gold-500/20 via-royal-500/15 to-night-900 p-4 shadow-glow-gold">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-regal text-[10px] uppercase tracking-[0.24em] text-gold-200">
                  Accès Architecte
                </p>
                <h2 className="mt-1 font-display text-2xl text-gold-100">
                  Salle du Trône
                </h2>
                <p className="mt-1 max-w-xl text-sm text-ivory/70">
                  Votre espace de contrôle complet : utilisateurs, demandes,
                  rôles, modération, événements et outils sensibles.
                </p>
              </div>
              <Link
                to="/admin"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] font-semibold uppercase tracking-[0.22em] text-night-950 transition hover:brightness-110"
              >
                <Crown className="h-4 w-4" />
                Ouvrir la Salle du Trône
              </Link>
            </div>
          </div>
        )}
        <CreaturePickerModal
          open={creaturePickerOpen}
          currentCreatureId={
            serverProfile?.creature?.id ?? user.creatureId ?? null
          }
          onClose={() => setCreaturePickerOpen(false)}
        />

        <SoulBondsModal
          userId={user.id}
          username={user.username}
          open={bondsTab !== null}
          initialTab={bondsTab ?? "followers"}
          onClose={() => setBondsTab(null)}
        />

        {editLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-950/90 backdrop-blur-md">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-night-900/80 px-4 py-3 text-sm text-ivory/80 shadow-2xl">
              <Sparkles className="h-4 w-4 animate-pulse text-gold-200" />
              Ouverture de l’éditeur de profil…
            </div>
          </div>
        )}

        {editingAvatar && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-night-950">
            <div className="min-h-full px-4 py-5 sm:px-6 sm:py-8">
              <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-4xl flex-col rounded-[28px] border border-white/10 bg-night-900/95 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                  <div>
                    <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                      Profil
                    </p>
                    <h2 className="font-display text-2xl text-gold-100">
                      Modifier mon profil
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeEditProfile}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-ivory/70"
                    aria-label="Fermer l'éditeur"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid flex-1 gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <form onSubmit={saveProfile} className="space-y-5">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                        Photo de profil
                      </label>
                      <div className="mt-3 flex items-center gap-4">
                        <AvatarImage
                          candidates={[avatar, serverProfile?.avatarImageUrl, user.avatar]}
                          fallbackSeed={user.id}
                          alt={user.username}
                          className="h-20 w-20 rounded-full object-cover ring-4 ring-gold-400/50"
                        />
                        <div className="flex flex-1 flex-wrap gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            ref={fileRef}
                            onChange={handleFile}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="btn-royal min-h-11"
                          >
                            <Upload className="h-4 w-4" />
                            Importer une image
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvatar(user.avatar)}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75"
                          >
                            Réinitialiser
                          </button>
                        </div>
                      </div>
                      <div className="mt-3">
                        <input
                          value={avatar}
                          onChange={(e) => setAvatar(e.target.value)}
                          placeholder="ou coller une URL d'image (https://...)"
                          className="glass-input"
                        />
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                        Pseudo
                      </label>
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="glass-input mt-2"
                        placeholder="Votre pseudo"
                        maxLength={32}
                      />
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
                        Bio
                      </label>
                      <textarea
                        rows={5}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="glass-input mt-2 resize-none"
                        placeholder="Parle de toi, de tes lives, de ta passion..."
                        maxLength={240}
                      />
                      <p className="mt-2 text-right text-[11px] text-ivory/45">
                        {bio.length}/240
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closeEditProfile}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75"
                      >
                        Annuler
                      </button>
                      <button type="submit" className="btn-gold w-full sm:w-auto">
                        <Save className="h-4 w-4" /> Sauvegarder
                      </button>
                    </div>
                  </form>

                  <aside className="space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-night-950/60 p-4">
                      <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                        Aperçu
                      </p>
                      <div className="mt-4 flex items-center gap-4">
                        <AvatarImage
                          candidates={[avatar, serverProfile?.avatarImageUrl, user.avatar]}
                          fallbackSeed={user.id}
                          alt={user.username}
                          className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50"
                        />
                        <div>
                          <p className="font-display text-2xl text-gold-100">{username || user.username}</p>
                          <p className="mt-1 text-sm text-ivory/70">
                            {serverProfile?.handle ? `@${serverProfile.handle}` : "@" + user.username.toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-ivory/78">
                        {bio || "Ajoute une bio pour présenter ton profil."}
                      </p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-night-950/60 p-4 text-sm text-ivory/65">
                      Les changements sont appliqués à ton profil personnel et à tes publications associées.
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.header>

      <section className="mt-10">
        <SectionHeading
          align="left"
          eyebrow="Publications"
          title="Mes publications"
          subtitle="Le vrai feed de tes posts, juste sous la biographie."
        />
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {myPosts.map((post) => {
            const poster = post.videoThumbnailUrl || post.imageUrl || "";
            const isVideo = Boolean(post.videoUrl);
            return (
              <li
                key={post.id}
                className="group relative overflow-hidden rounded-[20px] border border-white/8 bg-night-950/70 shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
              >
                <Link
                  to={`/communaute/post/${post.id}`}
                  className="absolute inset-0 z-10"
                  aria-label={`Ouvrir le post de ${post.authorName}`}
                />
                <article className="relative flex aspect-[4/5] flex-col overflow-hidden">
                  <div className="absolute inset-0 bg-night-950">
                    {poster ? (
                      <img
                        src={poster}
                        alt={post.content}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : isVideo ? (
                      <video
                        src={post.videoUrl}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        loop
                        autoPlay
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_35%),linear-gradient(180deg,#18111f,#09060d)] px-3 text-center">
                        <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-ivory/84">
                          {post.content}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.02),rgba(2,6,23,0.14)_70%,rgba(2,6,23,0.26)_100%)]" />
                  {isVideo ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-night-950/55 text-white/92 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                        <Play className="h-5 w-5 fill-current" />
                      </div>
                    </div>
                  ) : (
                    <div className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-night-950/45 text-white/85 backdrop-blur-md">
                      <Camera className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openThumbnailEditor(post.id);
                    }}
                    className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gold-300/35 bg-night-950/70 text-gold-50 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:border-gold-200/70 hover:bg-gold-500/18 hover:text-white"
                    aria-label="Modifier la miniature"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </article>
              </li>
            );
          })}
          {myPosts.length === 0 && (
            <li className="col-span-full rounded-[20px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
              Crée ta première publication.
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
                Choisis une image de couverture pour ce post. Elle apparaîtra dans la grille du profil.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
                    Importer une image
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
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
                  {thumbnailFile ? (
                    <img
                      src={URL.createObjectURL(thumbnailFile)}
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

      <section id="saved-posts" className="mt-10">
        <SectionHeading
          align="left"
          eyebrow="Privé"
          title="Posts sauvegardés"
          subtitle="Les publications que tu as enregistrées dans Social."
        />
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {savedPosts.map((post: CommunityPost) => {
            const likes = Object.values(post.reactions ?? {}).reduce(
              (sum, usersList) => sum + usersList.length,
              0,
            );
            const comments = post.comments.length;
            const poster = post.videoThumbnailUrl || post.imageUrl || "";
            const isVideo = Boolean(post.videoUrl);
            return (
            <li
              key={post.id}
              className="group relative overflow-hidden rounded-[20px] border border-white/8 bg-night-950/70 shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
            >
              <Link
                to={`/communaute#post-${post.id}`}
                className="absolute inset-0 z-10"
                aria-label={`Ouvrir le post sauvegardé de ${post.authorName}`}
              />
              <article className="relative flex aspect-[4/5] flex-col overflow-hidden">
                <div className="absolute inset-0 bg-night-950">
                  {poster ? (
                    <img
                      src={poster}
                      alt={post.content}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  ) : isVideo ? (
                    <video
                      src={post.videoUrl}
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
                        {post.content}
                      </p>
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.08)_35%,rgba(2,6,23,0.88)_100%)]" />
                {isVideo && (
                  <div className="absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-night-950/70 text-white/85 backdrop-blur-md">
                    <Sparkles className="h-3.5 w-3.5 fill-current" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 z-20 p-2.5">
                  <div className="rounded-[16px] border border-white/10 bg-night-950/72 p-2 backdrop-blur-md">
                    <p className="line-clamp-2 text-[11px] leading-4 text-ivory/88">
                      {post.authorName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-ivory/58">
                      {post.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ivory/55">
                      <span>{likes} likes</span>
                      <span>{comments} comm.</span>
                    </div>
                  </div>
                </div>
              </article>
            </li>
            );
          })}
          {savedPosts.length === 0 && (
            <li className="col-span-full rounded-[20px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ivory/50">
              Aucun post enregistré pour le moment.
            </li>
          )}
        </ul>
      </section>
      </div>
  );
}
