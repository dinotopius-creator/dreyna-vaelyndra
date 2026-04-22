import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeScreenSharePlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<{ granted: boolean; status: string }>;
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

export async function startNativeScreenShare(): Promise<void> {
  if (!isNativeAndroidApp()) {
    throw new Error("native_screen_share_unavailable");
  }
  await NativeScreenShare.start();
}

export async function stopNativeScreenShare(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  await NativeScreenShare.stop().catch(() => {
    // ignore
  });
}
