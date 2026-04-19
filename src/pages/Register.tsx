import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Mail, KeyRound, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { CREATURES } from "../data/creatures";

export function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<"identity" | "creature">("identity");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function goToCreature(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validation minimale avant d'avancer à l'étape créature ; le register
    // final refera la vérification côté Auth (cohérent avec l'existant).
    if (username.trim().length < 2) {
      setError("Votre nom elfique est trop court.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Un mail valide est requis.");
      return;
    }
    if (password.length < 4) {
      setError("Le sortilège doit faire 4 caractères.");
      return;
    }
    setStep("creature");
  }

  function finalize() {
    if (!creatureId) {
      setError("Choisis ta créature pour franchir le portail.");
      return;
    }
    const res = register(username, email, password, creatureId);
    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue");
      // Si l'erreur vient d'une étape antérieure (mail déjà pris…), on
      // remonte à l'identité pour ne pas bloquer l'utilisateur.
      if (res.error && !res.error.toLowerCase().includes("créature")) {
        setStep("identity");
      }
      return;
    }
    const creatureLabel = CREATURES.find((c) => c.id === creatureId);
    notify(
      `Bienvenue dans la cour, ${username} ${creatureLabel?.icon ?? "👑"}`,
    );
    navigate("/moi");
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-20">
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
          {step === "identity" ? "Rejoindre la cour" : "Choisis ta créature"}
        </h1>
        <p className="mt-2 text-center text-sm text-ivory/70">
          {step === "identity"
            ? "Prononce ton nom elfique et scelle ton pacte."
            : "Ton essence détermine comment le royaume te reconnaît."}
        </p>

        {step === "identity" && (
          <form onSubmit={goToCreature} className="mx-auto mt-8 max-w-sm space-y-4">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Ton nom elfique"
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
              Continuer
            </button>
          </form>
        )}

        {step === "creature" && (
          <div className="mt-8 space-y-6">
            <div
              role="radiogroup"
              aria-label="Choisis ta créature"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {CREATURES.map((c) => {
                const selected = creatureId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setCreatureId(c.id);
                      setError(null);
                    }}
                    className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                      selected
                        ? "border-gold-400 bg-night-700/80 shadow-glow-gold"
                        : "border-ivory/10 bg-night-800/60 hover:border-ivory/25"
                    }`}
                    style={
                      selected
                        ? { boxShadow: `0 0 0 1px ${c.color}88, 0 0 28px -6px ${c.color}` }
                        : undefined
                    }
                  >
                    <span
                      className="text-3xl"
                      aria-hidden
                      style={{ filter: selected ? "drop-shadow(0 0 8px " + c.color + ")" : "none" }}
                    >
                      {c.icon}
                    </span>
                    <span className="text-sm font-semibold text-ivory">
                      {c.name}
                    </span>
                    <span className="text-[11px] leading-snug text-ivory/60">
                      {c.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p className="text-center text-sm text-rose-300">{error}</p>}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep("identity")}
                className="btn-ghost"
              >
                ← Retour
              </button>
              <button
                type="button"
                onClick={finalize}
                disabled={!creatureId}
                className="btn-gold justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sceller le pacte
              </button>
            </div>
          </div>
        )}

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
