import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import {
  configureNativeAppShell,
  exitNativeApp,
  isNativeApp,
  isPrimaryAppRoute,
} from "../lib/nativeApp";

export function NativeAppBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    void configureNativeAppShell();
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;

    const backButtonListener = CapacitorApp.addListener("backButton", () => {
      if (location.pathname === "/") {
        void exitNativeApp();
        return;
      }

      if (isPrimaryAppRoute(location.pathname)) {
        navigate("/", { replace: true });
        return;
      }

      navigate(-1);
    });

    return () => {
      void backButtonListener.then((handle) => handle.remove());
    };
  }, [location.pathname, navigate]);

  return null;
}
