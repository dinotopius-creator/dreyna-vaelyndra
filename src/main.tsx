import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { StoreProvider } from "./contexts/StoreContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LiveProvider } from "./contexts/LiveContext";
import { LiveInvitesProvider } from "./contexts/LiveInvitesContext";
import { ProfileProvider } from "./contexts/ProfileContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ProfileProvider>
            <StoreProvider>
              <LiveProvider>
                <LiveInvitesProvider>
                  <App />
                </LiveInvitesProvider>
              </LiveProvider>
            </StoreProvider>
          </ProfileProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
