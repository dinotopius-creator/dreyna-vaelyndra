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
import {
  ShieldCheck,
  ShieldAlert,
  Coins,
  UserCog,
  Ban,
  RotateCcw,
  KeyRound,
  ShieldOff,
  Trash2,
  Crown,
  Mail,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  adminAdjustWallet,
  adminBanUser,
  adminChangeEmail,
  adminDisableTotp,
  adminGetUser,
  adminHardDeleteUser,
  adminResetPassword,
  adminSetGradeOverride,
  adminSetRole,
  adminUnbanUser,
  WALLET_POT_LABELS,
  type AdminUser,
  type WalletPot,
} from "../lib/adminApi";
import { GRADES, gradeBySlug, type GradeSlug } from "../data/grades";
import { apiGetProfile } from "../lib/api";
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

export function AdminUserPanel({
  targetUserId,
  targetUsername,
  onChange,
}: Props) {
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
  const [emailDraft, setEmailDraft] = useState<string>("");
  const [emailReason, setEmailReason] = useState<string>("");
  const [totpReason, setTotpReason] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string>("");
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [deleted, setDeleted] = useState<boolean>(false);
  /**
   * Slug du grade actuellement affiché pour la cible (source : `UserProfile.grade.slug`).
   * null tant que le profil n'est pas encore chargé. Permet de détecter si la
   * cible est déjà Légende (dans ce cas on propose "Révoquer" au lieu de "Sacrer").
   */
  const [currentGradeSlug, setCurrentGradeSlug] = useState<string | null>(null);
  /** Override admin actuel (null = progression XP naturelle). */
  const [currentOverride, setCurrentOverride] = useState<string | null>(null);
  /** Slug sélectionné dans le select « grade manuel » (hors bouton Légende). */
  const [overrideDraft, setOverrideDraft] = useState<string>("");

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
          setEmailDraft(u.email ?? "");
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

  // Charge le grade + override courant (endpoints publics, pas admin).
  // Permet au bouton "Sacrer Légende" de savoir s'il doit afficher
  // "Sacrer" ou "Révoquer" et de grîner le <select> si déjà Légende.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiGetProfile(targetUserId)
      .then((p) => {
        if (cancelled) return;
        const slug = p.grade?.slug ?? null;
        const isOverride = Boolean(p.grade?.override);
        setCurrentGradeSlug(slug);
        setCurrentOverride(isOverride ? slug : null);
        setOverrideDraft(isOverride ? (slug ?? "") : "");
      })
      .catch(() => {
        /* silencieux */
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
      notify(err instanceof Error ? err.message : "Échec du reset.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const email = emailDraft.trim();
    if (!email) {
      notify("Renseigne le nouvel email.", "error");
      return;
    }
    if (!emailReason.trim()) {
      notify("Renseigne une raison pour le journal admin.", "error");
      return;
    }
    setLoading(true);
    try {
      const updated = await adminChangeEmail(targetUserId, {
        email,
        reason: emailReason.trim(),
        sendVerification: true,
      });
      setDetail(updated);
      setEmailDraft(updated.email ?? email);
      setEmailReason("");
      notify("Email mis à jour et confirmation envoyée.", "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Impossible de changer l'email.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleHardDelete() {
    if (!detail) return;
    if (isSelf) {
      notify("Tu ne peux pas supprimer ton propre compte depuis ici.", "error");
      return;
    }
    if (detail.role === "admin") {
      notify("Retire d'abord le rôle admin avant de supprimer.", "error");
      return;
    }
    if (deleteConfirm.trim() !== targetUsername) {
      notify(
        `Tape exactement le pseudo "${targetUsername}" pour confirmer.`,
        "error",
      );
      return;
    }
    if (deleteReason.trim().length < 2) {
      notify("Donne une raison (min. 2 caractères) pour le journal.", "error");
      return;
    }
    if (
      !window.confirm(
        `Suppression DÉFINITIVE de ${targetUsername} ? ` +
          "Tous ses posts, messages, likes, follows, cadeaux et sessions seront purgés. " +
          "Cette action est irréversible.",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await adminHardDeleteUser(targetUserId, {
        confirmUsername: deleteConfirm.trim(),
        reason: deleteReason.trim(),
      });
      setDeleted(true);
      setDeleteConfirm("");
      setDeleteReason("");
      notify(`${targetUsername} supprimé·e définitivement.`, "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Échec de la suppression.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyGradeOverride(
    nextSlug: GradeSlug | null,
    successMsg: string,
  ) {
    setLoading(true);
    try {
      const updated = await adminSetGradeOverride(targetUserId, nextSlug);
      const slug = updated.grade?.slug ?? null;
      const isOverride = Boolean(updated.grade?.override);
      setCurrentGradeSlug(slug);
      setCurrentOverride(isOverride ? slug : null);
      setOverrideDraft(isOverride ? (slug ?? "") : "");
      notify(successMsg, "success");
      onChange?.();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Échec de la mise à jour du grade.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantLegend() {
    if (
      !window.confirm(
        `Sacrer ${targetUsername} Légende de Vaelyndra ?\n\n` +
          "Son badge 👑 Légende sera affiché partout (chat, profil, Cour, boutique). " +
          "Un DM de félicitations officiel sera envoyé automatiquement de la part de Dreyna.",
      )
    ) {
      return;
    }
    // On ne claim pas "DM envoyé" : côté backend l'envoi du DM est
    // best-effort (le sacre est déjà committé avant), donc le 200 reçu
    // ici n'atteste que du sacre. Laisser sous-entendre que le DM est
    // arrivé pourrait induire l'admin en erreur et l'empêcher d'envoyer
    // un message manuel de secours.
    await applyGradeOverride(
      "legende-vaelyndra",
      `${targetUsername} sacré·e Légende de Vaelyndra.`,
    );
  }

  async function handleRevokeLegend() {
    if (
      !window.confirm(
        `Retirer le statut Légende à ${targetUsername} ?\n\n` +
          "Sa progression XP reprendra automatiquement et il/elle retournera au grade " +
          "correspondant à son XP actuel.",
      )
    ) {
      return;
    }
    await applyGradeOverride(
      null,
      `Statut Légende retiré à ${targetUsername}. Progression XP rétablie.`,
    );
  }

  async function handleApplyManualGrade() {
    const slug = overrideDraft || null;
    if (slug === currentOverride) return;
    if (slug === "legende-vaelyndra") {
      // Même garde-fou que le bouton dédié "Sacrer Légende" — un DM de
      // félicitations officiel sera envoyé automatiquement, donc on
      // confirme explicitement pour éviter l'envoi accidentel.
      if (
        !window.confirm(
          `Sacrer ${targetUsername} Légende de Vaelyndra ?\n\n` +
            "Son badge 👑 Légende sera affiché partout (chat, profil, Cour, boutique). " +
            "Un DM de félicitations officiel sera envoyé automatiquement de la part de Dreyna.",
        )
      ) {
        return;
      }
    } else if (slug) {
      // Pour les grades non-Légende, simple confirm textuel.
      const g = gradeBySlug(slug);
      if (
        !window.confirm(
          `Forcer ${targetUsername} au grade ${g?.emoji ?? ""} ${g?.name ?? slug} ?\n\n` +
            "Sa progression XP sera figée sur ce grade tant que l'override est actif.",
        )
      ) {
        return;
      }
    }
    await applyGradeOverride(
      slug as GradeSlug | null,
      slug
        ? `Grade de ${targetUsername} forcé : ${gradeBySlug(slug)?.name ?? slug}.`
        : `Override de grade retiré pour ${targetUsername}. Progression XP rétablie.`,
    );
  }

  async function handleUnban() {
    setLoading(true);
    try {
      const updated = await adminUnbanUser(targetUserId);
      setDetail(updated);
      notify(`${targetUsername} rétabli·e.`, "success");
      onChange?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Échec du déban.", "error");
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
      <form
        onSubmit={handleWalletAdjust}
        className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4"
      >
        <h3 className="font-display text-sm text-gold-200">Ajuster un solde</h3>
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

      {/* --- Sacre Légende + override de grade manuel ------------------- */}
      <div className="mt-6 space-y-3 rounded-lg border border-gold-400/30 bg-royal-800/30 p-4">
        <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
          <Crown className="h-4 w-4 text-gold-300" /> Grade spirituel
        </h3>
        <p className="text-[11px] leading-relaxed text-ivory/60">
          Le grade <strong>👑 Légende de Vaelyndra</strong> n'est
          <em> jamais</em> obtenu via XP : c'est un sacre que tu accordes
          manuellement à un·e créateur·rice qui t'a marqué. Un DM automatique de
          félicitations sera envoyé de la part de Dreyna. Les autres grades sont
          listés ci-dessous au cas où tu veuilles forcer un palier
          temporairement (modération, test, correction).
        </p>

        {currentGradeSlug && (
          <p className="text-[11px] text-ivory/70">
            Grade actuel :{" "}
            <span className="font-semibold text-gold-200">
              {gradeBySlug(currentGradeSlug)?.emoji}{" "}
              {gradeBySlug(currentGradeSlug)?.name ?? currentGradeSlug}
            </span>
            {currentOverride && (
              <span className="ml-1 rounded-full border border-gold-400/50 bg-gold-500/15 px-1.5 py-0.5 font-regal text-[9px] uppercase tracking-[0.22em] text-gold-200">
                override admin
              </span>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {currentOverride === "legende-vaelyndra" ? (
            <button
              type="button"
              className="rounded-full border border-rose-400/60 bg-rose-500/15 px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] text-rose-100 hover:bg-rose-500/30 disabled:opacity-40"
              onClick={handleRevokeLegend}
              disabled={loading}
            >
              <Crown className="mr-1 inline h-4 w-4" /> Retirer le statut
              Légende
            </button>
          ) : (
            <button
              type="button"
              className="rounded-full border border-gold-400/60 bg-gold-500/20 px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] text-gold-100 hover:bg-gold-500/40 disabled:opacity-40"
              onClick={handleGrantLegend}
              disabled={loading}
            >
              <Crown className="mr-1 inline h-4 w-4" /> Sacrer Légende de
              Vaelyndra
            </button>
          )}
        </div>

        <details className="text-[11px] text-ivory/60">
          <summary className="cursor-pointer text-ivory/70 hover:text-ivory">
            Forcer un autre grade (avancé)
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="glass-input"
              value={overrideDraft}
              onChange={(e) => setOverrideDraft(e.target.value)}
              disabled={loading}
            >
              <option value="">Aucun (progression XP normale)</option>
              {GRADES.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.emoji} {g.name} [{g.short}]
                  {g.adminOnly ? " — sacre manuel" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-royal"
              onClick={handleApplyManualGrade}
              disabled={loading || overrideDraft === (currentOverride ?? "")}
            >
              Appliquer
            </button>
          </div>
        </details>
      </div>

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

      {/* --- Email ------------------------------------------------------- */}
      {!isSelf && (
        <form
          onSubmit={handleEmailChange}
          className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4"
        >
          <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
            <Mail className="h-4 w-4 text-gold-300" /> Email de connexion
          </h3>
          <p className="text-[11px] text-ivory/60">
            Change l'email de {targetUsername}, marque le compte comme non
            vérifié et envoie un nouveau lien de confirmation. Le mot de passe
            n'est pas modifié.
          </p>
          <input
            className="glass-input w-full"
            type="email"
            autoComplete="off"
            placeholder="Nouvel email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            disabled={loading}
          />
          <input
            className="glass-input w-full"
            placeholder="Raison (obligatoire, loguée)"
            value={emailReason}
            onChange={(e) => setEmailReason(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="btn-gold"
            disabled={
              loading ||
              !detail ||
              emailDraft.trim().toLowerCase() ===
                (detail.email ?? "").toLowerCase()
            }
          >
            <Mail className="h-4 w-4" /> Changer l'email et envoyer la
            confirmation
          </button>
        </form>
      )}

      {/* --- Reset mot de passe ---------------------------------------- */}
      {!isSelf && (
        <form
          onSubmit={handlePasswordReset}
          className="mt-6 space-y-3 rounded-lg border border-gold-400/20 bg-royal-800/30 p-4"
        >
          <h3 className="flex items-center gap-2 font-display text-sm text-gold-200">
            <KeyRound className="h-4 w-4 text-gold-300" /> Réinitialiser le mot
            de passe
          </h3>
          <p className="text-[11px] text-ivory/60">
            Définit directement un nouveau mot de passe pour {targetUsername}.
            Utile tant que l'email transac n'est pas en place, ou pour débloquer
            un compte coincé en "mode hors-ligne". Toutes ses sessions seront
            révoquées.
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
            <ShieldOff className="h-4 w-4 text-amber-300" /> Désactiver le 2FA
            (TOTP)
          </h3>
          <p className="text-[11px] text-ivory/60">
            {targetUsername} a le 2FA activé. Si le user a perdu l'accès à son
            appli authenticator (ou que le TOTP a été activé par erreur),
            désactive-le ici pour le débloquer. Les codes de récupération seront
            aussi effacés.
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
                notify(`2FA de ${targetUsername} désactivé.`, "success");
                onChange?.();
              } catch (err) {
                notify(
                  err instanceof Error
                    ? err.message
                    : "Échec de la désactivation 2FA.",
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
              disabled={
                loading || !banReason.trim() || detail?.role === "admin"
              }
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

      {/* --- Suppression définitive ------------------------------------- */}
      {!isSelf && detail?.role !== "admin" && (
        <div className="mt-6 space-y-3 rounded-lg border-2 border-rose-500/60 bg-rose-950/40 p-4">
          <h3 className="flex items-center gap-2 font-display text-sm text-rose-100">
            <Trash2 className="h-4 w-4 text-rose-300" /> Zone dangereuse
          </h3>
          {deleted ? (
            <p className="text-xs text-rose-100/90">
              Compte supprimé. Cette section ne fait plus rien — rafraîchis la
              liste admin.
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-rose-100/80">
                Suppression <strong>définitive</strong> du compte. Purge :
                profil, credentials, sessions, tokens, posts, commentaires,
                réactions, follows, lives, messages privés, signalements posés
                par l'user et gifts. Les signalements <em>contre</em> l'user et
                le journal d'audit sont conservés. Action{" "}
                <strong>irréversible</strong>.
              </p>
              <input
                className="glass-input w-full"
                placeholder={`Tape "${targetUsername}" pour confirmer`}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                disabled={loading}
              />
              <input
                className="glass-input w-full"
                placeholder="Raison (obligatoire, loguée — ex : 'RGPD', 'doublon', 'test')"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="rounded-full border-2 border-rose-400/80 bg-rose-600/40 px-4 py-2 font-regal text-[11px] font-semibold tracking-[0.22em] text-rose-50 hover:bg-rose-600/70 disabled:opacity-40"
                onClick={handleHardDelete}
                disabled={
                  loading ||
                  deleteConfirm.trim() !== targetUsername ||
                  deleteReason.trim().length < 2
                }
              >
                <Trash2 className="mr-1 inline h-4 w-4" /> Supprimer
                définitivement
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
