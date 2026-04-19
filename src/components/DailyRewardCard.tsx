/**
 * Carte « Récompense quotidienne » — affiche l'état du cooldown
 * (20 h côté backend) et un bouton de réclame. Le serveur retourne la
 * valeur effectivement créditée et met à jour `lastDailyAt` sur le
 * profil, ce qui nous permet de calculer le prochain claim côté front
 * sans avoir à deviner la config.
 */
import { useEffect, useMemo, useState } from "react";
import { Gift, Clock, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";

const COOLDOWN_HOURS = 20;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function DailyRewardCard({ className }: { className?: string }) {
  const { profile, claimDaily } = useProfile();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  // Tick pour rafraîchir l'affichage du compte à rebours.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastDailyAt = profile?.lastDailyAt;
  const nextClaimAt = useMemo(() => {
    if (!lastDailyAt) return 0;
    return new Date(lastDailyAt).getTime() + COOLDOWN_MS;
  }, [lastDailyAt]);

  const remaining = nextClaimAt - now;
  const canClaim = remaining <= 0;

  async function handleClaim() {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await claimDaily();
      if (!res) return;
      if (res.already_claimed) {
        notify("Récompense déjà réclamée — revenez plus tard.", "info");
      } else {
        notify(`+${res.granted} Lueurs ajoutés à votre bourse ✨`);
      }
    } catch {
      notify("Impossible de réclamer la récompense. Réessayez.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={clsx(
        "card-royal flex flex-col gap-3 p-5 text-left",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500/15 text-gold-200">
          <Gift className="h-5 w-5" />
        </span>
        <div>
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            ✦ Récompense quotidienne
          </p>
          <h4 className="font-display text-lg text-ivory">+50 Lueurs / jour</h4>
        </div>
      </div>
      <p className="text-[12px] text-ivory/60">
        Revenez chaque jour pour faire grossir votre bourse de Lueurs. Elles
        servent à débloquer styles et fonds dans la boutique avatar.
      </p>
      {canClaim ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-gold-shine px-4 py-2 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Réclame…" : "Réclamer +50 Lueurs"}
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-royal-500/30 bg-night-950/60 px-4 py-2 font-regal text-[11px] tracking-[0.22em] text-ivory/65">
          <Clock className="h-4 w-4" /> Prochaine réclame dans{" "}
          {formatRemaining(remaining)}
        </div>
      )}
    </section>
  );
}
