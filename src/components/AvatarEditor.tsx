/**
 * Éditeur d'avatar Ready Player Me embarqué en iframe.
 *
 * On ouvre l'interface officielle de RPM (500+ vêtements, coiffures,
 * lunettes, accessoires). L'utilisateur valide son avatar, RPM nous renvoie
 * l'URL .glb via `postMessage` (frame API v1) — on remonte cet event au
 * parent via `onExport`.
 *
 * La sous-domaine `VITE_RPM_SUBDOMAIN` permet d'utiliser un espace RPM
 * brandé (créé gratuitement en 2 min sur studio.readyplayer.me). À défaut
 * on retombe sur `demo` pour que l'éditeur fonctionne out-of-the-box.
 *
 * Doc frame API : https://docs.readyplayer.me/ready-player-me/api-reference/avatars/avatar-creator
 */
import { useEffect, useMemo, useRef } from "react";

const SUBDOMAIN =
  (import.meta.env.VITE_RPM_SUBDOMAIN as string | undefined) ?? "demo";

type RpmEventData = {
  source?: string;
  eventName?: string;
  data?: { url?: string; avatarId?: string };
};

interface Props {
  /** Avatar existant à pré-charger pour édition. */
  initialAvatarUrl?: string | null;
  onExport: (input: { glbUrl: string; pngUrl: string }) => void;
  onClose?: () => void;
  className?: string;
}

/** Dérive la miniature PNG à partir de l'URL GLB (convention RPM). */
function deriveThumbnail(glbUrl: string): string {
  return glbUrl.replace(/\.glb($|\?)/, ".png$1");
}

export function AvatarEditor({
  initialAvatarUrl,
  onExport,
  onClose,
  className,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      frameApi: "",
      clearCache: "true",
    });
    const base = `https://${SUBDOMAIN}.readyplayer.me/avatar?${params.toString()}`;
    // Permet de reprendre un avatar existant (on file à RPM son ID pour
    // qu'il démarre sur la bonne tenue). L'id = nom de fichier .glb.
    const avatarId = initialAvatarUrl?.match(/([a-f0-9-]+)\.glb/)?.[1];
    return avatarId ? `${base}&id=${avatarId}` : base;
  }, [initialAvatarUrl]);

  useEffect(() => {
    const subscribe = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      // Demande à RPM de nous envoyer les events via postMessage.
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          target: "readyplayerme",
          type: "subscribe",
          eventName: "v1.**",
        }),
        "*",
      );
    };

    const handleMessage = (ev: MessageEvent) => {
      // Les events RPM arrivent sérialisés en JSON.
      if (typeof ev.data !== "string") return;
      let payload: RpmEventData | null = null;
      try {
        payload = JSON.parse(ev.data) as RpmEventData;
      } catch {
        return;
      }
      if (!payload || payload.source !== "readyplayerme") return;

      // L'iframe demande à s'abonner au parent (frame API) à son boot.
      if (payload.eventName === "v1.frame.ready") {
        subscribe();
      }
      if (payload.eventName === "v1.avatar.exported" && payload.data?.url) {
        const glbUrl = payload.data.url;
        onExport({ glbUrl, pngUrl: deriveThumbnail(glbUrl) });
      }
    };

    window.addEventListener("message", handleMessage);
    // Certains navigateurs ne trigger pas `v1.frame.ready` dans tous les cas :
    // on tente un subscribe au load de l'iframe en filet de sécurité.
    const loadHandler = () => setTimeout(subscribe, 300);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", loadHandler);

    return () => {
      window.removeEventListener("message", handleMessage);
      iframe?.removeEventListener("load", loadHandler);
    };
  }, [onExport]);

  return (
    <div
      className={
        "relative overflow-hidden rounded-3xl border border-gold-400/30 bg-night-900/80 shadow-glow-gold " +
        (className ?? "")
      }
    >
      <iframe
        ref={iframeRef}
        title="Éditeur d'avatar Ready Player Me"
        src={src}
        allow="camera *; microphone *; clipboard-write; accelerometer; autoplay; gyroscope; xr-spatial-tracking"
        className="h-[720px] w-full border-0 md:h-[780px]"
      />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-night-900/80 px-4 py-2 font-regal text-[10px] tracking-[0.22em] text-gold-200 backdrop-blur transition hover:bg-night-800"
        >
          Fermer l'atelier ✕
        </button>
      )}
    </div>
  );
}
