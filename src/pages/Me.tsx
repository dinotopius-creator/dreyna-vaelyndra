import { useRef, useState } from "react";
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
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useToast } from "../contexts/ToastContext";
import { useProfile } from "../contexts/ProfileContext";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarViewer } from "../components/AvatarViewer";
import { formatDate, formatPrice, resizeImageToDataUrl } from "../lib/helpers";
import {
  MIN_PAYOUT_EUR,
  PLATFORM_CUT,
  formatEur,
  formatSylvins,
  sylvinsToNetEur,
} from "../lib/sylvins";

export function Me() {
  const { user, updateProfile } = useAuth();
  const { articles, orders, products, myWallet } = useStore();
  const { profile: serverProfile } = useProfile();
  const { notify } = useToast();
  const [bio, setBio] = useState(user?.bio ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = updateProfile({ username, avatar, bio });
    if (!res.ok) {
      notify(res.error ?? "Impossible d'enregistrer.", "error");
      return;
    }
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
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
              {user.role === "queen"
                ? "Reine de Vaelyndra"
                : user.role === "knight"
                  ? "Chevalier·e lunaire"
                  : "Elfe de la cour"}
            </p>
            <h1 className="mt-1 font-display text-3xl text-gold-200 md:text-4xl">
              {user.username}
            </h1>
            <p className="mt-1 text-sm text-ivory/60">
              Entré·e à la cour le {formatDate(user.joinedAt)}
            </p>
          </div>
          {user.role === "queen" && (
            <span className="rounded-full border border-gold-400/50 bg-gold-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-gold-200">
              <Crown className="mr-1 inline h-3 w-3" /> Trône
            </span>
          )}
        </div>

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
              Astuce : tu peux sauvegarder ta photo ZEPETO sur ton PC, puis cliquer "Importer". Max 5 Mo.
            </p>
          </motion.div>
        )}

        <form onSubmit={saveProfile} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="font-regal text-[10px] tracking-[0.22em] text-ivory/60">
              Nom elfique
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
              value={
                user.role === "queen"
                  ? "Reine de Vaelyndra"
                  : user.role === "knight"
                    ? "Chevalier·e lunaire"
                    : "Elfe de la cour"
              }
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
              placeholder="Parlez de votre place dans Vaelyndra..."
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
          eyebrow="Avatar de Vaelyndra"
          title={<>Votre double <span className="text-mystic">elfique</span></>}
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
            />
          </div>
          <div className="card-royal flex flex-col justify-between gap-5 p-6">
            <div>
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Personnalisez votre avatar
              </p>
              <p className="mt-2 text-sm text-ivory/75">
                Six styles d'illustration, des milliers de combinaisons via les
                dés. Votre avatar est sauvegardé sur le serveur et vous retrouve
                sur tous vos appareils.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-ivory/65">
                <li>• Choix du style, du seed et de la couleur de fond</li>
                <li>• Aperçu instantané, enregistrement en un clic</li>
                <li>• Prêt pour la boutique d'items et les lives</li>
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
            <p className="mt-3 font-display text-3xl text-gold-200">
              {formatSylvins(myWallet.earnings)} Sylvins
            </p>
            <p className="mt-1 text-xs text-ivory/60">
              Net estimé :{" "}
              <span className="text-gold-200">
                {formatEur(sylvinsToNetEur(myWallet.earnings))}
              </span>{" "}
              (après {Math.round(PLATFORM_CUT * 100)}% de frais plateforme)
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-night-900/60">
              <div
                className="h-full bg-gold-shine"
                style={{
                  width: `${Math.min(
                    100,
                    (sylvinsToNetEur(myWallet.earnings) / MIN_PAYOUT_EUR) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-ivory/50">
              Seuil de retrait : {formatEur(MIN_PAYOUT_EUR)}
            </p>
            <button
              type="button"
              className="btn-royal mt-4 inline-flex disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              title="Branchement Stripe Connect en cours — disponible après mise en ligne du VPS."
            >
              <Banknote className="h-4 w-4" /> Retirer en € (bientôt)
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          align="left"
          eyebrow="Activité"
          title="Votre place dans la cour"
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
