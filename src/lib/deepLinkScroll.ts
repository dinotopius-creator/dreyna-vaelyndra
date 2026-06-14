type DeepLinkScrollOptions = {
  attempts?: number;
  delayMs?: number;
  block?: ScrollLogicalPosition;
  highlightClassName?: string;
  highlightMs?: number;
  onMissing?: () => void;
};

export function scrollToDeepLinkTarget(
  targetId: string,
  {
    attempts = 24,
    delayMs = 90,
    block = "center",
    highlightClassName = "notification-target-highlight",
    highlightMs = 3200,
    onMissing,
  }: DeepLinkScrollOptions = {},
) {
  let cancelled = false;
  let timer: number | undefined;
  let highlightTimer: number | undefined;

  const tryScroll = (remaining: number) => {
    if (cancelled) return;
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block });
      element.classList.remove(highlightClassName);
      void element.offsetWidth;
      element.classList.add(highlightClassName);
      highlightTimer = window.setTimeout(() => {
        element.classList.remove(highlightClassName);
      }, highlightMs);
      return;
    }

    if (remaining <= 0) {
      onMissing?.();
      return;
    }
    timer = window.setTimeout(() => tryScroll(remaining - 1), delayMs);
  };

  timer = window.setTimeout(() => tryScroll(attempts), 0);

  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    if (highlightTimer) window.clearTimeout(highlightTimer);
  };
}
