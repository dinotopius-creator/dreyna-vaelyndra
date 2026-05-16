import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, User, VenusAndMars, Wand2 } from "lucide-react";
import clsx from "clsx";
import { AvatarViewer } from "./AvatarViewer";
import {
  AVATAR_3D_EYE_COLORS,
  AVATAR_3D_HAIR_COLORS,
  AVATAR_3D_SKIN_TONES,
  buildAvatar3DPosterDataUrl,
  buildAvatar3DUrl,
  decodeAvatar3DUrl,
  DEFAULT_AVATAR_3D_CONFIG,
  type Avatar3DConfig,
  type Avatar3DBodyType,
  type Avatar3DFaceShape,
  type Avatar3DHairStyle,
} from "../lib/avatar3d";

interface Props {
  initialAvatarUrl?: string | null;
  defaultSeed: string;
  onExport: (input: { avatarUrl: string; avatarImageUrl: string }) => void;
  onClose?: () => void;
  className?: string;
  equippedFrameId?: string | null;
  equippedSceneId?: string | null;
  equippedOutfit3DId?: string | null;
  equippedAccessory3DId?: string | null;
}

const FACE_SHAPES: { id: Avatar3DFaceShape; label: string; note: string }[] = [
  { id: "soft", label: "Visage doux", note: "Traits ronds et féeriques" },
  { id: "sharp", label: "Visage marqué", note: "Jawline plus affirmée" },
];

const HAIR_STYLES: { id: Avatar3DHairStyle; label: string; note: string }[] = [
  { id: "wave", label: "Ondes royales", note: "Longue chevelure fluide" },
  { id: "bob", label: "Carré runique", note: "Coupe nette et magique" },
  { id: "fade", label: "Fade guerrier", note: "Style court et précis" },
  { id: "braids", label: "Tresses sacrées", note: "Deux tresses avant" },
  { id: "ponytail", label: "Queue solaire", note: "Attache haute plus mobile" },
  { id: "afro", label: "Couronne nuage", note: "Volume rond et assume" },
  { id: "pixie", label: "Pixie lunaire", note: "Coupe courte et vive" },
];

const BODY_TYPES: { id: Avatar3DBodyType; label: string }[] = [
  { id: "femme", label: "Femme" },
  { id: "homme", label: "Homme" },
];

function ColorSwatch({
  color,
  active,
  onClick,
  label,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx(
        "h-10 w-10 rounded-full border transition",
        active
          ? "border-gold-200 ring-2 ring-gold-400/60"
          : "border-royal-500/40 hover:border-gold-300/60",
      )}
      style={{ backgroundColor: color }}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function AvatarEditor({
  initialAvatarUrl,
  defaultSeed,
  onExport,
  onClose,
  className,
  equippedFrameId = null,
  equippedSceneId = null,
  equippedOutfit3DId = null,
  equippedAccessory3DId = null,
}: Props) {
  const [config, setConfig] = useState<Avatar3DConfig>(() => {
    const parsed = decodeAvatar3DUrl(initialAvatarUrl);
    if (parsed) return parsed;
    return {
      ...DEFAULT_AVATAR_3D_CONFIG,
      bodyType: defaultSeed.length % 2 === 0 ? "femme" : "homme",
      hairStyle:
        defaultSeed.length % 3 === 0
          ? "braids"
          : defaultSeed.length % 3 === 1
            ? "wave"
            : defaultSeed.length % 5 === 0
              ? "ponytail"
              : "bob",
    };
  });

  function update<K extends keyof Avatar3DConfig>(
    key: K,
    value: Avatar3DConfig[K],
  ) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function applyExport() {
    onExport({
      avatarUrl: buildAvatar3DUrl(config),
      avatarImageUrl: buildAvatar3DPosterDataUrl(config),
    });
  }

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-3xl border border-gold-400/30 bg-night-900/80 p-6 shadow-glow-gold md:p-8",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            ✦ Studio avatar 3D
          </p>
          <h3 className="mt-1 font-display text-2xl text-gold-200">
            Sculptez votre présence
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ivory/60">
            Avatar debout, rotation à 360°, rendu live et profil unifié. Les
            tenues et accessoires 3D de la boutique se greffent ensuite dessus.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-royal-500/30 px-3 py-1.5 font-regal text-[10px] tracking-[0.22em] text-ivory/70 hover:text-rose-300"
          >
            Fermer ✕
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="mx-auto flex w-full max-w-[320px] flex-col gap-3"
        >
          <AvatarViewer
            src={buildAvatar3DUrl(config)}
            fallbackImage={buildAvatar3DPosterDataUrl(config)}
            alt="Aperçu de l'avatar 3D"
            size="portrait"
            framing="body"
            equippedFrameId={equippedFrameId}
            equippedSceneId={equippedSceneId}
            equippedOutfit3DId={equippedOutfit3DId}
            equippedAccessory3DId={equippedAccessory3DId}
          />
          <p className="text-center text-[11px] text-ivory/45">
            Faites glisser l’avatar pour le faire pivoter à 360°.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-royal-500/25 bg-night-950/50 p-4">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Silhouette
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {BODY_TYPES.map((body) => (
                <button
                  key={body.id}
                  type="button"
                  onClick={() => update("bodyType", body.id)}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                    config.bodyType === body.id
                      ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                      : "border-royal-500/30 bg-night-900/60 text-ivory/75 hover:border-gold-400/40",
                  )}
                >
                  <VenusAndMars className="h-4 w-4" />
                  {body.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2">
              {FACE_SHAPES.map((face) => (
                <button
                  key={face.id}
                  type="button"
                  onClick={() => update("faceShape", face.id)}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left transition",
                    config.faceShape === face.id
                      ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                      : "border-royal-500/30 bg-night-900/60 text-ivory/75 hover:border-gold-400/40",
                  )}
                >
                  <p className="text-sm font-semibold">{face.label}</p>
                  <p className="text-[11px] text-ivory/55">{face.note}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-royal-500/25 bg-night-950/50 p-4">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Chevelure
            </p>
            <div className="grid gap-2">
              {HAIR_STYLES.map((hair) => (
                <button
                  key={hair.id}
                  type="button"
                  onClick={() => update("hairStyle", hair.id)}
                  className={clsx(
                    "rounded-xl border px-3 py-3 text-left transition",
                    config.hairStyle === hair.id
                      ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                      : "border-royal-500/30 bg-night-900/60 text-ivory/75 hover:border-gold-400/40",
                  )}
                >
                  <p className="text-sm font-semibold">{hair.label}</p>
                  <p className="text-[11px] text-ivory/55">{hair.note}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-royal-500/25 bg-night-950/50 p-4">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Carnation
            </p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_3D_SKIN_TONES.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  label={color}
                  active={config.skinTone === color}
                  onClick={() => update("skinTone", color)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-royal-500/25 bg-night-950/50 p-4">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Couleur des yeux
            </p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_3D_EYE_COLORS.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  label={color}
                  active={config.eyeColor === color}
                  onClick={() => update("eyeColor", color)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-royal-500/25 bg-night-950/50 p-4 lg:col-span-2">
            <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Couleur des cheveux
            </p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_3D_HAIR_COLORS.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  label={color}
                  active={config.hairColor === color}
                  onClick={() => update("hairColor", color)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-ivory/45">
          <p className="inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Le rendu 3D principal sera enregistré sur votre profil.
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Les tenues et accessoires s’équipent ensuite depuis l’inventaire.
          </p>
        </div>
        <button
          type="button"
          onClick={applyExport}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110"
        >
          <Wand2 className="h-4 w-4" />
          Appliquer ce brouillon 3D
        </button>
      </div>
    </div>
  );
}
