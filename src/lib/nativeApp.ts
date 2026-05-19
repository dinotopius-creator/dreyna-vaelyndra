import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isNativeAndroidApp(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function configureNativeAppShell(): Promise<void> {
  if (!isNativeApp()) return;

  document.documentElement.classList.add("native-app");
  document.body.classList.add("native-app-body");

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Dark }),
    StatusBar.setBackgroundColor({ color: "#07030f" }),
    StatusBar.show(),
    Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
  ]);
}

export function isPrimaryAppRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/live" ||
    pathname === "/communaute" ||
    pathname === "/mondes" ||
    pathname === "/moi" ||
    pathname === "/compte"
  );
}

export async function exitNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  await CapacitorApp.exitApp();
}
