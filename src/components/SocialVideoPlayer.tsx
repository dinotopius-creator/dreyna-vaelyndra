import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type SocialVideoPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
  videoClassName?: string;
  autoPlay?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  showChrome?: boolean;
};

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const rounded = Math.floor(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SocialVideoPlayer({
  src,
  poster,
  className,
  videoClassName,
  autoPlay = true,
  muted,
  onMutedChange,
  showChrome = true,
}: SocialVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [internalMuted, setInternalMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const effectiveMuted = muted ?? internalMuted;
  const progress = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const setMuted = (next: boolean) => {
    if (muted !== undefined) {
      onMutedChange?.(next);
      return;
    }
    setInternalMuted(next);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = effectiveMuted;
  }, [effectiveMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let mounted = true;
    const syncTracks = () => {
      if (!mounted) return;
      const tracks = (video as HTMLVideoElement & {
        audioTracks?: { length: number } | null;
        mozHasAudio?: boolean;
      }).audioTracks;
      const mozHasAudio = (video as HTMLVideoElement & { mozHasAudio?: boolean }).mozHasAudio;
      if (tracks && typeof tracks.length === "number") {
        setHasAudio(tracks.length > 0);
      } else if (typeof mozHasAudio === "boolean") {
        setHasAudio(mozHasAudio);
      } else {
        setHasAudio(null);
      }
    };

    const onLoadedMetadata = () => {
      if (!mounted) return;
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setCurrentTime(video.currentTime || 0);
      syncTracks();
      if (autoPlay) {
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    };

    const onTimeUpdate = () => {
      if (!mounted) return;
      setCurrentTime(video.currentTime || 0);
    };

    const onPlay = () => mounted && setIsPlaying(true);
    const onPause = () => mounted && setIsPlaying(false);
    const onEnded = () => mounted && setIsPlaying(false);
    const onVolumeChange = () => {
      if (!mounted) return;
      syncTracks();
      if (!video.muted && hasAudio === false) {
        setNotice("Cette vidéo n'a pas de son.");
      }
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("volumechange", onVolumeChange);

    syncTracks();

    const onFullscreenChange = () => {
      const native = document.fullscreenElement === wrapperRef.current;
      setIsNativeFullscreen(native);
      if (!native) {
        setIsFallbackFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      mounted = false;
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("volumechange", onVolumeChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [autoPlay, hasAudio]);

  useEffect(() => {
    if (!isFallbackFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFallbackFullscreen]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        /* ignore autoplay restrictions */
      }
    } else {
      video.pause();
    }
  }

  function seek(nextTime: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) return;
    const clamped = Math.min(Math.max(0, nextTime), duration || video.duration || nextTime);
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }

  async function toggleFullscreen() {
    const node = wrapperRef.current;
    if (!node) return;

    if (document.fullscreenElement === node) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }

    if (node.requestFullscreen) {
      try {
        await node.requestFullscreen();
        return;
      } catch {
        /* fall back below */
      }
    }

    setIsFallbackFullscreen(true);
  }

  async function handleToggleMute() {
    const nextMuted = !effectiveMuted;
    if (!nextMuted && hasAudio === false) {
      setNotice("Cette vidéo n'a pas de son.");
      setMuted(true);
      return;
    }
    setNotice(null);
    setMuted(nextMuted);
    const video = videoRef.current;
    if (video) {
      video.muted = nextMuted;
      if (!nextMuted) {
        try {
          await video.play();
        } catch {
          /* ignore */
        }
      }
    }
  }

  const chromeVisible = showChrome;
  const rootClassName = clsx(
    "relative overflow-hidden bg-night-800",
    isFallbackFullscreen && "fixed inset-0 z-[300] rounded-none",
    !isFallbackFullscreen && "rounded-xl border border-royal-500/30",
    className,
  );

  return (
    <div ref={wrapperRef} className={rootClassName}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className={clsx("block h-full w-full bg-night-800 object-cover", videoClassName)}
        muted={effectiveMuted}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-night-950/55 via-night-950/15 to-night-950/10 pointer-events-none" />

      {chromeVisible && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
          {notice && (
            <div className="pointer-events-none self-start rounded-full border border-white/10 bg-night-950/70 px-3 py-1 text-[11px] text-ivory/80 backdrop-blur-md">
              {notice}
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-night-950/72 p-3 backdrop-blur-md">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void togglePlay();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:border-gold-400/45 hover:text-gold-100"
                aria-label={isPlaying ? "Mettre la vidéo en pause" : "Lire la vidéo"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleToggleMute();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-ivory/90 transition hover:border-gold-400/45 hover:text-gold-100"
                aria-label={effectiveMuted ? "Activer le son" : "Couper le son"}
              >
                {effectiveMuted ? (
                  <>
                    <VolumeX className="h-4 w-4" />
                    Muet
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4" />
                    Son
                  </>
                )}
              </button>

              <div className="min-w-0 flex-1 text-right text-[11px] tabular-nums text-ivory/65">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleFullscreen();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-ivory/90 transition hover:border-gold-400/45 hover:text-gold-100"
                aria-label="Plein écran vidéo"
              >
                {isNativeFullscreen || isFallbackFullscreen ? (
                  <>
                    <Minimize2 className="h-4 w-4" />
                    Quitter
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-4 w-4" />
                    Plein écran
                  </>
                )}
              </button>
            </div>

            <label className="flex items-center gap-3">
              <div className="sr-only">
                {progress.toFixed(1)}%
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0)}
                step="0.05"
                value={Math.min(currentTime, duration || currentTime)}
                onChange={(event) => {
                  event.stopPropagation();
                  seek(Number(event.target.value));
                }}
                className="social-video-range h-1 w-full cursor-pointer accent-gold-300"
                aria-label="Position de lecture"
              />
            </label>
          </div>
        </div>
      )}

      {isFallbackFullscreen && (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 p-3">
          <div className="rounded-full border border-white/10 bg-night-950/70 px-3 py-1 text-[11px] text-ivory/75 backdrop-blur-md">
            Mode plein écran
          </div>
          <button
            type="button"
            onClick={() => setIsFallbackFullscreen(false)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-night-950/70 px-3 text-xs text-ivory/90 backdrop-blur-md"
          >
            <X className="h-4 w-4" />
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
