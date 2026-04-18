import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, KeyRound, Mail } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

export function Login() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = login(email, password);
    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue");
      return;
    }
    notify("Bienvenue à la cour ✨");
    navigate(location.state?.from ?? "/moi");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal p-8"
      >
        <div className="flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-shine text-night-900 shadow-glow-gold">
            <Crown className="h-6 w-6" />
          </span>
        </div>
        <h1 className="heading-gold mt-5 text-center text-3xl">
          Entrée à la cour
        </h1>
        <p className="mt-2 text-center text-sm text-ivory/70">
          Prononcez le sortilège qui vous est propre.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="mail elfique"
              className="glass-input pl-9"
            />
          </div>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="sortilège d'entrée"
              className="glass-input pl-9"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-300">{error}</p>
          )}
          <button type="submit" className="btn-gold w-full justify-center">
            Entrer dans Vaelyndra
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ivory/60">
          Nouveau dans le royaume ?{" "}
          <Link to="/inscription" className="text-gold-300 hover:text-gold-200">
            Rejoindre la cour
          </Link>
        </p>
        <div className="mt-6 rounded-xl border border-gold-400/30 bg-gold-500/5 p-4 text-xs text-ivory/70">
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            Comptes de démonstration
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              👑 <code>dreyna@vaelyndra.realm</code> / <code>vaelyndra</code>{" "}
              (reine — accès Salle du Trône)
            </li>
            <li>
              ✦ <code>lyria@vaelyndra.realm</code> / <code>lumiere</code>
            </li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
