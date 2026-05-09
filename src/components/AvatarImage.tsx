import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";

function fallbackAvatar(seed: string) {
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;
}

function isRenderableAvatar(src: string | null | undefined) {
  if (!src) return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  if (trimmed.startsWith("blob:")) return true;
  if (trimmed.startsWith("/")) return true;
  if (/\.(glb|gltf)(\?|#|$)/i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

interface AvatarImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  candidates?: Array<string | null | undefined>;
  fallbackSeed: string;
}

export function AvatarImage({
  candidates = [],
  fallbackSeed,
  alt,
  onError,
  ...props
}: AvatarImageProps) {
  const fallbackSrc = useMemo(() => fallbackAvatar(fallbackSeed), [fallbackSeed]);
  const resolvedSrc = useMemo(
    () => candidates.find((src) => isRenderableAvatar(src))?.trim() ?? fallbackSrc,
    [candidates, fallbackSrc],
  );
  const [src, setSrc] = useState(resolvedSrc);

  useEffect(() => {
    setSrc(resolvedSrc);
  }, [resolvedSrc]);

  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={(event) => {
        if (src !== fallbackSrc) setSrc(fallbackSrc);
        onError?.(event);
      }}
    />
  );
}
