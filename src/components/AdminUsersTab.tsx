/**
 * Onglet "Utilisateurs" du dashboard admin (PR J).
 *
 * Affiche la liste complète des comptes (recherche par pseudo ou email)
 * avec leurs soldes, leur rôle, leur état (actif / suspendu), et un lien
 * direct vers leur profil où se trouve le `AdminUserPanel` détaillé.
 *
 * Un deuxième volet affiche le journal d'audit (actions admin récentes)
 * pour la responsabilisation mutuelle des admins.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Search, History } from "lucide-react";
import {
  adminListAuditLog,
  adminListUsers,
  type AdminUser,
  type AuditLogEntry,
} from "../lib/adminApi";
import { formatDate } from "../lib/helpers";

export function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a] = await Promise.all([
        adminListUsers(search),
        adminListAuditLog({ limit: 30 }),
      ]);
      setUsers(u);
      setAudit(a);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les utilisateurs.",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr,1fr]">
      <section>
        <div className="flex items-center gap-2 rounded-full border border-royal-500/40 bg-royal-800/40 px-4 py-2">
          <Search className="h-4 w-4 text-gold-300" />
          <input
            className="flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/40"
            placeholder="Rechercher par pseudo ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading && (
            <span className="text-[10px] uppercase tracking-[0.22em] text-ivory/50">
              Chargement…
            </span>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="card-royal flex flex-wrap items-center gap-3 p-4"
            >
              {u.avatarImageUrl ? (
                <img
                  src={u.avatarImageUrl}
                  alt={u.username}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-gold-400/40"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gold-500/20" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/u/${u.id}`}
                    className="font-display text-lg text-gold-200 hover:text-gold-100"
                  >
                    {u.username}
                  </Link>
                  <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-2 py-0.5 font-regal text-[9px] uppercase tracking-[0.22em] text-gold-200">
                    {u.role}
                  </span>
                  {u.bannedAt && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-2 py-0.5 font-regal text-[9px] uppercase tracking-[0.22em] text-rose-200">
                      <ShieldAlert className="h-3 w-3" /> Suspendu
                    </span>
                  )}
                  {u.reportsAgainstCount > 0 && (
                    <span className="inline-flex items-center rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white">
                      {u.reportsAgainstCount} signalement·s
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ivory/60">
                  {u.email ?? "(sans email)"} • {u.activeSessions} session·s •
                  inscrit·e {formatDate(u.createdAt)}
                </p>
                <p className="mt-1 font-regal text-[10px] tracking-[0.18em] text-ivory/55">
                  {u.lueurs.toLocaleString("fr-FR")} L · {u.sylvinsPromo} Sp ·
                  {" "}
                  {u.sylvinsPaid} S€ · {u.earningsPromo} Ep · {u.earningsPaid} E€
                </p>
              </div>
              <Link to={`/u/${u.id}`} className="btn-gold">
                Gérer
              </Link>
            </li>
          ))}
          {!loading && users.length === 0 && (
            <li className="text-center text-sm text-ivory/50">
              Aucun utilisateur trouvé.
            </li>
          )}
        </ul>
      </section>

      <aside>
        <h3 className="flex items-center gap-2 font-display text-lg text-gold-200">
          <History className="h-4 w-4 text-gold-300" /> Journal d'audit
        </h3>
        <p className="mt-1 text-[11px] text-ivory/55">
          30 dernières actions admin (wallet, rôle, ban).
        </p>
        <ul className="mt-4 space-y-2">
          {audit.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-royal-500/30 bg-royal-800/30 p-3 text-[11px]"
            >
              <p className="text-ivory/80">
                <strong className="text-gold-200">
                  {entry.actorUsername}
                </strong>{" "}
                <em className="text-ivory/60">{labelAction(entry.action)}</em>{" "}
                sur{" "}
                <Link
                  to={`/u/${entry.targetId}`}
                  className="text-gold-300 hover:text-gold-100"
                >
                  {entry.targetUsername}
                </Link>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-ivory/60">
                {formatAuditDetails(entry)}
              </p>
              <p className="mt-1 font-regal text-[9px] uppercase tracking-[0.22em] text-ivory/45">
                {formatDate(entry.createdAt)}
              </p>
            </li>
          ))}
          {audit.length === 0 && (
            <li className="text-center text-sm text-ivory/50">
              Aucune action encore enregistrée.
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}

function labelAction(action: string): string {
  switch (action) {
    case "wallet_adjust":
      return "a ajusté le wallet";
    case "role_change":
      return "a changé le rôle";
    case "ban":
      return "a suspendu";
    case "unban":
      return "a rétabli";
    default:
      return `a exécuté « ${action} »`;
  }
}

function formatAuditDetails(entry: AuditLogEntry): string {
  const d = entry.details || {};
  if (entry.action === "wallet_adjust") {
    const sign = Number(d.delta) > 0 ? "+" : "";
    return `${sign}${d.delta} ${d.pot} (${d.old_value} → ${d.new_value}) — ${d.reason ?? ""}`;
  }
  if (entry.action === "role_change") {
    return `${d.old_role} → ${d.new_role}${d.reason ? ` (${d.reason})` : ""}`;
  }
  if (entry.action === "ban") {
    return `Motif : ${d.reason ?? "—"} · ${d.sessions_revoked ?? 0} session·s révoquée·s`;
  }
  if (entry.action === "unban") {
    return `(précédent motif : ${d.previous_reason ?? "—"})`;
  }
  return JSON.stringify(d);
}
