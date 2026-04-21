/**
 * Bandeau "mode hors-ligne" affiché en haut de TOUTES les pages dès
 * qu'un utilisateur est authentifié côté localStorage mais pas côté
 * backend (i.e. `user && !backendMe`).
 *
 * Contexte : avant PR #62, un login qui échouait en 401 retombait en
 * silence sur le fallback localStorage ; l'utilisateur se croyait
 * connecté mais toutes les features backend (pdp, mdp, lueurs,
 * chroniques, 2FA) échouaient sans explication. On refuse maintenant
 * le fallback sur 401, mais certains sessions legacy peuvent exister
 * dans le cache utilisateur (ex. une vieille clé localStorage d'un
 * compte qui avait été connecté hors-ligne avant la migration). Ce
 * bandeau rend ça 100 % visible et fournit un bouton de reconnexion
 * propre.
 *
 * Le bandeau ne s'affiche JAMAIS pour un compte authentifié proprement
 * (backend + cookie), donc aucun coût UX pour les utilisateurs normaux.
 */
import { AlertTriangle, LogIn, LogOut, X } from "lucide-react";
import { useEffect, useReducer } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const DISMISS_KEY = "vaelyndra_offline_banner_dismissed_v1";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function OfflineBanner() {
  const { user, backendMe, logout, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // `forceRender` permet au bandeau de se ré-évaluer après qu'on a muté
  // `localStorage[DISMISS_KEY]` (clic sur la croix). On lit le flag à
  // chaque rendu plutôt que de le mettre dans un `useState` pour éviter
  // le pattern `setState-in-effect` (lint react-hooks/set-state-in-effect)
  // lorsqu'on veut le ré-armer à la reconnexion backend.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const dismissed = readDismissed();

  // Ré-arme le bandeau dès qu'on a une session backend valide : si
  // l'utilisateur redevient authentifié, son prochain "hors-ligne" sera
  // à nouveau affiché (au moins une fois, jusqu'à ce qu'il le ferme).
  // On touche seulement `localStorage` ici, sans setState, pour rester
  // compatible avec `react-hooks/set-state-in-effect`.
  useEffect(() => {
    if (backendMe) {
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* noop */
      }
    }
  }, [backendMe]);

  // Tant que le premier `/auth/me` n'a pas répondu, `backendMe` est
  // `null` même pour un compte parfaitement authentifié — si on ne
  // gate pas sur `initializing`, le bandeau flashe quelques centaines
  // de ms à chaque reload et un clic malheureux sur "Se reconnecter"
  // logout un user sain.
  if (initializing) return null;

  // Caché quand l'utilisateur est authentifié côté backend OU qu'il
  // n'y a pas de session locale (pas d'utilisateur du tout).
  if (!user || backendMe) return null;

  // Le user a explicitement fermé le bandeau : on respecte son choix
  // jusqu'à sa prochaine session backend valide.
  if (dismissed) return null;

  // Pas d'intérêt à afficher le bandeau sur les pages de (re)connexion
  // et d'inscription — l'utilisateur est déjà en train d'agir.
  if (
    location.pathname.startsWith("/connexion") ||
    location.pathname.startsWith("/inscription") ||
    location.pathname.startsWith("/mot-de-passe-oublie") ||
    location.pathname.startsWith("/reinitialiser-mot-de-passe")
  ) {
    return null;
  }

  async function handleReconnect() {
    // On déconnecte d'abord pour nettoyer la session locale, puis on
    // renvoie vers /connexion avec un retour vers la page courante.
    try {
      await logout();
    } catch {
      /* logout best-effort, on continue vers la page de connexion */
    }
    navigate("/connexion", {
      state: { from: location.pathname },
      replace: false,
    });
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-40 border-b border-amber-400/60 bg-amber-500/15 text-amber-50 shadow-[0_2px_8px_rgba(0,0,0,0.25)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="leading-snug">
            <strong className="font-semibold">
              Tu es en mode hors-ligne (localStorage).
            </strong>{" "}
            Certaines fonctionnalités sont désactivées : changement de mot de
            passe, photo de profil, Lueurs quotidiennes, chroniques, admin.
            Reconnecte-toi pour tout débloquer.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleReconnect}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-300/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/40"
          >
            <LogIn className="h-3.5 w-3.5" /> Se reconnecter
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100/80 transition hover:border-amber-300/80 hover:text-amber-50"
            title="Se déconnecter complètement (nettoie la session locale)"
          >
            <LogOut className="h-3.5 w-3.5" /> Déconnexion
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, "1");
              } catch {
                /* noop */
              }
              forceRender();
            }}
            aria-label="Masquer le bandeau"
            title="Masquer jusqu'à ma prochaine reconnexion"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/30 text-amber-100/70 transition hover:border-amber-300/70 hover:text-amber-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
