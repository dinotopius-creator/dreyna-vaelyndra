import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
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

    const showListener = Keyboard.addListener("keyboardWillShow", () => {
      document.body.classList.add("native-keyboard-open");
    });
    const hideListener = Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("native-keyboard-open");
    });

    return () => {
      void showListener.then((handle) => handle.remove());
      void hideListener.then((handle) => handle.remove());
      document.body.classList.remove("native-keyboard-open");
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;

    const backButtonListener = CapacitorApp.addListener("backButton", () => {
      if (location.pathname === "/") {
        void exitNativeApp();
        return;
      }

      if (isPrimaryAppRoute(location.pathname) || location.pathname === "/familier/enclos") {
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
