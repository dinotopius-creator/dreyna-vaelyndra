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

const NativeScreenShare = registerPlugin<NativeScreenSharePlugin>(
  "NativeScreenShare",
);

export function isNativeAndroidApp(): boolean {
  return Capacitor.getPlatform() === "android";
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

export async function startNativeScreenShare(broadcastToken: string): Promise<void> {
  if (!isNativeAndroidApp()) {
    throw new Error("native_screen_share_unavailable");
  }
  await NativeScreenShare.start({ apiBase: API_BASE, broadcastToken });
}

export async function stopNativeScreenShare(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  await NativeScreenShare.stop().catch(() => {
    // ignore
  });
}
