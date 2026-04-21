/**
 * Panneau d'actions admin sur un profil utilisateur (PR J).
 *
 * Affiché uniquement si :
 *   - l'utilisateur connecté a `backendMe.role === "admin"`, et
 *   - la page affiche un autre profil (ou son propre profil — l'admin
 *     peut aussi s'ajuster son propre wallet pour tester).
 *
 * Actions :
 *   - Ajuster les 5 pots du wallet (crédit/débit + raison obligatoire)
 *   - Changer le rôle (user / animator / admin)
 *   - Bannir / dé-bannir (révoque toutes les sessions)
 *
 * Toutes les actions sont loggées côté serveur dans `AdminAuditLog` —
 * consultable depuis `/admin → Utilisateurs → Journal`.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Coins, UserCog, Ban, RotateCcw, KeyRound, ShieldOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  adminAdjustWallet,
  adminBanUser,
  adminDisableTotp,
  adminGetUser,
  adminResetPassword,
  adminSetRole,
  adminUnbanUser,
  WALLET_POT_LABELS,
  type AdminUser,
  type WalletPot,
} from "../lib/adminApi";
import { formatDate } from "../lib/helpers";

interface Props {
  /** Id opaque du user ciblé par les actions admin. */
  targetUserId: string;
  /** Pseudo du user ciblé (pour les confirmations et logs). */
  targetUsername: string;
  /** Callback invoqué après chaque action réussie, pour rafraîchir la page parente. */
  onChange?: () => void;
}

const POTS: WalletPot[] = [
  "lueurs",
  "sylvins_promo",
  "sylvins_paid",
  "earnings_promo",
  "earnings_paid",
];

const ROLES: { id: string; label: string }[] = [
  { id: "user", label: "Membre (user)" },
  { id: "animator", label: "Animateur (🎭 badge)" },
  { id: "admin", label: "Admin (🛡️ droits complets)" },
];

export function AdminUserPanel({ targetUserId, targetUsername, onChange }: Props) {
  const { backendMe } = useAuth();
  const { notify } = useToast();

  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [pot, setPot] = useState<WalletPot>("lueurs");
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [roleDraft, setRoleDraft] = useState<string>("user");
  const [banReason, setBanReason] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [pwReason, setPwReason] = useState<string>("");
  const [totpReason, setTotpReason] = useState<string>("");

  const isAdmin = backendMe?.role === "admin";
  const isSelf = backendMe?.id === targetUserId;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    adminGetUser(targetUserId)
      .then((u) => {
        if (!cancelled) {
          setDetail(u);
          setRoleDraft(u.role);
        }
      })
      .catch(() => {
        /* silencieux — on affichera juste un placeholder si erreur */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, targetUserId]);

  if (!isAdmin) return null;

  async function handleWalletAdjust(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(delta);
    if (!Number.isFinite(parsed) || parsed === 0) {
      notify("Entre un delta non nul (positif ou négatif).", "error");
      return;
    }
    if (reason.trim().length < 2) {
      notify("Donne une raison (min. 2 caractères) pour le journal.", "error");
      return;
    }
    setLoading(true);
    try {
      const updated = await adminAdjustWallet(targetUserId, {
        pot,
        delta: Math.trunc(parsed),
        reason: reason.trim(),
      });
      setDetail(updated);
      setDelta("");
      setReason("");
      notify(
        `${parsed > 0 ? "+" : ""}${parsed} ${WALLET_POT_LABELS[pot]} appliqués à ${targetUsername}.`,
        "success",
      );
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec de l'ajustement.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange() {
    if (!detail || roleDraft === detail.role) return;
    setLoading(true);
    try {
      const updated = await adminSetRole(targetUserId, roleDraft);
      setDetail(updated);
      notify(`Rôle de ${targetUsername} : ${roleDraft}.`, "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec du changement de rôle.",
        "error",
      );
      setRoleDraft(detail.role);
    } finally {
      setLoading(false);
    }
  }

  async function handleBan() {
    if (!banReason.trim()) {
      notify("Donne une raison au bannissement.", "error");
      return;
    }
    if (
      !window.confirm(
        `Confirmer le bannissement de ${targetUsername} ? Toutes ses sessions seront révoquées.`,
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const updated = await adminBanUser(targetUserId, banReason.trim());
      setDetail(updated);
      setBanReason("");
      notify(`${targetUsername} suspendu·e.`, "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec du bannissement.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (isSelf) {
      notify(
        "Utilise /compte pour changer ton propre mot de passe (il faut l'ancien).",
        "error",
      );
      return;
    }
    if (newPassword.length < 10) {
      notify("Mot de passe trop court (10 caractères minimum).", "error");
      return;
    }
    if (pwReason.trim().length < 2) {
      notify("Donne une raison (min. 2 caractères) pour le journal.", "error");
      return;
    }
    if (
      !window.confirm(
        `Confirmer le reset du mot de passe de ${targetUsername} ? ` +
          "Toutes ses sessions seront révoquées et il devra se reconnecter.",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const updated = await adminResetPassword(targetUserId, {
        newPassword,
        reason: pwReason.trim(),
      });
      setDetail(updated);
      setNewPassword("");
      setPwReason("");
      notify(
        `Mot de passe de ${targetUsername} mis à jour. Transmets-lui le nouveau.`,
        "success",
      );
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec du reset.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUnban() {
    setLoading(true);
    try {
      const updated = await adminUnbanUser(targetUserId);
      setDetail(updated);
      notify(`${targetUsername} rétabli·e.`, "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec du déban.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-royal border-2 border-gold-400/40 bg-royal-900/50 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-xl text-gold-200">
            Panneau d'administration
          </h2>
        </div>
        {detail?.bannedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-rose-200">
            <Ban className="h-3 w-3" /> Compte suspendu
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/15 px-3 py-1 font-regal text-[10px] font-semibold tracking-[0.22em] text-emerald-200">
            <ShieldCheck className="h-3 w-3" /> Actif
          </span>
        )}
      </header>

      {detail && (
        <dl className="mt-4 grid gap-2 text-xs text-ivory/70 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
              Email
            </dt>
            <dd className="text-ivory/85">{detail.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
              Inscription
            </dt>
            <dd>{formatDate(detail.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
              Sessions actives
            </dt>
            <dd>{detail.activeSessions}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
              Signalements ouverts
            </dt>
            <dd>{detail.reportsAgainstCount}</dd>
          </div>
        </dl>
      )}

      {/* --- Soldes ------------------------------------------------------ */}
      <div className="mt-6">
        <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
          <Coins className="h-4 w-4 text-gold-300" /> Soldes actuels
        </h3>
        {detail ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            {(
              [
                ["lueurs", "Lueurs", detail.lueurs],
                ["sylvins_promo", "Sylvins promo", detail.sylvinsPromo],
                ["sylvins_paid", "Sylvins payés", detail.sylvinsPaid],
                ["earnings_promo", "Earnings promo", detail.earningsPromo],
                ["earnings_paid", "Earnings payés", detail.earningsPaid],
              ] as const
            ).map(([id, label, value]) => (
              <div
                key={id}
                className="rounded-lg border border-royal-500/30 bg-royal-800/40 p-3"
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300/80">
                  {label}
                </p>
                <p className="mt-1 font-display text-lg text-gold-200">
                  {value.toLocaleString("fr-FR")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ivory/50">Chargement des soldes…</p>
        )}
      </div>

      {/* --- Ajuster le wallet ------------------------------------------ */}
      <form onSubmit={handleWalletAdjust} className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4">
        <h3 className="font-display text-sm text-gold-200">
          Ajuster un solde
        </h3>
        <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
          <select
            className="glass-input"
            value={pot}
            onChange={(e) => setPot(e.target.value as WalletPot)}
            disabled={loading}
          >
            {POTS.map((p) => (
              <option key={p} value={p}>
                {WALLET_POT_LABELS[p]}
              </option>
            ))}
          </select>
          <input
            className="glass-input w-full sm:w-40"
            type="number"
            step="1"
            placeholder="Delta (+/-)"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            disabled={loading}
          />
        </div>
        <input
          className="glass-input w-full"
          placeholder="Raison (obligatoire, loguée)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-gold" disabled={loading}>
          Appliquer le delta
        </button>
      </form>

      {/* --- Rôle -------------------------------------------------------- */}
      <div className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4">
        <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
          <UserCog className="h-4 w-4 text-gold-300" /> Rôle de {targetUsername}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="glass-input"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value)}
            disabled={loading}
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-royal"
            onClick={handleRoleChange}
            disabled={loading || !detail || roleDraft === detail.role}
          >
            Mettre à jour
          </button>
        </div>
      </div>

      {/* --- Reset mot de passe ---------------------------------------- */}
      {!isSelf && (
        <form
          onSubmit={handlePasswordReset}
          className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4"
        >
          <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
            <KeyRound className="h-4 w-4 text-gold-300" /> Réinitialiser le mot de passe
          </h3>
          <p className="text-[11px] text-ivory/60">
            Définit directement un nouveau mot de passe pour {targetUsername}.
            Utile tant que l'email transac n'est pas en place, ou pour
            débloquer un compte coincé en "mode hors-ligne". Toutes ses
            sessions seront révoquées.
          </p>
          <input
            className="glass-input w-full"
            type="text"
            autoComplete="new-password"
            placeholder="Nouveau mot de passe (10 caractères min.)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
          />
          <input
            className="glass-input w-full"
            placeholder="Raison (obligatoire, loguée — ex : 'mdp oublié, demandé via Discord')"
            value={pwReason}
            onChange={(e) => setPwReason(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn-gold" disabled={loading}>
            <KeyRound className="h-4 w-4" /> Appliquer le nouveau mot de passe
          </button>
        </form>
      )}

      {/* --- Désactiver 2FA ---------------------------------------------- */}
      {!isSelf && detail?.totpEnabled && (
        <div className="mt-6 space-y-3 rounded-lg border border-amber-400/20 bg-amber-900/10 p-4">
          <h3 className="flex items-center gap-2 font-display text-sm text-amber-200">
            <ShieldOff className="h-4 w-4 text-amber-300" /> Désactiver le 2FA (TOTP)
          </h3>
          <p className="text-[11px] text-ivory/60">
            {targetUsername} a le 2FA activé. Si le user a perdu l'accès à
            son appli authenticator (ou que le TOTP a été activé par erreur),
            désactive-le ici pour le débloquer. Les codes de récupération
            seront aussi effacés.
          </p>
          <input
            className="glass-input w-full"
            placeholder="Raison (obligatoire, loguée — ex : 'perdu accès authenticator')"
            value={totpReason}
            onChange={(e) => setTotpReason(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            className="btn-gold"
            disabled={loading || totpReason.trim().length < 2}
            onClick={async () => {
              if (
                !window.confirm(
                  `Confirmer la désactivation du 2FA de ${targetUsername} ? Il pourra se connecter sans code TOTP.`,
                )
              )
                return;
              setLoading(true);
              try {
                const updated = await adminDisableTotp(
                  targetUserId,
                  totpReason.trim(),
                );
                setDetail(updated);
                setTotpReason("");
                notify(
                  `2FA de ${targetUsername} désactivé.`,
                  "success",
                );
                onChange?.();
              } catch (err) {
                notify(
                  err instanceof Error ? err.message : "Échec de la désactivation 2FA.",
                  "error",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <ShieldOff className="h-4 w-4" /> Désactiver le 2FA
          </button>
        </div>
      )}

      {/* --- Ban / unban ------------------------------------------------- */}
      <div className="mt-6 space-y-3 rounded-lg border border-rose-400/20 bg-rose-900/10 p-4">
        <h3 className="flex items-center gap-2 font-display text-sm text-rose-200">
          <ShieldAlert className="h-4 w-4 text-rose-300" /> Sanction
        </h3>
        {detail?.bannedAt ? (
          <div className="space-y-2">
            <p className="text-xs text-ivory/70">
              Suspendu·e le <strong>{formatDate(detail.bannedAt)}</strong>
              {detail.bannedReason ? ` — ${detail.bannedReason}` : ""}
            </p>
            <button
              type="button"
              className="btn-gold"
              onClick={handleUnban}
              disabled={loading}
            >
              <RotateCcw className="h-4 w-4" /> Rétablir le compte
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="glass-input w-full"
              placeholder="Raison du bannissement (obligatoire)"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="rounded-full border border-rose-400/60 bg-rose-500/20 px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] text-rose-100 hover:bg-rose-500/40 disabled:opacity-40"
              onClick={handleBan}
              disabled={loading || !banReason.trim() || detail?.role === "admin"}
            >
              <Ban className="mr-1 inline h-4 w-4" /> Bannir ce compte
            </button>
            {detail?.role === "admin" && (
              <p className="text-[11px] text-ivory/50">
                Retire d'abord le rôle admin avant de bannir.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
