/**
 * Crée un `MediaStreamTrack` vidéo généré à partir de l'avatar 2D de
 * l'utilisateur. Utilisé quand le streamer décide de couper sa caméra
 * pendant un live : on continue à diffuser quelque chose aux viewers
 * (l'avatar) plutôt que de leur envoyer un track ended ou un écran noir.
 *
 * Principes :
 * - Un `<canvas>` 720×720 est créé hors DOM.
 * - On y dessine en boucle : fond gradient nuit Vaelyndra, l'image de
 *   l'avatar (DiceBear SVG, PNG, JPG…), le pseudo, et un mini sous-titre
 *   "Caméra masquée". Léger flottement vertical pour ne pas avoir un
 *   rendu totalement statique.
 * - `canvas.captureStream(15)` donne un MediaStream qu'on branche sur les
 *   `RTCRtpSender` existants via `replaceTrack`. Côté viewer c'est invisible :
 *   pas de nouvelle SDP, juste un remplacement de track.
 *
 * Limites connues :
 * - Si l'URL de l'avatar n'est pas CORS-friendly (rare : DiceBear et les
 *   uploads Vaelyndra le sont), le canvas sera "tainted" et `captureStream`
 *   peut planter. Dans ce cas, `createLiveAvatarStream` retombe sur un
 *   rendu purement textuel (pseudo + initiale) sans charger l'image.
 * - Si l'URL est un modèle 3D `.glb`, on ne peut pas le rendre dans un
 *   canvas 2D ici → fallback initiale.
 */

export interface LiveAvatarStreamOptions {
  /** URL de l'avatar 2D à afficher (DiceBear SVG, PNG, JPG…). */
  avatarUrl?: string | null;
  /** Pseudo affiché sous l'avatar. */
  username: string;
  /** Taille du canvas (px). Carré. */
  size?: number;
  /** Fréquence d'image du stream. */
  fps?: number;
}

export interface LiveAvatarStreamHandle {
  /** Le MediaStream à brancher dans les `RTCRtpSender`. */
  stream: MediaStream;
  /** Stoppe l'animation et libère le track. À appeler à la réactivation
   *  de la caméra ou à l'arrêt du live. */
  stop: () => void;
}

const NIGHT_BG = "#0a0a16";
const NIGHT_BG_HALO = "#1f2348";
const GOLD = "#e8d9b0";
const GOLD_DIM = "rgba(232, 217, 176, 0.65)";

function isFlatImageUrl(url: string): boolean {
  if (url.startsWith("https://api.dicebear.com/")) return true;
  if (url.startsWith("data:image/")) return true;
  const lower = url.toLowerCase().split("?")[0];
  return (
    lower.endsWith(".svg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

/** Charge une image en tant que `HTMLImageElement` avec CORS anonymous.
 *  Résout `null` en cas d'erreur (réseau / 404 / CORS). */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Crée et démarre le flux. La fonction est asynchrone parce qu'elle
 * pré-charge l'avatar (l'utilisation du captureStream n'attend pas, mais
 * l'image ne sera dessinée qu'une fois chargée).
 */
export async function createLiveAvatarStream(
  opts: LiveAvatarStreamOptions,
): Promise<LiveAvatarStreamHandle> {
  const size = opts.size ?? 720;
  const fps = opts.fps ?? 15;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }

  const avatarUrl =
    opts.avatarUrl && isFlatImageUrl(opts.avatarUrl) ? opts.avatarUrl : null;
  const avatarImage = avatarUrl ? await loadImage(avatarUrl) : null;

  const startedAt = performance.now();
  let raf = 0;

  const drawFrame = () => {
    const t = (performance.now() - startedAt) / 1000;
    // Fond radial sombre nuit Vaelyndra.
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.05,
      size / 2,
      size / 2,
      size * 0.7,
    );
    grad.addColorStop(0, NIGHT_BG_HALO);
    grad.addColorStop(1, NIGHT_BG);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Flottement vertical lent.
    const floatY = Math.sin(t * 0.9) * (size * 0.012);

    if (avatarImage) {
      const avatarSize = size * 0.56;
      const x = (size - avatarSize) / 2;
      const y = (size - avatarSize) / 2 + floatY - size * 0.04;
      try {
        ctx.drawImage(avatarImage, x, y, avatarSize, avatarSize);
      } catch {
        // Canvas tainted : on tombe sur le rendu textuel.
      }
    } else {
      // Fallback : initiale du pseudo dans un disque doré.
      const radius = size * 0.22;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2 + floatY - size * 0.04, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232, 217, 176, 0.12)";
      ctx.fill();
      ctx.strokeStyle = GOLD_DIM;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.font = `bold ${Math.round(size * 0.22)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        (opts.username || "?").charAt(0).toUpperCase(),
        size / 2,
        size / 2 + floatY - size * 0.04,
      );
    }

    // Pseudo en grand.
    ctx.fillStyle = GOLD;
    ctx.font = `600 ${Math.round(size * 0.07)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(opts.username, size / 2, size * 0.86);

    // Sous-titre indicatif.
    ctx.fillStyle = GOLD_DIM;
    ctx.font = `400 ${Math.round(size * 0.035)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText("Caméra masquée — avatar affiché", size / 2, size * 0.92);
  };

  // Boucle d'animation au framerate du stream (suffisant et stable).
  const intervalMs = 1000 / fps;
  let lastDraw = 0;
  const loop = () => {
    const now = performance.now();
    if (now - lastDraw >= intervalMs) {
      lastDraw = now;
      drawFrame();
    }
    raf = requestAnimationFrame(loop);
  };
  drawFrame(); // 1re frame avant le 1er tick.
  raf = requestAnimationFrame(loop);

  // captureStream existe sur HTMLCanvasElement dans tous les navigateurs
  // ciblés (Chrome, Safari iOS 11+, Firefox). Pas de polyfill nécessaire.
  type CanvasWithCapture = HTMLCanvasElement & {
    captureStream?: (frameRate?: number) => MediaStream;
  };
  const capturable = canvas as CanvasWithCapture;
  if (typeof capturable.captureStream !== "function") {
    cancelAnimationFrame(raf);
    throw new Error("HTMLCanvasElement.captureStream is not supported");
  }
  const stream = capturable.captureStream(fps);

  const stop = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  };

  return { stream, stop };
}
