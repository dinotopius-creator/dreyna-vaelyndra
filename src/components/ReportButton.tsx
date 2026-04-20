/**
 * Bouton de signalement (PR K).
 *
 * Affiché sur les profils, les lives, les posts et les commentaires. Un
 * clic ouvre une modal où le user choisit un motif + ajoute une
 * description optionnelle. L'envoi appelle `POST /reports` et est
 * déduplicé côté serveur (un même user ne peut pas spam-signaler la
 * même cible dans la même journée — dans ce cas on renvoie le report
 * existant silencieusement).
 *
 * Les auteurs du contenu signalé ne voient jamais ces reports : seuls
 * les admins les consultent via `/admin → Signalements`.
 */
import { useState } from "react";
import { Flag, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  createReport,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTargetType,
} from "../lib/adminApi";

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  /** URL relative vers le contenu signalé (affichée à l'admin dans l'inbox). */
  targetUrl?: string;
  /** Variante compacte (icône seule, pas de libellé). */
  compact?: boolean;
  /** Classes CSS additionnelles pour le bouton déclencheur. */
  className?: string;
}

const REASONS: ReportReason[] = [
  "spam",
  "harcelement",
  "contenu_sensible",
  "triche",
  "usurpation",
  "autre",
];

export function ReportButton({
  targetType,
  targetId,
  targetLabel = "",
  targetUrl = "",
  compact = false,
  className = "",
}: Props) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pas de bouton pour les non-connectés — on évite de proposer une action
  // qui échouerait immédiatement avec un 401.
  if (!user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createReport({
        targetType,
        targetId,
        targetLabel,
        targetUrl,
        reason,
        description: description.trim().slice(0, 2000),
      });
      notify("Merci, nous avons bien reçu ton signalement. ✨", "success");
      setOpen(false);
      setDescription("");
      setReason("spam");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Impossible d'envoyer le signalement.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 font-regal text-[10px] font-semibold tracking-[0.22em] text-rose-200/80 hover:border-rose-400/60 hover:bg-rose-500/15 hover:text-rose-100"
        }
        title="Signaler ce contenu"
        aria-label="Signaler"
      >
        <Flag className="h-3.5 w-3.5" />
        {!compact && <span>Signaler</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-sm"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gold-400/30 bg-royal-900/95 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Signalement
                </p>
                <h3 className="mt-1 font-display text-xl text-gold-200">
                  {targetLabel || "Contenu sur Vaelyndra"}
                </h3>
              </div>
              <button
                type="button"
                className="text-ivory/60 hover:text-ivory"
                onClick={() => setOpen(false)}
                disabled={submitting}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="block font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Motif
                </label>
                <select
                  className="glass-input mt-2 w-full"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  disabled={submitting}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {REPORT_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-regal text-[10px] tracking-[0.22em] text-gold-300">
                  Description (optionnelle, 2000 car. max)
                </label>
                <textarea
                  className="glass-input mt-2 h-28 w-full resize-none"
                  placeholder="Ce qui s'est passé, quand, preuves éventuelles…"
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value.slice(0, 2000))
                  }
                  disabled={submitting}
                />
                <p className="mt-1 text-right text-[10px] text-ivory/50">
                  {description.length} / 2000
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-ivory/50">
                  Ton signalement est anonyme vis-à-vis de la personne
                  signalée — seul·e un·e admin le verra.
                </p>
                <button
                  type="submit"
                  className="btn-gold"
                  disabled={submitting}
                >
                  {submitting ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
