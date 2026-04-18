import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Mail, KeyRound, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

export function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = register(username, email, password);
    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue");
      return;
    }
    notify(`Bienvenue dans la cour, ${username} 👑`);
    navigate("/moi");
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
          Rejoindre la cour
        </h1>
        <p className="mt-2 text-center text-sm text-ivory/70">
          Prononcez votre nom elfique et scellez votre pacte.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Votre nom elfique"
              className="glass-input pl-9"
            />
          </div>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Mail elfique"
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
              placeholder="Sortilège d'entrée (4+ caractères)"
              className="glass-input pl-9"
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button type="submit" className="btn-gold w-full justify-center">
            Sceller le pacte
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-ivory/60">
          Déjà un pacte ?{" "}
          <Link to="/connexion" className="text-gold-300 hover:text-gold-200">
            Se connecter
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
