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
import {
  buildAvatar3DPosterDataUrl,
  decodeAvatar3DUrl,
  isAvatar3DUrl,
} from "../lib/avatar3d";

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
  interactive?: boolean;
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
  "rose-dawn":
    "avatar-scene bg-[radial-gradient(ellipse_at_50%_78%,#fde68a_0%,transparent_42%),linear-gradient(180deg,#f9a8d4_0%,#fb7185_38%,#7c2d12_100%)]",
  "jade-temple":
    "avatar-scene bg-[radial-gradient(ellipse_at_50%_30%,#a7f3d0_0%,transparent_36%),linear-gradient(160deg,#064e3b_0%,#166534_45%,#0f172a_100%)]",
  "midnight-court":
    "avatar-scene bg-[radial-gradient(ellipse_at_50%_24%,#fef3c7_0%,transparent_30%),linear-gradient(140deg,#111827_0%,#312e81_45%,#4c1d95_100%)]",
  "moon-garden":
    "avatar-scene bg-[radial-gradient(ellipse_at_50%_18%,#e0e7ff_0%,transparent_24%),radial-gradient(ellipse_at_35%_78%,#86efac_0%,transparent_34%),linear-gradient(180deg,#172554_0%,#312e81_48%,#052e16_100%)]",
  "crystal-studio":
    "avatar-scene bg-[radial-gradient(ellipse_at_30%_20%,#bae6fd_0%,transparent_34%),radial-gradient(ellipse_at_76%_72%,#f0abfc_0%,transparent_32%),linear-gradient(135deg,#0f172a_0%,#164e63_52%,#581c87_100%)]",
  "throne-light":
    "avatar-scene bg-[radial-gradient(ellipse_at_50%_16%,#fef3c7_0%,transparent_34%),linear-gradient(160deg,#451a03_0%,#92400e_48%,#111827_100%)]",
  "starlit-balcony":
    "avatar-scene bg-[radial-gradient(ellipse_at_20%_22%,#f8fafc_0%,transparent_10%),radial-gradient(ellipse_at_72%_34%,#c4b5fd_0%,transparent_18%),linear-gradient(180deg,#020617_0%,#1e1b4b_58%,#111827_100%)]",
  "neon-arcade":
    "avatar-scene bg-[radial-gradient(ellipse_at_25%_30%,#22d3ee_0%,transparent_35%),radial-gradient(ellipse_at_78%_64%,#fb7185_0%,transparent_32%),linear-gradient(135deg,#020617_0%,#1e1b4b_45%,#0f172a_100%)]",
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
  interactive = true,
}: Props) {
  const sceneItem = equippedSceneId ? CATALOG_BY_ID[equippedSceneId] : null;
  const sceneId = sceneItem?.sceneId ?? null;
  const isLocal3D = isAvatar3DUrl(src);
  const shouldBootModelViewer = !!src && !isLocal3D && !isFlatImageUrl(src);
  const isVrmSource =
    typeof src === "string" &&
    (/\.vrm(\?|#|$)/i.test(src) || src.startsWith("blob:"));
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
  const cameraOrbit = framing === "face" ? "0deg 84deg 1.95m" : "0deg 90deg 2.65m";

  // Cas principal depuis le retrait de RPM : avatars 2D (SVG DiceBear,
  // PNG, JPG). On rend directement avec un <img> — pas besoin du CE 3D.
  const flat = isFlatImageUrl(src);
  const avatar3dConfig = decodeAvatar3DUrl(src);
  const renderConfig = avatar3dConfig
    ? {
        ...avatar3dConfig,
        system: "premium-v2" as const,
        baseModel: "humanoid-v4" as const,
      }
    : null;
  void equippedOutfit3DId;
  void equippedAccessory3DId;
  void autoRotate;
  void framing;
  void interactive;
  if (renderConfig) {
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
          src={buildAvatar3DPosterDataUrl(renderConfig)}
          alt={alt}
          className={clsx(
            "object-cover",
            sceneId
              ? "absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-gold-400/60 shadow-[0_0_18px_rgba(250,204,21,0.35)]"
              : "relative h-full w-full",
          )}
          draggable={false}
        />
        {equippedFrameId && <FrameOverlay itemId={equippedFrameId} />}
      </div>
    );
  }
  if (src && isVrmSource) {
    return (
      <VRMViewer
        src={src}
        alt={alt}
        autoRotate={autoRotate}
        interactive={interactive}
        className={clsx(sizeClass, className)}
      />
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
            sceneId ? "relative h-full w-full rounded-2xl" : "relative h-full w-full",
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
        camera-controls={interactive ? true : undefined}
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
