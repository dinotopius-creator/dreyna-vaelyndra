/**
 * Visionneuse 3D d'avatar (GLB Ready Player Me) basée sur <model-viewer>.
 *
 * Le web component est chargé dynamiquement depuis le CDN Google au premier
 * rendu afin de ne pas alourdir le bundle principal. Tant qu'il n'est pas
 * prêt, on affiche le fallback 2D (la vignette PNG habituelle).
 *
 * Features natives de <model-viewer> :
 * - rotation 360° (auto-rotate + drag)
 * - zoom molette + pinch
 * - drag & drop pour repositionner
 *
 * Ces interactions répondent directement à la demande du brief : « Rotation
 * 360°, Zoom, Rotation libre ».
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
  /** URL du fichier .glb (Ready Player Me). */
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
}

export function AvatarViewer({
  src,
  fallbackImage,
  alt = "Avatar 3D",
  size = "square",
  className,
  autoRotate = true,
  framing = "face",
}: Props) {
  const [ready, setReady] = useState(
    typeof window !== "undefined" && !!customElements.get("model-viewer"),
  );
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (ready) return undefined;
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
  }, [ready]);

  const sizeClass = {
    square: "aspect-square",
    portrait: "aspect-[3/4]",
    wide: "aspect-[16/10]",
  }[size];

  // Cadrage caméra : RPM exporte un humain debout, on recule et on remonte
  // la cible pour zoomer sur le buste sur le profil.
  const cameraOrbit = framing === "face" ? "0deg 80deg 1.7m" : "0deg 90deg 3m";

  // Fallback 2D lorsque pas de GLB, chargement KO, ou pendant le boot du CE.
  if (!src || errored || !ready) {
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
        {src && !errored && !ready && (
          <div className="absolute inset-x-0 bottom-0 bg-night-900/70 px-3 py-1.5 text-center text-[10px] uppercase tracking-[0.22em] text-gold-300">
            Chargement du rendu 3D…
          </div>
        )}
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
    </div>
  );
}
