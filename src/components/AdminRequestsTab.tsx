import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, XCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  adminApproveRequest,
  adminListRequests,
  adminRejectRequest,
  type AdminRequestEntry,
} from "../lib/adminApi";
import { formatDate } from "../lib/helpers";

const ACTION_LABELS: Record<string, string> = {
  grant_lueurs: "Don de lueurs",
  grant_sylvins: "Don de Sylvins promo",
  grant_item: "Don d'objet",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Validée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

export function AdminRequestsTab() {
  const { backendMe } = useAuth();
  const { notify } = useToast();
  const [requests, setRequests] = useState<AdminRequestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const isArchitect = backendMe?.role === "architect";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await adminListRequests({ limit: 200 }));
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Impossible de charger les demandes administratives.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function review(
    request: AdminRequestEntry,
    action: "approve" | "reject",
  ) {
    const verb = action === "approve" ? "valider" : "refuser";
    if (!window.confirm(`Confirmer : ${verb} la demande #${request.id} ?`)) {
      return;
    }
    setReviewingId(request.id);
    try {
      const updated =
        action === "approve"
          ? await adminApproveRequest(request.id)
          : await adminRejectRequest(request.id);
      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      notify(
        action === "approve" ? "Demande validée." : "Demande refusée.",
        "success",
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Impossible de traiter la demande.",
        "error",
      );
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <section className="card-royal p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl text-gold-200">
            <ClipboardList className="h-5 w-5 text-gold-300" />
            Demandes administratives
          </h2>
          <p className="mt-1 text-sm text-ivory/60">
            Les dons de lueurs, Sylvins ou objets passent par une validation
            Architecte avant d'être appliqués.
          </p>
        </div>
        <button className="btn-royal" onClick={load} disabled={loading}>
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <ul className="mt-5 space-y-3">
        {requests.map((request) => (
          <li
            key={request.id}
            className="rounded-2xl border border-royal-500/30 bg-night-900/45 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm text-ivory/80">
                  <span className="font-display text-gold-200">
                    #{request.id} {ACTION_LABELS[request.actionType]}
                  </span>
                  <span className={statusClass(request.status)}>
                    {STATUS_LABELS[request.status] ?? request.status}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ivory/60">
                  Demandé par{" "}
                  <strong className="text-ivory/85">
                    {request.requesterUsername}
                  </strong>{" "}
                  pour{" "}
                  <strong className="text-ivory/85">
                    {request.targetUsername}
                  </strong>
                  {" · "}
                  {formatDate(request.createdAt)}
                </p>
                <p className="mt-2 text-sm text-ivory/80">
                  {request.actionType === "grant_item"
                    ? `Objet : ${request.itemId}`
                    : `${request.amount.toLocaleString("fr-FR")} ${
                        request.currency === "lueurs" ? "lueurs" : "Sylvins"
                      }`}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ivory/70">
                  Motif : {request.reason}
                </p>
                {request.reviewerUsername && (
                  <p className="mt-2 text-xs text-ivory/50">
                    Traité par {request.reviewerUsername}
                    {request.reviewedAt ? ` · ${formatDate(request.reviewedAt)}` : ""}
                  </p>
                )}
              </div>
              {isArchitect && request.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                    onClick={() => review(request, "approve")}
                    disabled={reviewingId === request.id}
                  >
                    <CheckCircle2 className="mr-1 inline h-4 w-4" />
                    Valider
                  </button>
                  <button
                    className="rounded-full border border-rose-300/60 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
                    onClick={() => review(request, "reject")}
                    disabled={reviewingId === request.id}
                  >
                    <XCircle className="mr-1 inline h-4 w-4" />
                    Refuser
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
        {!loading && requests.length === 0 && (
          <li className="rounded-2xl border border-dashed border-royal-500/30 p-6 text-center text-sm text-ivory/55">
            Aucune demande administrative pour le moment.
          </li>
        )}
      </ul>
    </section>
  );
}

function statusClass(status: string): string {
  const base =
    "rounded-full border px-2 py-0.5 font-regal text-[9px] uppercase tracking-[0.2em]";
  if (status === "approved") {
    return `${base} border-emerald-300/50 bg-emerald-500/15 text-emerald-100`;
  }
  if (status === "rejected") {
    return `${base} border-rose-300/50 bg-rose-500/15 text-rose-100`;
  }
  return `${base} border-gold-300/50 bg-gold-500/15 text-gold-100`;
}
