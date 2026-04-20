import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { authVerifyEmail } from "../lib/authApi";
import { ApiError } from "../lib/api";

type State =
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Lien invalide : token manquant." });
      return;
    }
    (async () => {
      try {
        const res = await authVerifyEmail(token);
        setState({
          status: "success",
          message: res.message ?? "Email vérifié ✨",
        });
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Impossible de vérifier le lien.";
        setState({ status: "error", message: msg });
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-royal p-8 text-center"
      >
        {state.status === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold-300" />
            <h1 className="heading-gold mt-4 text-2xl">Vérification en cours…</h1>
          </>
        )}
        {state.status === "success" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/10 text-gold-300">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <h1 className="heading-gold mt-4 text-2xl">Email validé ✨</h1>
            <p className="mt-2 text-sm text-ivory/70">{state.message}</p>
            <Link
              to="/connexion"
              className="btn-gold mt-6 inline-flex justify-center"
            >
              Entrer dans Vaelyndra
            </Link>
          </>
        )}
        {state.status === "error" && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-200">
              <ShieldAlert className="h-7 w-7" />
            </span>
            <h1 className="heading-gold mt-4 text-2xl">Lien invalide</h1>
            <p className="mt-2 text-sm text-ivory/70">{state.message}</p>
            <p className="mt-4 text-xs text-ivory/50">
              Le lien a peut-être expiré (valable 24 h) ou déjà été utilisé.
            </p>
            <Link
              to="/connexion"
              className="btn-ghost mt-6 inline-flex justify-center"
            >
              Retourner à la connexion
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
