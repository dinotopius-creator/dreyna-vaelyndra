import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Gift,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { AvatarImage } from "../components/AvatarImage";
import { FamiliarPortrait } from "../components/FamiliarPortrait";
import { Handle } from "../components/Handle";
import { SectionHeading } from "../components/SectionHeading";
import { apiGetProfile, type UserProfileDto } from "../lib/api";
import {
  fetchUserFamiliars,
  giftFamiliar,
  type FamiliarCollection,
  type OwnedFamiliar,
} from "../lib/familiarsApi";
import { formatRelative } from "../lib/helpers";
import { formatSylvins } from "../lib/sylvins";

const PRESET_DONATIONS = [1, 5, 10];

function familiarFromProfile(profile: UserProfileDto): OwnedFamiliar | null {
  const familiar = profile.familiar;
  if (!familiar) return null;
  return {
    id: 0,
    familiarId: familiar.familiarId,
    name: familiar.name,
    rarity: familiar.rarity,
    tier: familiar.tier === "premium" ? "premium" : "free",
    icon: familiar.icon,
    color: familiar.color,
    nickname: familiar.nickname,
    isActive: true,
    xp: familiar.xp,
    level: familiar.level,
    xpIntoLevel: familiar.xpIntoLevel,
    xpToNextLevel: familiar.xpToNextLevel,
    evolution: {
      id: familiar.evolutionId,
      name: familiar.evolutionName,
      min_level: familiar.level,
    },
    stats: familiar.stats ?? {},
    acquiredAt: profile.createdAt,
    lastActiveAt: profile.updatedAt,
    cosmeticInventory: familiar.cosmeticInventory ?? [],
    cosmeticEquipped: familiar.cosmeticEquipped ?? {},
    cosmetics: familiar.cosmetics ?? {},
    foodStock: 0,
    affectionFeedings: 0,
    affectionHearts: 0,
    affectionMealsIntoHeart: 0,
    affectionMealsForNextHeart: 0,
    affectionMealsUntilNextHeart: 0,
    affectionRewardedHearts: [],
    heartRequirements: [],
    heartRewards: [],
    enclosureLastCleanedAt: null,
    enclosureCooldownRemainingSeconds: 0,
  };
}

function publicFamiliarFromCollection(collection: FamiliarCollection | null): OwnedFamiliar | null {
  if (!collection) return null;
  return (
    collection.owned.find((entry) => entry.isActive) ??
    collection.owned[0] ??
    null
  );
}

export function PublicFamiliar() {
  const { userId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { walletOf } = useStore();
  const { notify } = useToast();
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [collection, setCollection] = useState<FamiliarCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileData, familiarData] = await Promise.all([
        apiGetProfile(userId),
        fetchUserFamiliars(userId).catch(() => null),
      ]);
      setProfile(profileData);
      setCollection(familiarData);
    } catch {
      setProfile(null);
      setCollection(null);
      setError("Ce familier est introuvable ou indisponible.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const familiar = useMemo(
    () => publicFamiliarFromCollection(collection) ?? (profile ? familiarFromProfile(profile) : null),
    [collection, profile],
  );
  const isOwnProfile = currentUser?.id === profile?.id;
  const wallet = walletOf(currentUser?.id ?? "__anon__");
  const availableSylvins = wallet.balance;

  async function sendDonation() {
    if (!profile || !familiar) return;
    if (!currentUser?.id) {
      notify("Connecte-toi pour faire un don au familier.", "info");
      navigate("/connexion", { state: { from: location.pathname } });
      return;
    }
    if (currentUser.id === profile.id) {
      notify("Tu peux gérer ton familier depuis ton espace personnel.", "info");
      navigate("/familier");
      return;
    }

    const parsed = Number(customAmount.trim());
    const amount = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : selectedAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Choisis un montant valide.", "error");
      return;
    }
    if (amount > availableSylvins) {
      notify("Tu n'as pas assez de Sylvins pour ce don.", "error");
      return;
    }

    setSending(true);
    try {
      await giftFamiliar(profile.id, currentUser.id, amount);
      notify(`Don envoyé au familier de ${profile.username}.`, "success");
      setGiftOpen(false);
      setCustomAmount("");
      await load();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Impossible d'envoyer le don pour le moment.",
        "error",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-16 text-center text-ivory/70">
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold-200" />
          <p className="mt-4">Chargement du familier public…</p>
        </div>
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-ivory/70">
        <p className="font-display text-2xl text-gold-100">Familier introuvable</p>
        <p className="mt-3 text-sm text-ivory/60">
          {error ?? "Ce membre n'a pas encore de familier visible publiquement."}
        </p>
        <Link to={`/u/${encodeURIComponent(userId)}`} className="btn-gold mt-6 inline-flex">
          <ArrowLeft className="h-4 w-4" /> Retour au profil
        </Link>
      </section>
    );
  }

  if (!familiar) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-10">
        <div className="card-royal overflow-hidden p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                Familier public
              </p>
              <h1 className="mt-2 font-display text-3xl text-gold-100">
                Familier de {profile.username}
              </h1>
              <p className="mt-3 text-sm text-ivory/65">
                Ce membre n'a pas encore de familier visible publiquement.
              </p>
            </div>
            <AvatarImage
              candidates={[profile.avatarImageUrl]}
              fallbackSeed={profile.id}
              alt={profile.username}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-gold-300/35"
            />
          </div>

          <Link to={`/u/${encodeURIComponent(profile.id)}`} className="btn-gold mt-6 inline-flex">
            <ArrowLeft className="h-4 w-4" /> Retour au profil
          </Link>
        </div>
      </section>
    );
  }

  const hearts = Math.max(0, familiar.affectionHearts ?? 0);

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={`/u/${encodeURIComponent(profile.id)}`} className="chip-app">
          <ArrowLeft className="h-4 w-4" />
          Retour au profil
        </Link>
        {isOwnProfile ? (
          <Link to="/familier" className="chip-app border-gold-300/25 bg-gold-500/10 text-gold-100">
            <Shield className="h-4 w-4" />
            Mon familier
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            className="chip-app border-gold-300/25 bg-gold-500/10 text-gold-100"
          >
            <Gift className="h-4 w-4" />
            Faire un don
          </button>
        )}
      </div>

      <motion.div
        className="card-royal overflow-hidden p-5 sm:p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-35"
             style={{
               background: `radial-gradient(circle at 50% 0%, ${familiar.color}44, transparent 68%), linear-gradient(180deg, rgba(15, 10, 24, 0.05), rgba(15, 10, 24, 0.42))`,
             }}
        />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(260px,360px),1fr] lg:items-center">
          <div className="flex flex-col items-center text-center">
            <AvatarImage
              candidates={[profile.avatarImageUrl]}
              fallbackSeed={profile.id}
              alt={profile.username}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-gold-300/35"
            />
            <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-gold-300/75">
              Familier de
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-100 sm:text-4xl">
              {profile.username}
            </h1>
            <Handle handle={profile.handle} className="mt-1" />

            <div className="mt-4 w-full max-w-sm rounded-[28px] border border-white/10 bg-night-950/55 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
              <FamiliarPortrait familiar={familiar} size="lg" />
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/35 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-100">
                Niveau {familiar.level}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ivory/75">
                {familiar.nickname || familiar.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ivory/75">
                {familiar.tier === "premium" ? "Premium" : "Gratuit"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading
              align="left"
              eyebrow="Vue publique"
              title={familiar.nickname || familiar.name}
            />
            <p className="max-w-2xl text-sm leading-6 text-ivory/72">
              Ici, tu vois uniquement les informations publiques du familier de{" "}
              <span className="font-semibold text-gold-100">{profile.username}</span>.
              La gestion, la nourriture et l'enclos restent privés au propriétaire.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                  Cœurs publics
                </p>
                <p className="mt-2 text-2xl font-display text-gold-100">{hearts}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                  XP
                </p>
                <p className="mt-2 text-2xl font-display text-gold-100">{familiar.xp}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                  Évolution
                </p>
                <p className="mt-2 text-base font-semibold text-ivory/88">
                  {familiar.evolution.name}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                  Dernière activité
                </p>
                <p className="mt-2 text-base font-semibold text-ivory/88">
                  {formatRelative(profile.updatedAt)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(familiar.stats ?? {})
                .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
                .slice(0, 6)
                .map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ivory/72"
                  >
                    {key}: {value}
                  </span>
                ))}
            </div>

            {!isOwnProfile && (
              <div className="rounded-[26px] border border-gold-300/20 bg-gradient-to-br from-gold-500/10 via-night-950/70 to-night-950 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                      Soutenir ce familier
                    </p>
                    <h2 className="mt-1 font-display text-2xl text-gold-100">
                      Faire un don en Sylvins
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-ivory/70">
                      Les dons donnent de l'XP au familier du membre visité. Le débit est
                      sécurisé côté serveur.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-night-950/55 px-4 py-3 text-sm text-ivory/70">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                      Ton solde
                    </p>
                    <p className="mt-1 font-display text-2xl text-gold-100">
                      {formatSylvins(availableSylvins)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {PRESET_DONATIONS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        setSelectedAmount(amount);
                        setCustomAmount("");
                        setGiftOpen(true);
                      }}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/40 hover:text-gold-100"
                    >
                      {formatSylvins(amount)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGiftOpen(true)}
                    className="rounded-full border border-gold-300/25 bg-gold-500/12 px-4 py-2 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/18"
                  >
                    Montant personnalisé
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {giftOpen && !isOwnProfile && (
          <div className="fixed inset-0 z-[280] bg-night-950/80 backdrop-blur-md">
            <div className="flex h-full w-full items-end justify-center p-4 sm:items-center">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.98 }}
                className="w-full max-w-lg rounded-[30px] border border-white/10 bg-night-950 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.56)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
                      Don au familier
                    </p>
                    <h3 className="mt-1 font-display text-2xl text-gold-100">
                      {familiar.nickname || familiar.name}
                    </h3>
                    <p className="mt-2 text-sm text-ivory/65">
                      Choisis un montant de Sylvins à offrir.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGiftOpen(false)}
                    className="rounded-full border border-white/10 p-2 text-ivory/70 transition hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {PRESET_DONATIONS.map((amount) => {
                    const active = selectedAmount === amount && !customAmount.trim();
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setSelectedAmount(amount);
                          setCustomAmount("");
                        }}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          active
                            ? "border-gold-300/50 bg-gold-500/15 text-gold-100"
                            : "border-white/10 bg-white/[0.04] text-ivory/80 hover:border-gold-300/35"
                        }`}
                      >
                        {formatSylvins(amount)}
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 block">
                  <span className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                    Montant personnalisé
                  </span>
                  <input
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Ex. 25"
                    inputMode="numeric"
                    className="glass-input mt-2 w-full"
                  />
                </label>

                <div className="mt-4 rounded-[22px] border border-white/10 bg-night-900/65 p-3 text-sm text-ivory/70">
                  <div className="flex items-center justify-between gap-3">
                    <span>Solde disponible</span>
                    <span className="font-semibold text-gold-100">
                      {formatSylvins(availableSylvins)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>Receveur</span>
                    <span className="font-semibold text-ivory/90">{profile.username}</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setGiftOpen(false)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/75"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendDonation()}
                    disabled={sending}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500/20 px-5 py-2 text-sm font-semibold text-gold-100 disabled:opacity-60"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Envoi…
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Envoyer le don
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-3 text-[11px] text-ivory/45">
                  Le don débite ton solde de Sylvins et envoie de l'XP au familier de{" "}
                  {profile.username}.
                </p>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
