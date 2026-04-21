/**
 * Page "Mon compte" — espace privé sécurisé.
 *
 * Chaque utilisateur peut :
 *  - Voir ses informations (email, rôle, créature, dates, soldes)
 *  - Changer son mot de passe (argon2id backend)
 *  - Changer son email (nouveau lien de vérification envoyé)
 *  - Activer / désactiver le 2FA (TOTP + codes de récupération)
 *  - Lister ses sessions actives et les révoquer individuellement
 *  - Consulter l'historique des 50 dernières tentatives de connexion
 *  - Supprimer son compte (soft delete avec purge des secrets auth)
 *
 * Toutes les mutations appellent `refreshBackendMe()` pour mettre à jour
 * l'UI en temps réel sans rafraîchir la page.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Crown,
  KeyRound,
  Mail,
  ShieldCheck,
  ShieldOff,
  History,
  MonitorSmartphone,
  Trash2,
  LogOut,
  Loader2,
  AlertTriangle,
  Sparkles,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  auth2FADisable,
  auth2FAEnable,
  auth2FASetup,
  authChangeEmail,
  authChangePassword,
  authDeleteAccount,
  authListSessions,
  authLoginHistory,
  authRevokeOtherSessions,
  authRevokeSession,
  type AuthSessionDto,
  type LoginAttemptDto,
  type TwoFASetupResponse,
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

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-royal p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
          {icon}
        </span>
        <div>
          <h2 className="heading-gold text-xl">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-ivory/60">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-ivory/50">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ivory">{value}</dd>
    </div>
  );
}

// -------------------- Password --------------------

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { notify } = useToast();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPwd.length < 8) {
      setError("Le nouveau sortilège doit faire 8 caractères minimum.");
      return;
    }
    if (newPwd !== confirm) {
      setError("Les deux sortilèges ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authChangePassword({
        oldPassword: oldPwd,
        newPassword: newPwd,
      });
      notify(
        `Sortilège mis à jour ✨ — ${res.revoked_sessions} autre(s) session(s) révoquée(s).`,
      );
      setOldPwd("");
      setNewPwd("");
      setConfirm("");
      onDone();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? "Ancien sortilège incorrect."
            : err.message
          : "Erreur réseau.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        value={oldPwd}
        onChange={(e) => setOldPwd(e.target.value)}
        required
        placeholder="Sortilège actuel"
        className="glass-input"
        autoComplete="current-password"
      />
      <input
        type="password"
        value={newPwd}
        onChange={(e) => setNewPwd(e.target.value)}
        required
        placeholder="Nouveau sortilège (8+ caractères)"
        className="glass-input"
        autoComplete="new-password"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        placeholder="Confirmer"
        className="glass-input"
        autoComplete="new-password"
      />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="btn-gold w-full justify-center disabled:opacity-60"
      >
        {submitting ? "Incantation…" : "Changer le sortilège"}
      </button>
    </form>
  );
}

// -------------------- Email --------------------

function EmailForm({
  currentEmail,
  onDone,
}: {
  currentEmail: string;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      setError("Mail invalide.");
      return;
    }
    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setError("C'est ton mail actuel.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authChangeEmail({ password, newEmail });
      notify(
        res.message ??
          "Lien de vérification envoyé au nouveau mail — valide 24 h.",
      );
      setPassword("");
      setNewEmail("");
      onDone();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? "Sortilège incorrect."
            : err.status === 409
              ? "Ce mail est déjà utilisé."
              : err.message
          : "Erreur réseau.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-ivory/60">
        Un lien de vérification sera envoyé au nouveau mail. L'ancien reste actif
        tant que le nouveau n'est pas confirmé.
      </p>
      <input
        type="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        required
        placeholder="Nouveau mail elfique"
        className="glass-input"
        autoComplete="email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        placeholder="Sortilège actuel (confirmation)"
        className="glass-input"
        autoComplete="current-password"
      />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="btn-gold w-full justify-center disabled:opacity-60"
      >
        {submitting ? "Envoi…" : "Changer l'email"}
      </button>
    </form>
  );
}

// -------------------- 2FA --------------------

function TwoFactorSection({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [stage, setStage] = useState<
    "idle" | "setup" | "recovery" | "disable"
  >("idle");
  const [setup, setSetup] = useState<TwoFASetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await auth2FASetup();
      setSetup(r);
      setStage("setup");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Impossible de démarrer le 2FA.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await auth2FAEnable(code);
      setRecoveryCodes(r.recovery_codes);
      setStage("recovery");
      setCode("");
      notify("2FA activée ✨");
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Code invalide.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth2FADisable({ password, code });
      setPassword("");
      setCode("");
      setStage("idle");
      notify("2FA désactivée.");
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Sortilège ou code incorrect."
            : err.message
          : "Erreur.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function copyAll() {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(
      () => notify("Codes copiés dans le presse-papier."),
      () => notify("Impossible de copier automatiquement."),
    );
  }

  if (enabled && stage === "idle") {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          2FA activée — un code sera demandé à chaque connexion.
        </p>
        <button
          onClick={() => setStage("disable")}
          className="btn-ghost inline-flex items-center gap-2 text-sm"
        >
          <ShieldOff className="h-4 w-4" /> Désactiver le 2FA
        </button>
      </div>
    );
  }

  if (stage === "disable") {
    return (
      <form onSubmit={confirmDisable} className="space-y-3">
        <p className="text-xs text-ivory/60">
          Confirme avec ton sortilège + un code 2FA pour désactiver.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Sortilège actuel"
          className="glass-input"
          autoComplete="current-password"
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          required
          placeholder="Code 2FA (ou code de récupération)"
          className="glass-input"
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStage("idle")}
            className="btn-ghost flex-1 justify-center"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold flex-1 justify-center disabled:opacity-60"
          >
            {submitting ? "…" : "Désactiver"}
          </button>
        </div>
      </form>
    );
  }

  if (stage === "setup" && setup) {
    return (
      <form onSubmit={confirmEnable} className="space-y-3">
        <p className="text-xs text-ivory/60">
          Scanne ce QR code dans Google Authenticator / 1Password / Authy, puis
          entre le code à 6 chiffres.
        </p>
        <div className="flex justify-center rounded-xl bg-ivory/5 p-4">
          <img
            src={`data:image/png;base64,${setup.qr_png_base64}`}
            alt="QR code 2FA"
            className="h-48 w-48 rounded-lg bg-white p-2"
          />
        </div>
        <details className="rounded-lg border border-ivory/10 bg-night-800/60 p-2 text-xs text-ivory/60">
          <summary className="cursor-pointer">Pas de QR ? Secret manuel</summary>
          <code className="mt-2 block break-all font-mono text-[11px] text-gold-200">
            {setup.secret}
          </code>
        </details>
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          required
          placeholder="Code à 6 chiffres"
          className="glass-input"
          autoFocus
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStage("idle")}
            className="btn-ghost flex-1 justify-center"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold flex-1 justify-center disabled:opacity-60"
          >
            {submitting ? "…" : "Activer"}
          </button>
        </div>
      </form>
    );
  }

  if (stage === "recovery" && recoveryCodes) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gold-200">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          2FA active. Sauvegarde ces 10 codes de récupération **maintenant** —
          chacun est utilisable une seule fois et on ne pourra plus te les
          remontrer.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-gold-400/20 bg-night-800/80 p-3 font-mono text-xs">
          {recoveryCodes.map((c) => (
            <code key={c} className="text-gold-200">
              {c}
            </code>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyAll}
            className="btn-ghost inline-flex items-center gap-1 text-xs"
          >
            <Copy className="h-3.5 w-3.5" /> Copier les 10 codes
          </button>
          <button
            onClick={() => {
              setRecoveryCodes(null);
              setStage("idle");
            }}
            className="btn-gold ml-auto text-xs"
          >
            J'ai sauvegardé
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ivory/70">
        Ajoute une deuxième couche : un code TOTP à 6 chiffres sera requis à
        chaque connexion (Google Authenticator, 1Password, Authy…).
      </p>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        onClick={startSetup}
        disabled={submitting}
        className="btn-gold inline-flex items-center gap-2 disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Activer le 2FA
      </button>
    </div>
  );
}

// -------------------- Sessions --------------------

function SessionsPanel() {
  const { notify } = useToast();
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<AuthSessionDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const s = await authListSessions();
      setSessions(s);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Impossible de charger.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function revoke(id: string, isCurrent: boolean) {
    try {
      const r = await authRevokeSession(id);
      if (r.current_revoked || isCurrent) {
        notify("Session actuelle révoquée — déconnexion.");
        await logout();
      } else {
        notify("Session révoquée.");
        await refresh();
      }
    } catch (err) {
      notify(
        err instanceof ApiError ? err.message : "Erreur de révocation.",
      );
    }
  }

  async function revokeOthers() {
    try {
      const r = await authRevokeOtherSessions();
      notify(`${r.revoked} autre(s) session(s) déconnectée(s).`);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Erreur.");
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-ivory/50">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
        Chargement…
      </p>
    );
  }
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!sessions || sessions.length === 0)
    return <p className="text-sm text-ivory/50">Aucune session active.</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-lg border border-ivory/10 bg-night-800/60 p-3"
          >
            <MonitorSmartphone className="h-4 w-4 shrink-0 text-ivory/50" />
            <div className="flex-1 text-xs">
              <p className="text-ivory">
                {s.user_agent?.slice(0, 80) ?? "Appareil inconnu"}
                {s.current && (
                  <span className="ml-2 rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] text-gold-200">
                    cette session
                  </span>
                )}
              </p>
              <p className="text-ivory/50">
                IP {s.ip ?? "?"} · vue {fmtDate(s.last_seen_at)} · expire{" "}
                {fmtDate(s.expires_at)}
              </p>
            </div>
            <button
              onClick={() => revoke(s.id, s.current)}
              className="text-xs text-rose-300 hover:text-rose-200"
            >
              Révoquer
            </button>
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <button
          onClick={revokeOthers}
          className="btn-ghost inline-flex items-center gap-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" /> Déconnecter toutes les autres
        </button>
      )}
    </div>
  );
}

// -------------------- Login history --------------------

function LoginHistoryPanel() {
  const [attempts, setAttempts] = useState<LoginAttemptDto[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const a = await authLoginHistory();
        setAttempts(a);
      } catch {
        setAttempts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading)
    return (
      <p className="text-sm text-ivory/50">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
        Chargement…
      </p>
    );
  if (!attempts || attempts.length === 0)
    return <p className="text-sm text-ivory/50">Aucune tentative enregistrée.</p>;

  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
      {attempts.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded border border-ivory/5 bg-night-800/50 p-2"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              a.success ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          <span className="flex-1 text-ivory/80">
            {fmtDate(a.created_at)} — IP {a.ip ?? "?"}
          </span>
          <span
            className={`text-[10px] ${
              a.success ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {a.success ? "OK" : "échec"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// -------------------- Delete account --------------------

function DeleteAccountSection({ has2FA }: { has2FA: boolean }) {
  const { logout } = useAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (confirm !== "SUPPRIMER") {
      setError("Tape SUPPRIMER (en majuscules) pour confirmer.");
      return;
    }
    setSubmitting(true);
    try {
      await authDeleteAccount({
        password,
        totpCode: has2FA ? code : undefined,
      });
      notify("Compte supprimé. Adieu, voyageur.");
      await logout();
      window.location.href = "/";
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Sortilège ou code 2FA incorrect."
            : err.message
          : "Erreur.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-ivory/60">
          Suppression définitive du compte et de toutes les données
          d'authentification. Action irréversible.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer mon compte
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Cette action est <strong>irréversible</strong>. Tous tes soldes, posts
        et sessions seront perdus.
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        placeholder="Sortilège actuel"
        className="glass-input"
        autoComplete="current-password"
      />
      {has2FA && (
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          required
          placeholder="Code 2FA"
          className="glass-input"
        />
      )}
      <input
        type="text"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        placeholder='Tape "SUPPRIMER" pour confirmer'
        className="glass-input"
      />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost flex-1 justify-center"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 justify-center rounded-xl border border-rose-400 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/40 disabled:opacity-50"
        >
          {submitting ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </div>
    </form>
  );
}

// -------------------- Page --------------------

export function Compte() {
  const { user, backendMe, initializing, refreshBackendMe, logout } =
    useAuth();

  const joinedAt = useMemo(
    () => fmtDate(backendMe?.created_at ?? user?.joinedAt),
    [backendMe, user],
  );

  if (initializing) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-ivory/60">
        <Loader2 className="h-10 w-10 animate-spin text-gold-300" />
        <p className="mt-4 text-sm">Ouverture du portail…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/connexion" state={{ from: "/compte" }} replace />;
  }

  // Legacy users (non-backend) : on leur montre un bandeau explicatif.
  const isLegacy = !backendMe;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold">
          <Crown className="h-7 w-7" />
        </span>
        <h1 className="heading-gold mt-4 text-4xl">Mon compte</h1>
        <p className="mt-2 max-w-lg text-sm text-ivory/70">
          Tes informations personnelles et tes sortilèges de sécurité. Tout
          changement s'applique immédiatement.
        </p>
      </motion.header>

      {isLegacy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-100"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Ton compte est en mode <strong>hors-ligne (localStorage)</strong>
              . Pour profiter de la sécurité complète (argon2, 2FA, sessions
              révocables), recrée un compte depuis la page inscription — nous
              migrerons automatiquement ton pseudo / créature.
            </span>
          </p>
        </motion.div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Section
          icon={<Sparkles className="h-5 w-5" />}
          title="Mes informations"
          subtitle="Identité & soldes — lecture seule"
        >
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Pseudo" value={user.username} />
            <Field label="Rôle" value={user.role} />
            <Field
              label="Email"
              value={
                <span className="flex items-center gap-2">
                  {backendMe?.email ?? user.email}
                  {backendMe?.email_verified ? (
                    <span title="Email vérifié">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    </span>
                  ) : (
                    <span title="Non vérifié">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                    </span>
                  )}
                </span>
              }
            />
            <Field label="Créature" value={user.creatureId ?? "—"} />
            <Field label="Dans le royaume depuis" value={joinedAt} />
            <Field
              label="Lueurs"
              value={backendMe?.lueurs ?? "—"}
            />
            <Field
              label="Sylvins (promo)"
              value={backendMe?.sylvins_promo ?? "—"}
            />
            <Field
              label="Sylvins (payés)"
              value={backendMe?.sylvins_paid ?? "—"}
            />
          </dl>
        </Section>

        {!isLegacy && (
          <Section
            icon={<KeyRound className="h-5 w-5" />}
            title="Changer le sortilège"
            subtitle="argon2id — révoque les autres sessions"
          >
            <PasswordForm onDone={() => void refreshBackendMe()} />
          </Section>
        )}

        {!isLegacy && (
          <Section
            icon={<Mail className="h-5 w-5" />}
            title="Changer l'email"
            subtitle="Vérification par lien (24 h)"
          >
            <EmailForm
              currentEmail={backendMe?.email ?? ""}
              onDone={() => void refreshBackendMe()}
            />
          </Section>
        )}

        {!isLegacy && (
          <Section
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Double authentification (2FA)"
            subtitle="TOTP (Google Authenticator, 1Password, Authy…)"
          >
            <TwoFactorSection
              enabled={!!backendMe?.totp_enabled}
              onChanged={() => void refreshBackendMe()}
            />
          </Section>
        )}

        {!isLegacy && (
          <Section
            icon={<MonitorSmartphone className="h-5 w-5" />}
            title="Sessions actives"
            subtitle="Appareils connectés à ton compte"
          >
            <SessionsPanel />
          </Section>
        )}

        {!isLegacy && (
          <Section
            icon={<History className="h-5 w-5" />}
            title="Historique de connexion"
            subtitle="50 dernières tentatives (succès + échecs)"
          >
            <LoginHistoryPanel />
          </Section>
        )}

        <Section
          icon={<LogOut className="h-5 w-5" />}
          title="Déconnexion"
          subtitle="Révoque la session locale"
        >
          <button
            onClick={() => void logout()}
            className="btn-ghost inline-flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </Section>

        {!isLegacy && (
          <Section
            icon={<Trash2 className="h-5 w-5" />}
            title="Zone dangereuse"
            subtitle="Suppression du compte"
          >
            <DeleteAccountSection has2FA={!!backendMe?.totp_enabled} />
          </Section>
        )}
      </div>
    </div>
  );
}
