/**
 * Onglet "Signalements" du dashboard admin (PR K).
 *
 * Inbox des reports : filtres par statut + type, chaque ligne montre le
 * contenu signalé (avec lien cliquable), le rapporteur (visible par
 * l'admin seulement), le motif, la description et la date. Actions :
 * Résoudre (contenu traité) ou Rejeter (report invalide / spam).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, CheckCircle2, XCircle, Flag } from "lucide-react";
import {
  adminListReports,
  adminSetReportStatus,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
  type ReportEntry,
  type ReportStatus,
  type ReportTargetType,
} from "../lib/adminApi";
import { useToast } from "../contexts/ToastContext";
import { formatDate } from "../lib/helpers";

const STATUSES: { id: ReportStatus | "all"; label: string }[] = [
  { id: "open", label: "Ouverts" },
  { id: "resolved", label: "Résolus" },
  { id: "rejected", label: "Rejetés" },
  { id: "all", label: "Tous" },
];

const TYPES: { id: ReportTargetType | "all"; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "user", label: "Profils" },
  { id: "live", label: "Lives" },
  { id: "post", label: "Publications" },
  { id: "comment", label: "Commentaires" },
];

interface Props {
  onCountChange?: (openCount: number) => void;
}

export function AdminReportsTab({ onCountChange }: Props) {
  const { notify } = useToast();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("open");
  const [typeFilter, setTypeFilter] = useState<ReportTargetType | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminListReports({
        status: statusFilter === "all" ? undefined : statusFilter,
        targetType: typeFilter === "all" ? undefined : typeFilter,
      });
      setReports(list);
      // Si on est sur la vue "ouverts", on remonte le compteur au parent
      // pour que le badge de l'onglet soit à jour.
      if (statusFilter === "open" && typeFilter === "all") {
        onCountChange?.(list.length);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les signalements.",
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(report: ReportEntry, next: ReportStatus) {
    try {
      await adminSetReportStatus(report.id, next);
      notify(
        next === "resolved"
          ? "Signalement résolu ✨"
          : next === "rejected"
            ? "Signalement rejeté."
            : "Signalement rouvert.",
        "success",
      );
      await load();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Impossible de mettre à jour le statut.",
        "error",
      );
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 font-display text-2xl text-gold-200">
          <Flag className="h-5 w-5 text-gold-300" /> Inbox des signalements
        </h2>
        <p className="mt-1 text-sm text-ivory/60">
          Reports posés par les joueur·se·s. Tu vois l'identité du rapporteur,
          mais la personne signalée ne la voit pas.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={
                statusFilter === s.id
                  ? "rounded-full border border-gold-400/70 bg-gold-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-gold-200"
                  : "rounded-full border border-royal-500/30 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-ivory/70 hover:border-gold-400/40"
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-l border-royal-500/30 pl-3">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={
                typeFilter === t.id
                  ? "rounded-full border border-gold-400/70 bg-gold-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-gold-200"
                  : "rounded-full border border-royal-500/30 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-ivory/70 hover:border-gold-400/40"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
          Chargement…
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {reports.map((r) => (
          <li key={r.id} className="card-royal p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-2 py-0.5 font-regal text-[9px] uppercase tracking-[0.22em] text-gold-200">
                    {REPORT_TARGET_LABELS[r.targetType]}
                  </span>
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 font-regal text-[9px] uppercase tracking-[0.22em] text-rose-200">
                    {REPORT_REASON_LABELS[r.reason]}
                  </span>
                  {r.status === "open" && (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Ouvert
                    </span>
                  )}
                  {r.status === "resolved" && (
                    <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Résolu
                    </span>
                  )}
                  {r.status === "rejected" && (
                    <span className="rounded-full bg-slate-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Rejeté
                    </span>
                  )}
                </div>
                <p className="mt-2 font-display text-base text-gold-200">
                  {r.targetLabel || `${r.targetType} · ${r.targetId}`}
                </p>
                {r.targetUrl && (
                  <Link
                    to={r.targetUrl}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-gold-300 hover:text-gold-100"
                    target={r.targetUrl.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" /> Voir le contenu signalé
                  </Link>
                )}
                {r.description && (
                  <blockquote className="mt-3 border-l-2 border-gold-400/40 pl-3 text-xs italic text-ivory/70">
                    {r.description}
                  </blockquote>
                )}
                <p className="mt-3 text-[11px] text-ivory/55">
                  Signalé par{" "}
                  <Link
                    to={`/u/${r.reporterId}`}
                    className="text-gold-300 hover:text-gold-100"
                  >
                    {r.reporterUsername}
                  </Link>{" "}
                  · {formatDate(r.createdAt)}
                  {r.resolvedAt && (
                    <>
                      {" "}· fermé le {formatDate(r.resolvedAt)}
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {r.status !== "resolved" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/15 px-3 py-1.5 font-regal text-[10px] font-semibold tracking-[0.22em] text-emerald-200 hover:bg-emerald-500/30"
                    onClick={() => setStatus(r, "resolved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Résoudre
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-400/40 bg-slate-500/15 px-3 py-1.5 font-regal text-[10px] font-semibold tracking-[0.22em] text-slate-200 hover:bg-slate-500/30"
                    onClick={() => setStatus(r, "rejected")}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Rejeter
                  </button>
                )}
                {r.status !== "open" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-royal-500/40 px-3 py-1.5 font-regal text-[10px] font-semibold tracking-[0.22em] text-ivory/70 hover:border-gold-400/40"
                    onClick={() => setStatus(r, "open")}
                  >
                    Rouvrir
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
        {!loading && reports.length === 0 && (
          <li className="text-center text-sm text-ivory/50">
            Aucun signalement dans cette catégorie. ✨
          </li>
        )}
      </ul>
    </div>
  );
}
