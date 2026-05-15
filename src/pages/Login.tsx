import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { authResendVerification } from "../lib/authApi";

export function Login() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needs2FA, setNeeds2FA] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(email, password, {
        totpCode: totpCode || undefined,
      });
      if (!res.ok) {
        if (res.requires2FA) {
          setNeeds2FA(true);
          setError(res.error ?? "Code 2FA requis.");
          return;
        }
        if (res.pendingEmailVerification) {
          setPendingEmail(true);
          setError(res.error ?? "Email non vérifié.");
          return;
        }
        setError(res.error ?? "Erreur inconnue");
        return;
      }
      notify(res.legacy ? "Bienvenue (mode hors-ligne)" : "Bienvenue sur Vaelyndra ✨");
      navigate(location.state?.from ?? "/moi");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerif() {
    try {
      await authResendVerification(email);
      notify("Email de vérification renvoyé — regarde ta boîte mail.");
    } catch {
      notify("Impossible de renvoyer l'email pour l'instant.");
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-6 sm:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal p-6 sm:p-8"
      >
        <div className="flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold">
            <Crown className="h-6 w-6" />
          </span>
        </div>
        <h1 className="heading-gold mt-5 text-center text-3xl">
          Connexion
        </h1>
        <p className="mt-2 text-center text-sm text-ivory/70">
          Connecte-toi avec ton email et ton mot de passe.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setNeeds2FA(false);
                setPendingEmail(false);
              }}
              required
              placeholder="ton email"
              className="glass-input pl-9"
              autoComplete="email"
            />
          </div>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="ton mot de passe"
              className="glass-input pl-9"
              autoComplete="current-password"
            />
          </div>
          {needs2FA && (
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
                placeholder="code 2FA (6 chiffres)"
                className="glass-input pl-9"
                autoFocus
              />
            </div>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {pendingEmail && (
            <button
              type="button"
              onClick={resendVerif}
              className="text-xs text-gold-300 underline hover:text-gold-200"
            >
              Renvoyer l'email de vérification
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold w-full justify-center disabled:opacity-60"
          >
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ivory/60">
          Pas encore de compte ?{" "}
          <Link to="/inscription" className="text-gold-300 hover:text-gold-200">
            Créer mon compte
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-ivory/50">
          <Link to="/mot-de-passe-oublie" className="hover:text-ivory/80">
            Mot de passe oublié ?
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
