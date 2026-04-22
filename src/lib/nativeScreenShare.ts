import { Capacitor, registerPlugin } from "@capacitor/core";
import { API_BASE } from "./api";

type NativeScreenSharePlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  start(options: {
    apiBase: string;
    broadcastToken: string;
  }): Promise<{ granted: boolean; status: string }>;
  stop(): Promise<{ stopped: boolean }>;
};

const NativeScreenShare =
  registerPlugin<NativeScreenSharePlugin>("NativeScreenShare");

const NATIVE_SCREEN_SHARE_AUTH_GRACE_KEY =
  "vaelyndra_native_screen_share_auth_grace_until";

export function isNativeAndroidApp(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function markNativeScreenShareAuthGrace(hours = 4): void {
  if (!isNativeAndroidApp()) return;
  try {
    localStorage.setItem(
      NATIVE_SCREEN_SHARE_AUTH_GRACE_KEY,
      String(Date.now() + hours * 60 * 60 * 1000),
    );
  } catch {
    // ignore
  }
}

export function clearNativeScreenShareAuthGrace(): void {
  try {
    localStorage.removeItem(NATIVE_SCREEN_SHARE_AUTH_GRACE_KEY);
  } catch {
    // ignore
  }
}

export function isNativeScreenShareAuthGraceActive(): boolean {
  if (!isNativeAndroidApp()) return false;
  try {
    const raw = localStorage.getItem(NATIVE_SCREEN_SHARE_AUTH_GRACE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      localStorage.removeItem(NATIVE_SCREEN_SHARE_AUTH_GRACE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function isNativeScreenShareAvailable(): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    const result = await NativeScreenShare.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

export async function startNativeScreenShare(
  broadcastToken: string,
): Promise<void> {
  if (!isNativeAndroidApp()) {
    throw new Error("native_screen_share_unavailable");
  }
  markNativeScreenShareAuthGrace();
  try {
    await NativeScreenShare.start({ apiBase: API_BASE, broadcastToken });
  } catch (err) {
    clearNativeScreenShareAuthGrace();
    throw err;
  }
}

export async function stopNativeScreenShare(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  clearNativeScreenShareAuthGrace();
  await NativeScreenShare.stop().catch(() => {
    // ignore
  });
}
