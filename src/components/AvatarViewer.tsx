/**
 * Visionneuse d'avatar — gère deux rendus selon le type d'URL :
 *
 * 1. URL 2D (SVG DiceBear, PNG, JPG…) → simple `<img>` (cas principal
 *    depuis le retrait de Ready Player Me).
 * 2. URL 3D (`.glb`) → `<model-viewer>` chargé dynamiquement depuis le CDN
 *    Google (rotation 360°, zoom, drag). Conservé pour rétro-compat avec
 *    les quelques avatars RPM encore en base.
 *
 * Tant que le CE 3D n'est pas prêt (ou s'il échoue), on retombe sur le
 * fallback 2D (vignette existante ou texte « Avatar en attente »).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { isFlatImageUrl } from "../lib/dicebear";
import { CATALOG_BY_ID, type SceneId } from "../lib/avatarShop";
import { decodeAvatar3DUrl, isAvatar3DUrl } from "../lib/avatar3d";
import { Avatar3DModel } from "./Avatar3DModel";

/**
 * `<model-viewer>` est un web component chargé dynamiquement via CDN : on
 * contourne l'absence de type JSX natif en le castant en composant React
 * fonctionnel avec un jeu d'attributs HTML custom. TSC accepte ainsi le
 * JSX sans qu'on ait besoin d'augmenter `JSX.IntrinsicElements` (ce qui
 * est fragile avec `verbatimModuleSyntax`).
 */
type ModelViewerProps = {
  src?: string;
  alt?: string;
  poster?: string;
  "camera-controls"?: boolean | "";
  "auto-rotate"?: "" | undefined;
  "auto-rotate-delay"?: string | number;
  "shadow-intensity"?: string | number;
  "camera-orbit"?: string;
  "field-of-view"?: string;
  exposure?: string | number;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "manual" | "interaction";
  style?: CSSProperties;
  children?: ReactNode;
};
const ModelViewer = "model-viewer" as unknown as FC<ModelViewerProps>;

const MODEL_VIEWER_SRC =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

let modelViewerPromise: Promise<void> | null = null;

function ensureModelViewer(): Promise<void> {
  if (modelViewerPromise) return modelViewerPromise;
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("model-viewer")) {
    modelViewerPromise = Promise.resolve();
    return modelViewerPromise;
  }
  const wrapped: Promise<void> = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${MODEL_VIEWER_SRC}"]`,
    );
    const handleLoad = () =>
      customElements
        .whenDefined("model-viewer")
        .then(() => resolve())
        .catch(reject);
    if (existing) {
      handleLoad();
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = MODEL_VIEWER_SRC;
    script.onload = handleLoad;
    script.onerror = () => {
      // En cas d'échec réseau transitoire : on retire le script et on laisse
      // la prochaine demande retenter (sinon le rejet resterait caché et tous
      // les AvatarViewer suivants tomberaient sur le fallback 2D jusqu'au F5).
      script.remove();
      reject(new Error("Impossible de charger model-viewer"));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    // Réinitialise le cache si c'était encore notre tentative en cours,
    // pour permettre un retry naturel au prochain rendu.
    if (modelViewerPromise === wrapped) modelViewerPromise = null;
    throw err;
  });
  modelViewerPromise = wrapped;
  return wrapped;
}

interface Props {
  /** URL DiceBear SVG ou GLB 3D légacy. */
  src: string | null | undefined;
  /** Vignette PNG affichée en fallback et comme poster avant chargement. */
  fallbackImage?: string | null;
  alt?: string;
  /** Taille : `square` pour le profil, `portrait` pour la fiche live. */
  size?: "square" | "portrait" | "wide";
  className?: string;
  /** Désactive l'auto-rotation (utile en miniature). */
  autoRotate?: boolean;
  /** Cadre la caméra sur le visage (profil) ou sur le corps (live). */
  framing?: "face" | "body";
  /**
   * Id d'une parure équipée (slot `frame`). Quand fourni, on superpose
   * l'emoji correspondant au coin supérieur droit de l'avatar.
   */
  equippedFrameId?: string | null;
  /**
   * Id d'une scène équipée (slot `scene`). Quand fourni, on rend un
   * dégradé animé en arrière-plan et on réduit l'avatar en médaillon
   * centré pour que la scène joue le rôle de halo illustré.
   */
  equippedSceneId?: string | null;
  equippedOutfit3DId?: string | null;
  equippedAccessory3DId?: string | null;
}

function FrameOverlay({ itemId }: { itemId: string }) {
  const item = CATALOG_BY_ID[itemId];
  if (!item?.frameGlyph) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-2 top-2 select-none text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
    >
      {item.frameGlyph}
    </span>
  );
}

/**
 * Dictionnaire central des styles inline associés à chaque scène. On
 * préfère des dégradés CSS pur (radial + conic) plutôt que des images :
 * ça rend bien à toutes les tailles, ça tourne sans réseau, et ça reste
 * léger côté bundle. Les animations sont définies dans `src/index.css`.
 */
const SCENE_STYLES: Record<SceneId, string> = {
  cosmos:
    "avatar-scene avatar-scene--cosmos bg-[radial-gradient(ellipse_at_20%_20%,#7c3aed_0%,transparent_50%),radial-gradient(ellipse_at_80%_70%,#ec4899_0%,transparent_60%),linear-gradient(135deg,#0f172a,#1e1b4b)]",
  "forest-glow":
    "avatar-scene avatar-scene--forest bg-[radial-gradient(ellipse_at_50%_40%,#34d39980_0%,transparent_60%),linear-gradient(180deg,#064e3b,#0f172a)]",
  sunrise:
    "avatar-scene avatar-scene--sunrise bg-[radial-gradient(ellipse_at_50%_80%,#fbbf24_0%,#ea580c_40%,#7c2d12_80%)]",
  ocean:
    "avatar-scene avatar-scene--ocean bg-[radial-gradient(ellipse_at_30%_60%,#22d3ee_0%,transparent_60%),linear-gradient(160deg,#0e7490,#0f172a)]",
  aurora:
    "avatar-scene avatar-scene--aurora bg-[linear-gradient(125deg,#312e81_0%,#166534_35%,#a21caf_60%,#1e1b4b_100%)]",
  flames:
    "avatar-scene avatar-scene--flames bg-[radial-gradient(ellipse_at_50%_90%,#60a5fa_0%,#2563eb_40%,#1e1b4b_80%)]",
};

function SceneBackground({ sceneId }: { sceneId: string }) {
  const style = SCENE_STYLES[sceneId as SceneId];
  if (!style) return null;
  return <div aria-hidden className={clsx("absolute inset-0", style)} />;
}

export function AvatarViewer({
  src,
  fallbackImage,
  alt = "Avatar 3D",
  size = "square",
  className,
  autoRotate = true,
  framing = "face",
  equippedFrameId,
  equippedSceneId,
  equippedOutfit3DId,
  equippedAccessory3DId,
}: Props) {
  const sceneItem = equippedSceneId ? CATALOG_BY_ID[equippedSceneId] : null;
  const sceneId = sceneItem?.sceneId ?? null;
  const isLocal3D = isAvatar3DUrl(src);
  const shouldBootModelViewer = !!src && !isLocal3D && !isFlatImageUrl(src);
  const [ready, setReady] = useState(
    typeof window !== "undefined" && !!customElements.get("model-viewer"),
  );
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!shouldBootModelViewer || ready) return undefined;
    ensureModelViewer()
      .then(() => {
        if (mountedRef.current) setReady(true);
      })
      .catch((err) => {
        console.warn("model-viewer KO :", err);
        if (mountedRef.current) setErrored(true);
      });
    return () => {
      mountedRef.current = false;
    };
  }, [ready, shouldBootModelViewer]);

  const sizeClass = {
    square: "aspect-square",
    portrait: "aspect-[3/4]",
    wide: "aspect-[16/10]",
  }[size];

  // Cadrage caméra : RPM exporte un humain debout, on recule et on remonte
  // la cible pour zoomer sur le buste sur le profil.
  const cameraOrbit = framing === "face" ? "0deg 80deg 1.7m" : "0deg 90deg 3m";

  // Cas principal depuis le retrait de RPM : avatars 2D (SVG DiceBear,
  // PNG, JPG). On rend directement avec un <img> — pas besoin du CE 3D.
  const flat = isFlatImageUrl(src);
  const avatar3dConfig = decodeAvatar3DUrl(src);
  const outfitTheme =
    equippedOutfit3DId && CATALOG_BY_ID[equippedOutfit3DId]?.wearableThemeId
      ? (CATALOG_BY_ID[equippedOutfit3DId]!.wearableThemeId as
          | "royal"
          | "battle"
          | "mystic"
          | "shadow")
      : "royal";
  const accessoryTheme =
    equippedAccessory3DId && CATALOG_BY_ID[equippedAccessory3DId]?.wearableThemeId
      ? (CATALOG_BY_ID[equippedAccessory3DId]!.wearableThemeId as
          | "crown"
          | "halo"
          | "horns")
      : null;
  if (avatar3dConfig) {
    return (
      <div
        className={clsx(
          "relative overflow-hidden rounded-2xl border border-gold-400/30 bg-night-900/60",
          sizeClass,
          className,
        )}
      >
        {sceneId && <SceneBackground sceneId={sceneId} />}
        <Avatar3DModel
          config={avatar3dConfig}
          size={size}
          autoRotate={autoRotate}
          outfit={outfitTheme}
          accessory={accessoryTheme}
          className={clsx(
            sceneId &&
              "absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-gold-400/60 shadow-[0_0_18px_rgba(250,204,21,0.35)]",
          )}
        />
        {equippedFrameId && <FrameOverlay itemId={equippedFrameId} />}
      </div>
    );
  }
  if (src && flat) {
    return (
      <div
        className={clsx(
          "relative overflow-hidden rounded-2xl border border-gold-400/30 bg-night-900/60",
          sizeClass,
          className,
        )}
      >
        {sceneId && <SceneBackground sceneId={sceneId} />}
        <img
          src={src}
          alt={alt}
          className={clsx(
            "object-cover",
            sceneId
              ? // En présence d'une scène, l'avatar devient un médaillon
                // centré et arrondi : la scène joue le rôle de halo illustré
                // tout autour. Un ring doré souligne le médaillon.
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[82%] w-[82%] rounded-full ring-2 ring-gold-400/60 shadow-[0_0_18px_rgba(250,204,21,0.35)]"
              : "relative h-full w-full",
          )}
          draggable={false}
        />
        {equippedFrameId && <FrameOverlay itemId={equippedFrameId} />}
      </div>
    );
  }

  // Fallback 2D lorsque pas de src, chargement GLB KO, ou pendant le boot du CE.
  if (!src || errored || (shouldBootModelViewer && !ready)) {
    return (
      <div
        className={clsx(
          "relative overflow-hidden rounded-2xl border border-gold-400/30 bg-night-900/60",
          sizeClass,
          className,
        )}
      >
        {fallbackImage ? (
          <img
            src={fallbackImage}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ivory/40">
            Avatar en attente
          </div>
        )}
        {src && shouldBootModelViewer && !errored && !ready && (
          <div className="absolute inset-x-0 bottom-0 bg-night-900/70 px-3 py-1.5 text-center text-[10px] uppercase tracking-[0.22em] text-gold-300">
            Chargement du rendu 3D…
          </div>
        )}
        {equippedFrameId && <FrameOverlay itemId={equippedFrameId} />}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-gold-400/30 bg-gradient-to-br from-night-900/60 to-royal-900/40",
        sizeClass,
        className,
      )}
    >
      <ModelViewer
        src={src}
        alt={alt}
        poster={fallbackImage ?? undefined}
        camera-controls
        auto-rotate={autoRotate ? "" : undefined}
        auto-rotate-delay="1500"
        shadow-intensity="1"
        exposure="1.1"
        camera-orbit={cameraOrbit}
        field-of-view="32deg"
        loading="lazy"
        reveal="auto"
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "transparent",
        }}
      />
      {equippedFrameId && <FrameOverlay itemId={equippedFrameId} />}
    </div>
  );
}
