/**
 * Page `/avatar` — atelier complet pour personnaliser et sauvegarder son
 * avatar 3D Ready Player Me. Affiche :
 *
 * 1. Un visualiseur 3D (<AvatarViewer>) avec rotation 360°, zoom et drag
 * 2. Un bouton "Ouvrir l'atelier" qui révèle l'éditeur RPM en iframe
 * 3. Un bouton "Enregistrer mon avatar" qui persiste `avatar_url` +
 *    `avatar_image_url` en base via l'API backend.
 *
 * Le profil est rechargé dans le ProfileContext après sauvegarde pour
 * propager le nouvel avatar à toute l'app (navbar, posts, chat).
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, Sparkles, UserCog } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { AvatarViewer } from "../components/AvatarViewer";
import { AvatarEditor } from "../components/AvatarEditor";
import { SectionHeading } from "../components/SectionHeading";

export function Avatar() {
  const { user } = useAuth();
  const { profile, refresh, saveAvatar, loading } = useProfile();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  // Brouillon : avatar exporté par RPM mais pas encore persisté côté serveur.
  const [draft, setDraft] = useState<{
    glbUrl: string;
    pngUrl: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync à l'ouverture pour être certain d'afficher la dernière version
  // (ex. l'utilisateur a modifié son avatar depuis un autre device).
  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const currentGlb = draft?.glbUrl ?? profile?.avatarUrl ?? null;
  const currentPng =
    draft?.pngUrl ?? profile?.avatarImageUrl ?? user.avatar ?? null;
  const hasDraft = !!draft;

  async function persist() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveAvatar({
        avatarUrl: draft.glbUrl,
        avatarImageUrl: draft.pngUrl,
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <Link
          to="/moi"
          className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-4 py-2 font-regal text-[10px] tracking-[0.22em] text-ivory/70 hover:text-gold-200"
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
        title="Composez votre double elfique"
        subtitle="Cheveux, yeux, tenues, accessoires… explorez le catalogue Ready Player Me. Tout est sauvegardé sur votre compte — vous retrouverez votre avatar sur tous vos appareils."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-royal space-y-5 p-6"
        >
          <AvatarViewer
            src={currentGlb}
            fallbackImage={currentPng}
            alt={`Avatar de ${user.username}`}
            size="portrait"
            framing="face"
          />

          <div>
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Aperçu
            </p>
            <p className="mt-1 text-sm text-ivory/70">
              Tournez à 360°, zoomez et faites glisser pour examiner votre
              avatar sous toutes les coutures. C'est la vue qu'afficheront vos
              posts et vos lives.
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110"
            >
              <UserCog className="h-4 w-4" />
              {editing ? "Fermer l'atelier" : "Ouvrir l'atelier RPM"}
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
              <p className="pt-1 text-center text-[10px] uppercase tracking-[0.22em] text-gold-300/70">
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
              onExport={(exp) => {
                setDraft(exp);
                setEditing(false);
                notify(
                  "Avatar capturé — vérifiez et enregistrez pour sceller ✨",
                  "info",
                );
              }}
              onClose={() => setEditing(false)}
            />
          ) : (
            <div className="card-royal flex h-full flex-col justify-center gap-4 p-8 text-center">
              <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                ✦ Comment ça marche
              </p>
              <ol className="mx-auto max-w-md space-y-3 text-left text-sm text-ivory/70">
                <li>
                  1. <strong className="text-gold-200">Ouvrez l'atelier</strong>{" "}
                  — prenez un selfie ou choisissez un corps de départ.
                </li>
                <li>
                  2. <strong className="text-gold-200">Personnalisez</strong>{" "}
                  cheveux, yeux, peau, vêtements, accessoires…
                </li>
                <li>
                  3. <strong className="text-gold-200">Validez</strong> dans
                  l'éditeur — votre avatar apparaît ici en brouillon.
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
                L'éditeur est fourni par Ready Player Me, service gratuit
                spécialisé dans les avatars 3D.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
