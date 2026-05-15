import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Mail, KeyRound, UserRound, MailCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { CREATURES } from "../data/creatures";
import { suggestEmailCorrection } from "../lib/emailTypo";

export function Register() {
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<"identity" | "creature" | "sent">(
    "identity",
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatureId, setCreatureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string>("");

  const emailSuggestion = suggestEmailCorrection(email.trim());

  function goToCreature(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (username.trim().length < 2) {
      setError("Votre pseudo est trop court.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Un mail valide est requis.");
      return;
    }
    if (emailSuggestion) {
      setError(
        `L'adresse email a l'air d'avoir une faute de frappe. Tu voulais dire ${emailSuggestion} ?`,
      );
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire 8 caractères minimum.");
      return;
    }
    setStep("creature");
  }

  async function finalize() {
    if (!creatureId) {
      setError("Choisis une créature pour finaliser ton compte.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await register(username, email, password, creatureId);
      if (!res.ok) {
        setError(res.error ?? "Erreur inconnue");
        if (res.error && !res.error.toLowerCase().includes("créature")) {
          setStep("identity");
        }
        return;
      }
      const creatureLabel = CREATURES.find((c) => c.id === creatureId);
      if (res.pendingVerification) {
        setSentMessage(
          res.message ??
            `Compte créé ${creatureLabel?.icon ?? "✨"} — regarde ta boîte mail pour activer ton compte (lien valable 24 h).`,
        );
        setStep("sent");
        notify("Email de vérification envoyé.");
        return;
      }
      notify(
        `Bienvenue sur Vaelyndra, ${username} ${creatureLabel?.icon ?? "✨"}`,
      );
      navigate("/moi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-14 sm:px-6 sm:py-20">
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
        {step !== "sent" && (
          <>
            <h1 className="heading-gold mt-5 text-center text-3xl">
              {step === "identity" ? "Créer mon compte" : "Choisis ta créature"}
            </h1>
            <p className="mt-2 text-center text-sm text-ivory/70">
              {step === "identity"
                ? "Choisis ton pseudo, ton email, ton mot de passe. C'est parti."
                : "Ta créature, c'est ton badge décoratif — visible partout sur ton profil."}
            </p>
          </>
        )}

        {step === "identity" && (
          <form onSubmit={goToCreature} className="mx-auto mt-8 max-w-sm space-y-4">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Ton pseudo"
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
                placeholder="Ton email"
                className="glass-input pl-9"
              />
            </div>
            {emailSuggestion && (
              <p className="text-xs text-amber-300">
                Tu voulais dire{" "}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(emailSuggestion);
                    setError(null);
                  }}
                  className="font-semibold underline decoration-dotted underline-offset-2 hover:text-amber-200"
                >
                  {emailSuggestion}
                </button>{" "}
                ?
              </p>
            )}
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Mot de passe (8+ caractères)"
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
              className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3"
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
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setStep("identity")}
                className="btn-ghost w-full justify-center sm:w-auto"
              >
                ← Retour
              </button>
              <button
                type="button"
                onClick={finalize}
                disabled={!creatureId || submitting}
                className="btn-gold w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Incantation…" : "Sceller le pacte"}
              </button>
            </div>
          </div>
        )}

        {step === "sent" && (
          <div className="mt-8 space-y-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
              <MailCheck className="h-7 w-7" />
            </span>
            <h2 className="heading-gold text-2xl">Vérifie ta boîte mail</h2>
            <p className="text-sm text-ivory/70">{sentMessage}</p>
            <p className="text-xs text-ivory/50">
              Pas reçu ? Vérifie les spams, ou retente via la page de
              connexion.
            </p>
            <Link to="/connexion" className="btn-gold inline-flex justify-center">
              Aller à la connexion
            </Link>
          </div>
        )}

        {step !== "sent" && (
          <p className="mt-6 text-center text-sm text-ivory/60">
            Déjà un pacte ?{" "}
            <Link to="/connexion" className="text-gold-300 hover:text-gold-200">
              Se connecter
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
