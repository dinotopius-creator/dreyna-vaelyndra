/**
 * Page `/avatar` — studio d'avatar 3D local.
 *
 * On persiste maintenant une configuration `vaelyndra3d:` compacte :
 * silhouette, visage, cheveux et couleurs. Le rendu 3D est reconstruit
 * côté front et une vignette SVG est aussi générée pour les zones qui
 * consomment encore une image simple (chat, petites cartes, listes).
 *
 * Affiche :
 *   1. un aperçu de l'avatar actuel
 *   2. un atelier plié/déplié qui laisse l'utilisateur sculpter son avatar
 *   3. un bouton « Enregistrer mon avatar » qui persiste le rendu 3D
 *      côté serveur via l'API backend.
 *
 * Le profil est rechargé via ProfileContext après sauvegarde pour que le
 * nouvel avatar se propage à toute l'app (navbar, posts, chat, lives).
 */
import { useEffect, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, Sparkles, UserCog } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { AvatarViewer } from "../components/AvatarViewer";
import { AvatarEditor } from "../components/AvatarEditor";
import { AvatarShop } from "../components/AvatarShop";
import { DailyRewardCard } from "../components/DailyRewardCard";
import { InventoryPanel } from "../components/InventoryPanel";
import { SectionHeading } from "../components/SectionHeading";
import { EQUIP_SLOT } from "../lib/avatarShop";
import { PREMIUM_AVATAR_PACK } from "../data/premiumAvatarPack";

export function Avatar() {
  const { user } = useAuth();
  const { profile, refresh, saveAvatar, loading } = useProfile();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  // Brouillon : avatar composé dans l'atelier mais pas encore persisté.
  const [draft, setDraft] = useState<{
    avatarUrl: string;
    avatarImageUrl: string;
  } | null>(null);
  const [localVrmPreview, setLocalVrmPreview] = useState<string | null>(null);
  const [localVrmName, setLocalVrmName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync à l'ouverture pour afficher la dernière version (ex. l'utilisateur
  // a modifié son avatar depuis un autre appareil).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (localVrmPreview) URL.revokeObjectURL(localVrmPreview);
    };
  }, [localVrmPreview]);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-ivory/70">
          Connectez-vous pour composer votre avatar de Vaelyndra.
        </p>
        <Link
          to="/connexion"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900"
        >
          Entrer dans la cour
        </Link>
      </div>
    );
  }

  const currentAvatar =
    localVrmPreview ?? draft?.avatarUrl ?? profile?.avatarUrl ?? null;
  const currentImage =
    draft?.avatarImageUrl ?? profile?.avatarImageUrl ?? user.avatar ?? null;
  const hasDraft = !!draft;

  async function persist() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveAvatar({
        avatarUrl: draft.avatarUrl,
        avatarImageUrl: draft.avatarImageUrl,
      });
      setDraft(null);
      setEditing(false);
      notify("Votre avatar a été scellé aux archives ✨");
    } catch {
      notify(
        "L'atelier n'a pas pu sauvegarder votre avatar. Réessayez.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  function discardDraft() {
    setDraft(null);
    notify("Brouillon abandonné.", "info");
  }

  function handleLocalVrmPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isVrm = /\.vrm$/i.test(file.name) || file.type.includes("vrm");
    if (!isVrm) {
      notify("Choisissez un fichier VRM exporté depuis VRoid Studio.", "error");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setLocalVrmPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
    setLocalVrmName(file.name);
    notify("Prévisualisation VRM chargée. Export prêt pour le site.", "success");
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-8 sm:px-6 sm:py-14">
      <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
        <Link
          to="/moi"
          className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-3 py-2 font-regal text-[10px] tracking-[0.22em] text-ivory/70 hover:text-gold-200"
        >
          <ArrowLeft className="h-4 w-4" /> Mon domaine
        </Link>
        {hasDraft && (
          <span className="rounded-full border border-gold-400/50 bg-gold-500/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-gold-200">
            ✦ Brouillon non enregistré
          </span>
        )}
      </div>

      <SectionHeading
        eyebrow="Atelier d'avatar"
        title="Composez votre double magique"
        subtitle="Créez votre avatar 3D debout, faites-le pivoter à 360°, puis scellez-le sur votre compte. Vos tenues et accessoires 3D s’y greffent ensuite partout sur Vaelyndra."
      />

      <div className="mt-8 rounded-[28px] border border-gold-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(40,20,67,0.92))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-regal text-[10px] tracking-[0.24em] text-gold-300">
              ✦ {PREMIUM_AVATAR_PACK.title}
            </p>
            <h2 className="mt-2 font-display text-2xl text-gold-100 sm:text-3xl">
              Direction premium, base VRoid installée
            </h2>
            <p className="mt-3 text-sm leading-6 text-ivory/75">
              {PREMIUM_AVATAR_PACK.subtitle}
            </p>
            <ul className="mt-4 grid gap-2 text-sm text-ivory/72 sm:grid-cols-2">
              {PREMIUM_AVATAR_PACK.assets.map((asset) => (
                <li
                  key={asset.name}
                  className="rounded-2xl border border-white/10 bg-night-950/55 px-4 py-3"
                >
                  <p className="font-semibold text-gold-100">{asset.name}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ivory/45">
                    {asset.kind} · {asset.format}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-ivory/62">
                    {asset.notes}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-ivory/50">
              {PREMIUM_AVATAR_PACK.installNote}
            </p>
            <label className="mt-5 flex cursor-pointer flex-col gap-2 rounded-2xl border border-dashed border-gold-400/30 bg-night-950/45 p-4">
              <span className="text-[10px] uppercase tracking-[0.24em] text-gold-300">
                Importer un VRM exporté
              </span>
              <span className="text-sm text-ivory/70">
                Sélectionne le `.vrm` exporté depuis VRoid Studio pour le
                prévisualiser tout de suite dans le site.
              </span>
              <input
                type="file"
                accept=".vrm,model/gltf-binary"
                onChange={handleLocalVrmPick}
                className="glass-input mt-2 w-full"
              />
              {localVrmName && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-emerald-200">
                    VRM chargé: {localVrmName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (localVrmPreview) URL.revokeObjectURL(localVrmPreview);
                      setLocalVrmPreview(null);
                      setLocalVrmName(null);
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-ivory/65"
                  >
                    Retirer
                  </button>
                </div>
              )}
            </label>
          </div>

          <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[320px] lg:grid-cols-2">
            {PREMIUM_AVATAR_PACK.previews.map((preview, index) => (
              <div
                key={preview}
                className={`relative overflow-hidden rounded-2xl border border-white/10 bg-night-950/60 ${index === 0 ? "col-span-2 aspect-[16/10]" : "aspect-square"}`}
              >
                <img
                  src={preview}
                  alt={`Aperçu du pack premium ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-app space-y-5 p-5 sm:p-6 lg:sticky lg:top-24"
        >
          <AvatarViewer
            src={currentAvatar}
            fallbackImage={currentImage}
            alt={`Avatar de ${user.username}`}
            size="portrait"
            framing="face"
            equippedFrameId={profile?.equipped?.[EQUIP_SLOT.Frame] ?? null}
            equippedSceneId={profile?.equipped?.[EQUIP_SLOT.Scene] ?? null}
            equippedOutfit3DId={
              profile?.equipped?.[EQUIP_SLOT.Outfit3D] ?? null
            }
            equippedAccessory3DId={
              profile?.equipped?.[EQUIP_SLOT.Accessory3D] ?? null
            }
          />

          <div className="panel-app-soft p-4">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Aperçu
            </p>
            <p className="mt-1 text-sm text-ivory/70">
              Voilà votre avatar 3D principal. La vignette de profil, les posts,
              les commentaires et les lives s’alignent dessus automatiquement.
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110"
            >
              <UserCog className="h-4 w-4" />
              {editing ? "Fermer l'atelier" : "Ouvrir l'atelier"}
            </button>
            {hasDraft && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={persist}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-gold-400/60 bg-gold-500/15 px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-gold-200 transition hover:bg-gold-500/25 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Scellage…" : "Enregistrer mon avatar"}
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  disabled={saving}
                  className="rounded-full border border-royal-500/30 px-4 py-3 font-regal text-[11px] tracking-[0.22em] text-ivory/70 hover:text-rose-300 disabled:opacity-60"
                >
                  Annuler
                </button>
              </div>
            )}
            {!hasDraft && profile?.avatarUrl && (
              <p className="panel-app-soft pt-3 pb-2 text-center text-[10px] uppercase tracking-[0.22em] text-gold-300/70">
                <Sparkles className="mr-1 inline h-3 w-3" /> Avatar enregistré —
                modifiez puis cliquez sur Enregistrer
              </p>
            )}
            {loading && (
              <p className="text-center text-[10px] uppercase tracking-[0.22em] text-ivory/40">
                Synchronisation avec les archives…
              </p>
            )}
          </div>
        </motion.aside>

        <div className="relative">
          {editing ? (
            <AvatarEditor
              initialAvatarUrl={profile?.avatarUrl ?? null}
              defaultSeed={user.username}
              equippedFrameId={profile?.equipped?.[EQUIP_SLOT.Frame] ?? null}
              equippedSceneId={profile?.equipped?.[EQUIP_SLOT.Scene] ?? null}
              equippedOutfit3DId={
                profile?.equipped?.[EQUIP_SLOT.Outfit3D] ?? null
              }
              equippedAccessory3DId={
                profile?.equipped?.[EQUIP_SLOT.Accessory3D] ?? null
              }
              onExport={(exp) => {
                setDraft(exp);
                notify(
                  "Avatar composé — vérifiez et enregistrez pour sceller ✨",
                  "info",
                );
              }}
              onClose={() => setEditing(false)}
            />
          ) : (
            <div className="panel-app flex h-full flex-col justify-center gap-4 p-6 text-center sm:p-8">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Comment ça marche
              </p>
              <ol className="mx-auto max-w-md space-y-3 text-left text-sm text-ivory/70">
                <li>
                  1. <strong className="text-gold-200">Ouvrez l'atelier</strong>{" "}
                  pour choisir silhouette, visage et coiffure.
                </li>
                <li>
                  2. <strong className="text-gold-200">Tournez l’avatar</strong>{" "}
                  en 360° pour vérifier son rendu sous tous les angles.
                </li>
                <li>
                  3.{" "}
                  <strong className="text-gold-200">
                    Appliquez le brouillon
                  </strong>{" "}
                  — il apparaît à gauche en aperçu.
                </li>
                <li>
                  4.{" "}
                  <strong className="text-gold-200">
                    Enregistrez mon avatar
                  </strong>{" "}
                  — il est scellé sur votre compte, visible partout.
                </li>
              </ol>
              <p className="mt-3 text-xs text-ivory/50">
                Le rendu 3D est local au site. Ajoutez ensuite tenues,
                accessoires, cadres et scènes à votre collection via la boutique
                avatar ci-dessous.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
        <InventoryPanel />
        <DailyRewardCard />
      </div>

      <div className="mt-10">
        <AvatarShop />
      </div>
    </div>
  );
}
