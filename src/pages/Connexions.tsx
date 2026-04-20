/**
 * Page dédiée "Historique & appareils" (/connexions).
 *
 * Vue plein écran des sessions actives + des 50 dernières tentatives de
 * connexion. Les mêmes données sont présentes dans /compte mais cette
 * page est pensée comme un tableau de bord sécurité autonome (accessible
 * depuis la navbar / email d'alerte).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  History as HistoryIcon,
  XCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  authListSessions,
  authLoginHistory,
  authRevokeOtherSessions,
  authRevokeSession,
  type AuthSessionDto,
  type LoginAttemptDto,
} from "../lib/authApi";
import { ApiError } from "../lib/api";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Appareil inconnu";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return userAgent.slice(0, 40);
}

export function Connexions() {
  const { user, backendMe, logout, initializing } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AuthSessionDto[] | null>(null);
  const [history, setHistory] = useState<LoginAttemptDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, h] = await Promise.all([
        authListSessions(),
        authLoginHistory(),
      ]);
      setSessions(s);
      setHistory(h);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de charger tes connexions.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeSessions = useMemo(
    () => sessions?.filter((s) => !s.revoked_at) ?? [],
    [sessions],
  );

  const failureCount = useMemo(
    () => history?.filter((h) => !h.success).length ?? 0,
    [history],
  );

  if (initializing) return null;
  if (!user) return <Navigate to="/connexion" replace />;

  async function revoke(id: string, isCurrent: boolean) {
    try {
      const r = await authRevokeSession(id);
      if (r.current_revoked || isCurrent) {
        notify("Session courante révoquée — déconnexion.");
        await logout();
        navigate("/connexion");
      } else {
        notify("Session révoquée.");
        void refresh();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Erreur de révocation.");
    }
  }

  async function revokeAllOthers() {
    try {
      const r = await authRevokeOtherSessions();
      notify(
        r.revoked > 0
          ? `${r.revoked} autre(s) session(s) révoquée(s).`
          : "Aucune autre session active.",
      );
      void refresh();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Erreur.");
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <Link
        to="/compte"
        className="inline-flex w-fit items-center gap-2 text-xs text-ivory/60 hover:text-gold-200"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à mon compte
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="heading-gold text-3xl">Historique & appareils</h1>
        <p className="text-sm text-ivory/70">
          Surveille où tu es connecté·e et repère toute activité suspecte.
          Si tu ne reconnais pas une connexion, révoque-la et change
          immédiatement ton mot de passe.
        </p>
        {backendMe && !backendMe.totp_enabled && (
          <div className="mt-2 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Ton compte n'a pas la double authentification. Active-la depuis{" "}
              <Link
                to="/compte"
                className="underline hover:text-amber-100"
              >
                /compte
              </Link>{" "}
              — un seul mot de passe n'est pas suffisant.
            </p>
          </div>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-ivory/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-royal p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-5 w-5 text-gold-300" />
                <h2 className="font-regal text-xs uppercase tracking-[0.25em] text-gold-300">
                  Appareils connectés
                </h2>
                <span className="rounded-full border border-royal-500/30 px-2 py-0.5 text-[10px] text-ivory/70">
                  {activeSessions.length} actif{activeSessions.length > 1 ? "s" : ""}
                </span>
              </div>
              {activeSessions.length > 1 && (
                <button
                  type="button"
                  onClick={revokeAllOthers}
                  className="btn-royal text-xs"
                >
                  <LogOut className="h-4 w-4" /> Déconnecter tous les autres
                </button>
              )}
            </div>

            {activeSessions.length === 0 ? (
              <p className="text-sm text-ivory/60">Aucune session active.</p>
            ) : (
              <ul className="space-y-2">
                {activeSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-xl border border-royal-500/20 bg-night-900/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ivory/90">
                          {deviceLabel(s.user_agent)}
                        </span>
                        {s.current && (
                          <span className="rounded-full border border-gold-400/40 bg-gold-500/15 px-2 py-0.5 text-[10px] font-semibold text-gold-200">
                            cette session
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ivory/50">
                        IP {s.ip ?? "inconnue"} • dernière activité{" "}
                        {fmtDate(s.last_seen_at)}
                      </p>
                      <p className="text-[11px] text-ivory/40">
                        Ouverte le {fmtDate(s.created_at)} — expire{" "}
                        {fmtDate(s.expires_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(s.id, s.current)}
                      className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/20"
                    >
                      Révoquer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="card-royal p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-5 w-5 text-gold-300" />
                <h2 className="font-regal text-xs uppercase tracking-[0.25em] text-gold-300">
                  50 dernières tentatives
                </h2>
              </div>
              {failureCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                  <ShieldAlert className="h-3 w-3" />
                  {failureCount} échec{failureCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {history && history.length === 0 ? (
              <p className="text-sm text-ivory/60">
                Aucune tentative enregistrée pour l'instant.
              </p>
            ) : (
              <ul className="divide-y divide-royal-500/15 text-sm">
                {history?.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 py-2"
                  >
                    {a.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    )}
                    <span className="text-ivory/80">{fmtDate(a.created_at)}</span>
                    <span className="text-[11px] text-ivory/50">
                      IP {a.ip ?? "?"} • {deviceLabel(a.user_agent)}
                    </span>
                    {!a.success && (
                      <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200">
                        échec
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {backendMe?.totp_enabled && (
            <p className="flex items-center justify-center gap-2 text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Double authentification
              activée sur ce compte
            </p>
          )}
        </>
      )}
    </div>
  );
}
