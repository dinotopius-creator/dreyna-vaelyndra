import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, MailCheck } from "lucide-react";
import { authRequestPasswordReset } from "../lib/authApi";
import { ApiError } from "../lib/api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authRequestPasswordReset(email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Trop de tentatives. Réessaie dans quelques minutes.");
      } else {
        // L'endpoint renvoie 200 générique même si l'email n'existe pas (anti
        // enumeration) — donc une vraie erreur ici, c'est réseau.
        setSent(true);
      }
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
        {sent ? (
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
              <MailCheck className="h-7 w-7" />
            </span>
            <h1 className="heading-gold mt-4 text-2xl">Portail envoyé</h1>
            <p className="mt-2 text-sm text-ivory/70">
              Si un compte existe pour <strong>{email}</strong>, un lien de
              réinitialisation vient d'être envoyé (valable 1 h).
            </p>
            <Link to="/connexion" className="btn-ghost mt-6 inline-flex">
              Retourner à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="heading-gold text-center text-2xl">
              Sortilège oublié ?
            </h1>
            <p className="mt-2 text-center text-sm text-ivory/70">
              Entre ton email et nous t'envoyons un parchemin pour forger un
              nouveau sortilège.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ton email"
                  className="glass-input pl-9"
                  autoComplete="email"
                />
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn-gold w-full justify-center disabled:opacity-60"
              >
                {submitting ? "Envoi…" : "Envoyer le parchemin"}
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
