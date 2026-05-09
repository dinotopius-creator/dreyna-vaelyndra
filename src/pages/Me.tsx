import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  Camera,
  Coins,
  Crown,
  Heart,
  Link as LinkIcon,
  Save,
  ShoppingBag,
  Sparkles,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { useProfile } from "../contexts/ProfileContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarViewer } from "../components/AvatarViewer";
import { UserBadges } from "../components/UserBadges";
import StreamerGradeBadge from "../components/StreamerGradeBadge";
import { CreaturePickerModal } from "../components/CreaturePickerModal";
import SoulBondsModal from "../components/SoulBondsModal";
import { WishlistSection } from "../components/WishlistSection";
import { ApiError } from "../lib/api";
import { formatDate, formatPrice, resizeImageToDataUrl } from "../lib/helpers";
import { roleLabel, roleLabelWithIcon } from "../lib/roleLabel";
import {
  MIN_PAYOUT_EUR,
  PLATFORM_CUT,
  formatEur,
  formatSylvins,
  sylvinsToNetEur,
} from "../lib/sylvins";
import {
  apiCreateStripeConnectDashboardLink,
  apiCreateStripeConnectOnboardingLink,
  apiGetStripeConnectStatus,
  apiWithdrawStripeEarnings,
  type StripeConnectStatusDto,
} from "../lib/stripeApi";

export function Me() {
  const { user, updateProfile, backendMe, refreshBackendMe } = useAuth();
  const { articles, orders, products, myWallet } = useStore();
  const { profile: serverProfile, refresh: refreshProfile } = useProfile();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const stripeConnectStatus = searchParams.get("stripe_connect");

  /**
   * Au retour d'un paiement Stripe, le flag `?payment=success` reste dans
   * l'URL. Le webhook Stripe peut prendre quelques secondes à tomber et
   * crédite seulement ensuite le `sylvins_paid`. On relance `refreshBackendMe`
   * quelques fois (toutes les 2 s pendant ~20 s) pour rafraîchir le wallet
   * affiché sans que l'utilisateur ait à faire F5 manuellement. Une fois
   * que le pot PAID a bougé (ou au bout de 20 s), on retire le flag de l'URL.
   */
  const startPaidRef = useRef<number | null>(null);
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
    let tries = 0;
    const interval = setInterval(async () => {
      tries += 1;
      const fresh = await refreshBackendMe().catch(() => null);
      const nowPaid = fresh?.sylvins_paid ?? backendMe?.sylvins_paid ?? 0;
      const startPaid = startPaidRef.current ?? 0;
      if (nowPaid > startPaid || tries >= 10) {
        clearInterval(interval);
        const next = new URLSearchParams(searchParams);
        next.delete("payment");
        next.delete("session_id");
        setSearchParams(next, { replace: true });
        if (nowPaid > startPaid) {
          notify("Paiement confirmé, Sylvins crédités ✨", "success");
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
  const [creaturePickerOpen, setCreaturePickerOpen] = useState(false);
  const [bondsTab, setBondsTab] = useState<"followers" | "following" | null>(
    null,
  );
  const [connectStatus, setConnectStatus] =
    useState<StripeConnectStatusDto | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setConnectLoading(true);
    apiGetStripeConnectStatus()
      .then((status) => {
        if (!cancelled) setConnectStatus(status);
      })
      .catch((err) => {
        console.warn("Statut Stripe Connect indisponible :", err);
        if (!cancelled) setConnectStatus(null);
      })
      .finally(() => {
        if (!cancelled) setConnectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!stripeConnectStatus) return;
    if (stripeConnectStatus !== "return" && stripeConnectStatus !== "refresh") {
      return;
    }
    void refreshProfile();
    void apiGetStripeConnectStatus()
      .then((status) => setConnectStatus(status))
      .catch((err) => console.warn("Refresh Stripe Connect KO :", err));
    const next = new URLSearchParams(searchParams);
    next.delete("stripe_connect");
    setSearchParams(next, { replace: true });
    if (stripeConnectStatus === "return") {
      notify("Compte Stripe mis à jour.", "success");
    }
  }, [notify, refreshProfile, searchParams, setSearchParams, stripeConnectStatus]);

  if (!user) return null;

  const myLikes = articles.filter((a) => a.likes.includes(user.id));
  const myComments = articles
    .flatMap((a) =>
      a.comments
        .filter((c) => c.authorId === user.id)
        .map((c) => ({ article: a, comment: c })),
    )
    .slice(0, 6);
  const myOrders = orders.filter((o) => o.userId === user.id);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = await updateProfile({ username, avatar, bio });
    if (!res.ok) {
      notify(res.error ?? "Impossible d'enregistrer.", "error");
      return;
    }
    setEditingAvatar(false);
    notify("Votre profil a été scellé aux archives ✨");
  }

  async function openStripeOnboarding() {
    try {
      setConnectLoading(true);
      const link = connectStatus?.onboardingComplete
        ? await apiCreateStripeConnectDashboardLink()
        : await apiCreateStripeConnectOnboardingLink();
      window.location.href = link.url;
    } catch (err) {
      console.warn(err);
      notify(
        err instanceof ApiError && err.message
          ? err.message
          : "Impossible d'ouvrir Stripe pour le moment.",
        "error",
      );
    } finally {
      setConnectLoading(false);
    }
  }

  async function withdrawEarnings() {
    try {
      setWithdrawLoading(true);
      const payout = await apiWithdrawStripeEarnings();
      await refreshProfile();
      setConnectStatus(await apiGetStripeConnectStatus().catch(() => connectStatus));
      notify(
        `Retrait lancé : ${formatEur(payout.amountCents / 100)} envoyés vers Stripe Express.`,
        "success",
      );
    } catch (err) {
      console.warn(err);
      notify(
        err instanceof Error && err.message
          ? err.message
          : "Le retrait a échoué.",
        "error",
      );
    } finally {
      setWithdrawLoading(false);
    }
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
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
        className="card-royal relative overflow-hidden p-8 md:p-10"
      >
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative">
            <img
              src={avatar || user.avatar}
              alt={user.username}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-gold-400/50"
            />
            <button
              type="button"
              onClick={() => setEditingAvatar((v) => !v)}
              className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-lg ring-2 ring-night-900 transition hover:scale-105"
              title="Changer ma photo"
              aria-label="Changer ma photo de profil"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              {roleLabelWithIcon(serverProfile?.role ?? user.role)}
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-200 md:text-4xl">
              {user.username}
            </h1>
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
            <p className="mt-2 text-sm text-ivory/60">
              Inscrit·e le {formatDate(user.joinedAt)}
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

        </div>
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

        {editingAvatar && (
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
                onClick={() => {
                  setEditingAvatar(false);
                  setAvatar(user.avatar);
                }}
                className="text-ivory/50 hover:text-rose-300"
                title="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                className="btn-royal"
              >
                <Upload className="h-4 w-4" /> Importer depuis mon PC
              </button>
              <div className="relative flex-1 min-w-[240px]">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                <input
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="ou coller une URL d'image (https://...)"
                  className="glass-input pl-9"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ivory/50">
              Astuce : tu peux sauvegarder ton avatar sur ton PC, puis cliquer "Importer". Max 5 Mo.
            </p>
          </motion.div>
        )}

        <form onSubmit={saveProfile} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
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
          <div>
            <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
              Rôle
            </label>
            <input
              disabled
              value={roleLabel(serverProfile?.role ?? user.role)}
              className="glass-input mt-2 cursor-not-allowed opacity-70"
            />
          </div>
          <div className="md:col-span-2">
            <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
              Biographie
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="glass-input mt-2 resize-none"
              placeholder="Parle de toi, de tes lives, de ta passion..."
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="btn-gold">
              <Save className="h-4 w-4" /> Enregistrer mon profil
            </button>
          </div>
        </form>
      </motion.header>

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Avatar"
          title={<>Ton <span className="text-mystic">avatar</span></>}
          subtitle="Composé dans l'atelier paper-doll, visible partout sur le site : header, fil communautaire, chat, lives."
        />
        <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="card-royal p-4">
            <AvatarViewer
              src={serverProfile?.avatarUrl ?? null}
              fallbackImage={serverProfile?.avatarImageUrl ?? user.avatar}
              alt={`Avatar 3D de ${user.username}`}
              size="portrait"
              framing="face"
              equippedFrameId={serverProfile?.equipped?.frame ?? null}
              equippedSceneId={serverProfile?.equipped?.scene ?? null}
              equippedOutfit3DId={serverProfile?.equipped?.outfit3d ?? null}
              equippedAccessory3DId={
                serverProfile?.equipped?.accessory3d ?? null
              }
            />
          </div>
          <div className="card-royal flex flex-col justify-between gap-5 p-6">
            <div>
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Personnalisez votre avatar
              </p>
              <p className="mt-2 text-sm text-ivory/75">
                Avatar 3D debout, rotation 360, rendu unifié sur le profil,
                les lives et le fil communautaire. Il est sauvegardé sur le
                serveur et vous retrouve sur tous vos appareils.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-ivory/65">
                <li>• Choix du corps, du visage, des cheveux et des couleurs</li>
                <li>• Aperçu 360 instantané, enregistrement en un clic</li>
                <li>• Prêt pour les tenues et accessoires 3D de la boutique</li>
              </ul>
            </div>
            <Link
              to="/avatar"
              className="inline-flex items-center gap-2 self-start rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110"
            >
              <UserCog className="h-4 w-4" />
              {serverProfile?.avatarUrl
                ? "Modifier mon avatar"
                : "Composer mon avatar"}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <WishlistSection
          wishlist={serverProfile?.wishlist ?? []}
          ownedIds={serverProfile?.inventory ?? []}
          targetUserId={user.id}
          targetUsername={user.username}
          isSelf
        />
      </section>

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Trésorerie"
          title={<>Votre bourse de <span className="text-mystic">Sylvins</span></>}
          subtitle="Achetez des Sylvins pour soutenir les streamers, recevez-en en retour de vos lives. Les recettes de streamer sont converties en € au retrait."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,1fr]">
          <div className="card-royal p-5">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-gold-300" />
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                Solde à dépenser
              </p>
            </div>
            <p className="mt-3 font-display text-3xl text-gold-200">
              {formatSylvins(myWallet.balance)} Sylvins
            </p>
            <p className="mt-1 text-xs text-ivory/60">
              Utilisables dans les lives pour offrir des cadeaux animés.
            </p>
            <Link to="/boutique" className="btn-gold mt-4 inline-flex">
              <Sparkles className="h-4 w-4" /> Recharger
            </Link>
          </div>
          <div className="card-royal p-5">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-gold-300" />
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                Recettes streamer
              </p>
            </div>
            {(() => {
              // Source de vérité = profil serveur (split paid/promo). Tant
              // qu'il n'est pas chargé, on affiche le solde client-side en
              // fallback (anciennement seule source, pré-migration backend).
              const paid = serverProfile?.earningsPaid ?? 0;
              const promo =
                serverProfile?.earningsPromo ?? myWallet.earnings;
              const retirableNetEur = sylvinsToNetEur(paid);
              const connectReady =
                !!connectStatus?.accountId &&
                connectStatus.onboardingComplete &&
                connectStatus.payoutsEnabled;
              const canWithdraw =
                connectReady &&
                retirableNetEur >= MIN_PAYOUT_EUR &&
                paid > 0 &&
                !withdrawLoading;
              return (
                <>
                  <p className="mt-3 font-display text-3xl text-gold-200">
                    {formatSylvins(paid + promo)} Sylvins
                  </p>
                  <div className="mt-3 grid gap-2 text-xs">
                    <div className="rounded-lg border border-gold-400/30 bg-night-900/40 p-3">
                      <p className="font-regal text-[10px] uppercase tracking-[0.22em] text-gold-300">
                        Retirables
                      </p>
                      <p className="mt-1 font-display text-lg text-gold-200">
                        {formatSylvins(paid)} Sylvins
                      </p>
                      <p className="mt-1 text-ivory/60">
                        Net estimé :{" "}
                        <span className="text-gold-200">
                          {formatEur(retirableNetEur)}
                        </span>{" "}
                        (après {Math.round(PLATFORM_CUT * 100)}% de frais
                        plateforme)
                      </p>
                      <p className="mt-1 text-[11px] text-ivory/50">
                        Seulement les cadeaux reçus depuis un achat Stripe
                        alimentent ce pot.
                      </p>
                    </div>
                    <div className="rounded-lg border border-royal-500/30 bg-night-900/30 p-3">
                      <p className="font-regal text-[10px] uppercase tracking-[0.22em] text-ivory/60">
                        En cadeaux uniquement
                      </p>
                      <p className="mt-1 font-display text-lg text-ivory/85">
                        {formatSylvins(promo)} Sylvins
                      </p>
                      <p className="mt-1 text-[11px] text-ivory/50">
                        Reçus depuis un solde promo (events, admin,
                        récompenses). Non retirables en € — réinjectez-les
                        en offrant vos propres cadeaux ou en achetant des
                        items boutique.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-night-900/60">
                    <div
                      className="h-full bg-gold-shine"
                      style={{
                        width: `${Math.min(
                          100,
                          (retirableNetEur / MIN_PAYOUT_EUR) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-ivory/50">
                    Seuil de retrait : {formatEur(MIN_PAYOUT_EUR)} (calculé
                    sur le pot "Retirables").
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-royal inline-flex disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canWithdraw}
                      onClick={withdrawEarnings}
                      title={
                        !connectReady
                          ? "Configurez Stripe Express d'abord."
                          : retirableNetEur < MIN_PAYOUT_EUR
                            ? `Seuil minimum ${formatEur(MIN_PAYOUT_EUR)} non atteint.`
                            : ""
                      }
                    >
                      <Banknote className="h-4 w-4" />{" "}
                      {withdrawLoading ? "Retrait en cours…" : "Retirer en €"}
                    </button>
                    <button
                      type="button"
                      className="btn-gold inline-flex disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={openStripeOnboarding}
                      disabled={connectLoading || withdrawLoading}
                    >
                      <LinkIcon className="h-4 w-4" />{" "}
                      {connectLoading
                        ? "Connexion Stripe…"
                        : connectReady
                          ? "Ouvrir Stripe Express"
                          : "Configurer mes retraits"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Activité"
          title="Ton activité"
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card-royal p-5">
            <Heart className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myLikes.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              chroniques aimées
            </p>
          </div>
          <div className="card-royal p-5">
            <ShoppingBag className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myOrders.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              commandes royales
            </p>
          </div>
          <div className="card-royal p-5">
            <Crown className="h-5 w-5 text-gold-300" />
            <p className="mt-3 font-display text-2xl text-gold-200">
              {myComments.length}
            </p>
            <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
              paroles au grimoire
            </p>
          </div>
        </div>
      </section>

      {myOrders.length > 0 && (
        <section className="mt-12">
          <SectionHeading
            align="left"
            eyebrow="Commandes"
            title="Vos trésors scellés"
          />
          <ul className="mt-6 space-y-3">
            {myOrders.map((o) => (
              <li key={o.id} className="card-royal p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm text-gold-200">
                    Ordre #{o.id.slice(-6)}
                  </p>
                  <p className="font-display text-lg text-gold-200">
                    {formatPrice(o.total)}
                  </p>
                </div>
                <p className="mt-1 font-regal text-[10px] tracking-[0.22em] text-ivory/55">
                  {formatDate(o.createdAt)} · {o.status}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-ivory/75">
                  {o.items.map((it) => {
                    const p = products.find((x) => x.id === it.productId);
                    return (
                      <li key={it.productId}>
                        ✦ {p?.name ?? "Item"} × {it.quantity}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
