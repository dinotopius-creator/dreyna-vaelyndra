import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, ShieldCheck } from "lucide-react";
import { authResetPassword } from "../lib/authApi";
import { ApiError } from "../lib/api";

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le sortilège doit faire 8 caractères minimum.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux sortilèges ne correspondent pas.");
      return;
    }
    if (!token) {
      setError("Lien invalide : token manquant.");
      return;
    }
    setSubmitting(true);
    try {
      await authResetPassword({ token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate("/connexion"), 2000);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 410
            ? "Ce lien a expiré — redemande un nouveau parchemin."
            : err.message
          : "Impossible de réinitialiser pour l'instant.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal p-8"
      >
        {done ? (
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <h1 className="heading-gold mt-4 text-2xl">
              Nouveau sortilège scellé ✨
            </h1>
            <p className="mt-2 text-sm text-ivory/70">
              Redirection vers la connexion…
            </p>
          </div>
        ) : (
          <>
            <h1 className="heading-gold text-center text-2xl">
              Forger un nouveau sortilège
            </h1>
            <p className="mt-2 text-center text-sm text-ivory/70">
              Toutes tes sessions actives seront révoquées après la
              réinitialisation.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Nouveau sortilège (8+ caractères)"
                  className="glass-input pl-9"
                  autoComplete="new-password"
                />
              </div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  placeholder="Confirmer le sortilège"
                  className="glass-input pl-9"
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn-gold w-full justify-center disabled:opacity-60"
              >
                {submitting ? "Incantation…" : "Sceller le sortilège"}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-ivory/50">
              <Link to="/connexion" className="hover:text-ivory/80">
                ← Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
