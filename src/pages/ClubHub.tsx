import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BadgePlus,
  Bell,
  ChevronRight,
  LogOut,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  acceptRequest,
  canAcceptRequests,
  canManageClub,
  canManageGrades,
  canManageMembers,
  createClub,
  createGrade,
  demoteMember,
  getClubById,
  getClubBySlug,
  getClubMemberCountLabel,
  getClubMemberGrade,
  getClubStatusLabel,
  getSuggestedClubs,
  getTopClubs,
  getUserClub,
  getUserGrade,
  getUserMember,
  inviteMember,
  isClubFull,
  joinClub,
  leaveClub,
  readClubState,
  rejectRequest,
  removeMember,
  requestJoinClub,
  updateClubIdentity,
  updateMemberGrade,
  type Club,
  type ClubGrade,
  type ClubMember,
  type ClubGradePermission,
  type ClubState,
  type ClubVisibility,
} from "../lib/clubSystem";
import { formatNumber } from "../lib/helpers";

const PERMISSION_LABELS: Record<ClubGradePermission, string> = {
  manage_club: "Gerer le club",
  edit_identity: "Modifier l'identite",
  manage_members: "Gerer les membres",
  manage_grades: "Gerer les grades",
  invite_members: "Inviter",
  accept_requests: "Accepter les demandes",
  publish_announcement: "Annonce",
};

const CLUB_VISIBILITY_OPTIONS: Array<{
  value: ClubVisibility;
  label: string;
  description: string;
}> = [
  { value: "public", label: "Public", description: "Rejoignable directement." },
  { value: "request", label: "Sur demande", description: "Demande a valider." },
  { value: "private", label: "Prive", description: "Invitations uniquement." },
];

type CreateClubDraft = {
  name: string;
  description: string;
  visibility: ClubVisibility;
  imageUrl: string;
  bannerUrl: string;
  rules: string;
  announcement: string;
};

type GradeDraft = {
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: ClubGradePermission[];
};

const CREATE_CLUB_DEFAULT: CreateClubDraft = {
  name: "",
  description: "",
  visibility: "public",
  imageUrl: "",
  bannerUrl: "",
  rules: "",
  announcement: "",
};

const CREATE_GRADE_DEFAULT: GradeDraft = {
  name: "",
  color: "#c084fc",
  icon: "sparkles",
  description: "",
  permissions: ["manage_members"],
};

function useClubState() {
  const [state, setState] = useState<ClubState>(() => readClubState());

  useEffect(() => {
    const sync = () => setState(readClubState());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const save = (next: ClubState) => {
    setState(next);
    try {
      window.localStorage.setItem("vaelyndra_clubs_v1", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return { state, save };
}

function ClubAvatar({ club }: { club: Club }) {
  if (club.imageUrl) {
    return <img src={club.imageUrl} alt={club.name} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.18),transparent_30%),linear-gradient(135deg,#261046,#0e0820_55%,#2b1748)] text-3xl font-bold text-gold-100">
      {club.name.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

function ClubMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">{label}</p>
      <p className="mt-1 font-display text-2xl text-gold-100">{value}</p>
    </div>
  );
}

function ClubSectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-royal p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gold-400/20 bg-gold-500/10 text-gold-200">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-gold-100">{title}</h2>
          {subtitle && <p className="mt-1 text-sm leading-6 text-ivory/70">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ClubModal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-night-950/78 px-3 py-3 backdrop-blur-md sm:items-center sm:px-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-night-950 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-4 sm:px-6">
          <h3 className="font-display text-2xl text-gold-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-white/8 px-4 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="btn-ghost">
            Annuler
          </button>
          <button type="button" onClick={onSubmit} className="btn-gold">
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClubFormFields({
  draft,
  setDraft,
  showAnnouncement = false,
}: {
  draft: CreateClubDraft;
  setDraft: React.Dispatch<React.SetStateAction<CreateClubDraft>>;
  showAnnouncement?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Nom du club">
        <input
          value={draft.name}
          onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
          className="glass-input"
          placeholder="Ex: Lune d'Argent"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
          className="glass-input min-h-28 resize-none"
          placeholder="Decris l'ambiance du club."
        />
      </Field>
      <Field label="Visibilite">
        <div className="grid gap-2 sm:grid-cols-3">
          {CLUB_VISIBILITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, visibility: option.value }))}
              className={`rounded-[1.2rem] border p-3 text-left transition ${
                draft.visibility === option.value
                  ? "border-gold-300/55 bg-gold-500/14 text-gold-100"
                  : "border-white/10 bg-white/[0.03] text-ivory/70 hover:border-gold-300/25"
              }`}
            >
              <p className="font-semibold">{option.label}</p>
              <p className="mt-1 text-xs leading-5 text-ivory/55">{option.description}</p>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Image du club (URL)">
        <input
          value={draft.imageUrl}
          onChange={(e) => setDraft((current) => ({ ...current, imageUrl: e.target.value }))}
          className="glass-input"
          placeholder="https://..."
        />
      </Field>
      <Field label="Banniere (URL)">
        <input
          value={draft.bannerUrl}
          onChange={(e) => setDraft((current) => ({ ...current, bannerUrl: e.target.value }))}
          className="glass-input"
          placeholder="https://..."
        />
      </Field>
      <Field label="Regles">
        <textarea
          value={draft.rules}
          onChange={(e) => setDraft((current) => ({ ...current, rules: e.target.value }))}
          className="glass-input min-h-24 resize-none"
          placeholder="Respect, entraide et bonne ambiance."
        />
      </Field>
      {showAnnouncement && (
        <Field label="Annonce">
          <textarea
            value={draft.announcement}
            onChange={(e) => setDraft((current) => ({ ...current, announcement: e.target.value }))}
            className="glass-input min-h-24 resize-none"
            placeholder="Message de bienvenue ou annonce interne."
          />
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-[0.24em] text-ivory/45">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ClubHub() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { user, users } = useAuth();
  const { notify } = useToast();
  const { state, save } = useClubState();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [createDraft, setCreateDraft] = useState<CreateClubDraft>(CREATE_CLUB_DEFAULT);
  const [gradeDraft, setGradeDraft] = useState<GradeDraft>(CREATE_GRADE_DEFAULT);

  const currentClub = getUserClub(state, user?.id ?? null);
  const selectedClub = getClubById(state, clubId) ?? getClubBySlug(state, clubId);
  const visibleClub = selectedClub ?? currentClub ?? null;
  const suggestedClubs = useMemo(
    () => getSuggestedClubs(state.clubs, currentClub?.id ?? null),
    [state.clubs, currentClub?.id],
  );
  const popularClubs = useMemo(() => getTopClubs(state.clubs).slice(0, 6), [state.clubs]);
  const visibleClubs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suggestedClubs;
    return suggestedClubs.filter((club) => {
      const haystack = [club.name, club.description, club.tags.join(" "), club.ownerName]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, suggestedClubs]);

  const currentMember = currentClub ? getUserMember(currentClub, user?.id ?? null) : null;
  const currentGrade = currentClub ? getUserGrade(currentClub, user?.id ?? null) : null;
  const currentGradeLabel = currentGrade ? (currentGrade as ClubGrade).name : null;
  const currentClubFill = currentClub
    ? Math.round((currentClub.members.length / currentClub.memberLimit) * 100)
    : 0;
  const editModalTitle = visibleClub ? `Modifier ${visibleClub.name}` : "Modifier le club";

  useEffect(() => {
    if (!visibleClub && clubId) navigate("/clubs", { replace: true });
  }, [clubId, navigate, visibleClub]);

  const persist = (next: ClubState) => {
    save(next);
  };

  const handleCreateClub = () => {
    if (!user) {
      notify("Connecte-toi pour creer un club.", "info");
      navigate("/connexion");
      return;
    }
    const name = createDraft.name.trim();
    const description = createDraft.description.trim();
    if (name.length < 3 || description.length < 10) {
      notify("Nom ou description trop courts.", "error");
      return;
    }
    const next = createClub(state, {
      ownerId: user.id,
      ownerName: user.username,
      ownerHandle: user.handle ?? null,
      ownerAvatar: user.avatar,
      name,
      description,
      visibility: createDraft.visibility,
      imageUrl: createDraft.imageUrl.trim() || null,
      bannerUrl: createDraft.bannerUrl.trim() || null,
      rules: createDraft.rules.trim() || undefined,
    });
    persist(next);
    setCreateDraft(CREATE_CLUB_DEFAULT);
    setCreateOpen(false);
    const created = getUserClub(next, user.id);
    notify("Club cree avec succes.", "success");
    if (created) navigate(`/clubs/${created.slug}`);
  };

  const requestJoin = (club: Club, requestNote?: string) => {
    if (!user) return;
    const next = requestJoinClub(state, club.id, {
      userId: user.id,
      username: user.username,
      handle: user.handle ?? null,
      avatarImageUrl: user.avatar,
    }, requestNote);
    persist(next);
  };

  const handleJoin = (club: Club) => {
    if (!user) {
      navigate("/connexion");
      return;
    }
    if (club.members.some((member) => member.userId === user.id)) {
      navigate(`/clubs/${club.slug}`);
      return;
    }
    if (isClubFull(club)) {
      notify("Ce club est complet.", "error");
      return;
    }
    if (club.visibility === "private") {
      notify("Ce club est prive. Utilise une invitation.", "info");
      return;
    }
    if (club.visibility === "request") {
      requestJoin(club);
      notify("Demande envoyee.", "success");
      return;
    }
    const next = joinClub(state, club.id, {
      userId: user.id,
      username: user.username,
      handle: user.handle ?? null,
      avatarImageUrl: user.avatar,
    });
    persist(next);
    notify("Tu as rejoint le club.", "success");
    navigate(`/clubs/${club.slug}`);
  };

  const handleLeave = (club: Club) => {
    if (!user) return;
    if (club.ownerId === user.id) {
      notify("Le fondateur doit transferer la direction avant de quitter.", "info");
      return;
    }
    const next = leaveClub(state, club.id, user.id);
    persist(next);
    notify("Tu as quitte le club.", "success");
    navigate("/clubs");
  };

  const handleAccept = (club: Club, memberId: string) => {
    if (!user || !canAcceptRequests(club, user.id)) return;
    persist(acceptRequest(state, club.id, memberId));
    notify("Demande acceptee.", "success");
  };

  const handleReject = (club: Club, memberId: string) => {
    if (!user || !canAcceptRequests(club, user.id)) return;
    persist(rejectRequest(state, club.id, memberId));
    notify("Demande refusee.", "info");
  };

  const handlePromote = (club: Club, memberId: string) => {
    if (!user || !canManageMembers(club, user.id)) return;
    persist(updateMemberGrade(state, club.id, memberId, "admin"));
    notify("Membre promu.", "success");
  };

  const handleDemote = (club: Club, memberId: string) => {
    if (!user || !canManageMembers(club, user.id)) return;
    persist(demoteMember(state, club.id, memberId));
    notify("Membre retrograde.", "success");
  };

  const handleKick = (club: Club, memberId: string) => {
    if (!user || !canManageMembers(club, user.id)) return;
    if (memberId === club.ownerId) {
      notify("Impossible d'exclure le fondateur.", "error");
      return;
    }
    persist(removeMember(state, club.id, memberId));
    notify("Membre exclu.", "info");
  };

  const handleInvite = (club: Club, memberId: string) => {
    if (!user || !canManageMembers(club, user.id)) return;
    const target = users.find((candidate) => candidate.id === memberId);
    if (!target) return;
    persist(
      inviteMember(
        state,
        club.id,
        {
          userId: target.id,
          username: target.username,
          handle: target.handle ?? null,
          avatarImageUrl: target.avatar,
        },
        user.id,
      ),
    );
    notify("Invitation envoyee.", "success");
  };

  const handleCreateGrade = (club: Club) => {
    if (!user || !canManageGrades(club, user.id)) return;
    if (gradeDraft.name.trim().length < 2) {
      notify("Le nom du grade est trop court.", "error");
      return;
    }
    persist(
      createGrade(state, club.id, {
        name: gradeDraft.name,
        color: gradeDraft.color,
        icon: gradeDraft.icon,
        description: gradeDraft.description,
        permissions: gradeDraft.permissions,
      }),
    );
    setGradeDraft(CREATE_GRADE_DEFAULT);
    setGradeOpen(false);
    notify("Grade cree.", "success");
  };

  const handleEditClub = () => {
    if (!visibleClub || !user || !canManageClub(visibleClub, user.id)) return;
    persist(
      updateClubIdentity(state, visibleClub.id, {
        name: createDraft.name.trim() || visibleClub.name,
        description: createDraft.description.trim() || visibleClub.description,
        imageUrl: createDraft.imageUrl.trim() || visibleClub.imageUrl,
        bannerUrl: createDraft.bannerUrl.trim() || visibleClub.bannerUrl,
        visibility: createDraft.visibility,
        rules: createDraft.rules.trim() || visibleClub.rules,
        announcement: createDraft.announcement.trim() || visibleClub.announcement,
      }),
    );
    setEditOpen(false);
    notify("Club mis a jour.", "success");
  };

  if (visibleClub) {
    return (
      <ClubProfilePage
        club={visibleClub}
        currentMember={currentMember}
        currentGrade={currentGrade}
        currentClubFill={currentClubFill}
        memberSearch={memberSearch}
        setMemberSearch={setMemberSearch}
        inviteSearch={inviteSearch}
        setInviteSearch={setInviteSearch}
        onBack={() => navigate("/clubs")}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onAccept={handleAccept}
        onReject={handleReject}
        onPromote={handlePromote}
        onDemote={handleDemote}
        onKick={handleKick}
        onInvite={handleInvite}
        onOpenCreateGrade={() => setGradeOpen(true)}
        onOpenEdit={() => {
          setCreateDraft({
            name: visibleClub.name,
            description: visibleClub.description,
            visibility: visibleClub.visibility,
            imageUrl: visibleClub.imageUrl ?? "",
            bannerUrl: visibleClub.bannerUrl ?? "",
            rules: visibleClub.rules ?? "",
            announcement: visibleClub.announcement ?? "",
          });
          setEditOpen(true);
        }}
        canManage={user?.id ? canManageClub(visibleClub, user.id) : false}
        canMembers={user?.id ? canManageMembers(visibleClub, user.id) : false}
        canGrades={user?.id ? canManageGrades(visibleClub, user.id) : false}
        canRequests={user?.id ? canAcceptRequests(visibleClub, user.id) : false}
        users={users}
        gradeOpen={gradeOpen}
        setGradeOpen={setGradeOpen}
        gradeDraft={gradeDraft}
        setGradeDraft={setGradeDraft}
        onCreateGrade={handleCreateGrade}
      />
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      <SectionHeading
        eyebrow="Clubs"
        title={
          <>
            Un vrai hub pour <span className="text-mystic">creer et rejoindre</span> des clubs
          </>
        }
        subtitle="Clubs mobiles, suggestions, popularite, demandes, grades et gestion. Tout est stocke localement pour fonctionner sans backend club existant."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="card-royal overflow-hidden p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                Mon club
              </p>
              <h2 className="mt-1 font-display text-3xl text-gold-100">
                {currentClub ? currentClub.name : "Aucun club"}
              </h2>
            </div>
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-gold">
              <Plus className="h-4 w-4" />
              Creer un club
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ClubMetric label="Clubs publics" value={state.clubs.filter((club) => club.visibility === "public").length} />
            <ClubMetric label="Demandes" value={state.clubs.reduce((total, club) => total + club.requests.length, 0)} />
            <ClubMetric label="Membres total" value={state.clubs.reduce((total, club) => total + club.members.length, 0)} />
          </div>

          {currentClub ? (
            <div className="mt-5 rounded-[1.8rem] border border-gold-400/15 bg-night-950/55 p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.04]">
                  <ClubAvatar club={currentClub} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag">{getClubStatusLabel(currentClub)}</span>
                    <span className="tag">{getClubMemberCountLabel(currentClub)}</span>
                    {currentGradeLabel && <span className="tag">{currentGradeLabel}</span>}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ivory/75">
                    {currentClub.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/clubs/${currentClub.slug}`} className="btn-ghost">
                      Ouvrir le profil
                    </Link>
                    <button type="button" onClick={() => navigate(`/clubs/${currentClub.slug}`)} className="btn-gold">
                      Gerer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm leading-6 text-ivory/70">
                Cree ton propre club, ou rejoins une equipe suggeree pour lancer ta presence communautaire.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setCreateOpen(true)} className="btn-gold">
                  Creer mon club
                </button>
                <a href="#discover" className="btn-ghost">
                  Explorer les clubs
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="card-royal p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                Gestion rapide
              </p>
              <h2 className="mt-1 font-display text-2xl text-gold-100">
                Grades, invitations et permissions
              </h2>
            </div>
            <Shield className="h-6 w-6 text-gold-200" />
          </div>

          {currentClub ? (
            <div className="mt-5 space-y-3 text-sm text-ivory/75">
              <p>Fondateur: {currentClub.ownerName}</p>
              <p>Membres: {currentClub.members.length} / {currentClub.memberLimit}</p>
              <p>Visibilite: {getClubStatusLabel(currentClub)}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {currentGrade?.permissions.length ? (
                  currentGrade.permissions.map((perm) => (
                    <span key={perm} className="tag">
                      {PERMISSION_LABELS[perm]}
                    </span>
                  ))
                ) : (
                  <span className="tag">Aucune permission speciale</span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-ivory/70">
              Tu verras ici les permissions du club dans lequel tu entres.
            </p>
          )}
        </section>
      </div>

      <div id="discover" className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ClubSectionCard
          title="Clubs suggerees"
          subtitle="Clubs publics ou sur demande, classes par popularite et places restantes."
          icon={<Sparkles className="h-5 w-5" />}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un club"
                  className="glass-input pl-9"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateDraft(CREATE_CLUB_DEFAULT);
                  setCreateOpen(true);
                }}
                className="btn-ghost"
              >
                <BadgePlus className="h-4 w-4" />
                Creer
              </button>
            </div>
            <div className="space-y-3">
              {visibleClubs.slice(0, 6).map((club, index) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  highlight={index === 0}
                  onOpen={() => navigate(`/clubs/${club.slug}`)}
                  onJoin={() => handleJoin(club)}
                />
              ))}
              {visibleClubs.length === 0 && (
                <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-5 text-sm text-ivory/65">
                  Aucun club ne correspond a la recherche.
                </div>
              )}
            </div>
          </div>
        </ClubSectionCard>

        <ClubSectionCard
          title="Clubs populaires"
          subtitle="Les clubs les plus vivants et les plus suivis."
          icon={<Star className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {popularClubs.map((club) => (
              <button
                type="button"
                key={club.id}
                onClick={() => navigate(`/clubs/${club.slug}`)}
                className="flex w-full items-center gap-3 rounded-[1.45rem] border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-gold-300/35"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[1rem] border border-white/10">
                  <ClubAvatar club={club} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-lg text-gold-100">{club.name}</p>
                    <span className="tag">{getClubStatusLabel(club)}</span>
                  </div>
                  <p className="truncate text-xs text-ivory/55">{club.description}</p>
                  <p className="mt-1 text-xs text-ivory/45">
                    {formatNumber(club.members.length)} membres · {formatNumber(club.popularity)} popularite
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-ivory/45" />
              </button>
            ))}
          </div>
        </ClubSectionCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ClubSectionCard
          title="Mode creation"
          subtitle="Une interface propre pour donner une identite au club."
          icon={<Plus className="h-5 w-5" />}
        >
          <p className="text-sm leading-6 text-ivory/70">
            Le bouton de creation ouvre un formulaire complet pour nom, description, visibilite, image, banniere et regles.
          </p>
          <button type="button" onClick={() => setCreateOpen(true)} className="mt-4 btn-gold">
            Ouvrir la creation
          </button>
        </ClubSectionCard>

        <ClubSectionCard
          title="Gestion des membres"
          subtitle="Promotion, retrogradation, exclusion et invitations sont geres dans le profil de club."
          icon={<Users className="h-5 w-5" />}
        >
          <p className="text-sm leading-6 text-ivory/70">
            Chaque club peut monter jusqu'a 500 membres. Les permissions sont calculees localement pour eviter les boutons morts.
          </p>
          <Link to="/clubs" className="mt-4 btn-ghost">
            Voir mes clubs
          </Link>
        </ClubSectionCard>
      </div>

      {createOpen && (
        <ClubModal
          title="Creer un club"
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateClub}
          submitLabel="Creer"
        >
          <ClubFormFields draft={createDraft} setDraft={setCreateDraft} />
        </ClubModal>
      )}

      {editOpen && visibleClub && (
        <ClubModal
          title={editModalTitle}
          onClose={() => setEditOpen(false)}
          onSubmit={handleEditClub}
          submitLabel="Enregistrer"
        >
          <ClubFormFields draft={createDraft} setDraft={setCreateDraft} showAnnouncement />
        </ClubModal>
      )}

      {gradeOpen && visibleClub && (
        <ClubModal
          title="Nouveau grade"
          onClose={() => setGradeOpen(false)}
          onSubmit={() => handleCreateGrade(visibleClub)}
          submitLabel="Creer le grade"
        >
          <div className="space-y-4">
            <Field label="Nom du grade">
              <input
                value={gradeDraft.name}
                onChange={(e) => setGradeDraft((current) => ({ ...current, name: e.target.value }))}
                className="glass-input"
                placeholder="Ex: Strategiste"
              />
            </Field>
            <Field label="Couleur">
              <input
                value={gradeDraft.color}
                onChange={(e) => setGradeDraft((current) => ({ ...current, color: e.target.value }))}
                className="glass-input"
                placeholder="#c084fc"
              />
            </Field>
            <Field label="Icone">
              <input
                value={gradeDraft.icon}
                onChange={(e) => setGradeDraft((current) => ({ ...current, icon: e.target.value }))}
                className="glass-input"
                placeholder="sparkles"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={gradeDraft.description}
                onChange={(e) => setGradeDraft((current) => ({ ...current, description: e.target.value }))}
                className="glass-input min-h-24 resize-none"
                placeholder="Explique le role du grade."
              />
            </Field>
            <Field label="Permissions">
              <div className="flex flex-wrap gap-2">
                {Object.entries(PERMISSION_LABELS).map(([perm, label]) => {
                  const currentPerm = perm as ClubGradePermission;
                  const active = gradeDraft.permissions.includes(currentPerm);
                  return (
                    <button
                      key={perm}
                      type="button"
                      onClick={() =>
                        setGradeDraft((current) => ({
                          ...current,
                          permissions: active
                            ? current.permissions.filter((item) => item !== currentPerm)
                            : [...current.permissions, currentPerm],
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-gold-300/55 bg-gold-500/15 text-gold-100"
                          : "border-white/10 bg-white/[0.04] text-ivory/70"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </ClubModal>
      )}
    </div>
  );
}

function ClubCard({
  club,
  onOpen,
  onJoin,
  highlight,
}: {
  club: Club;
  onOpen: () => void;
  onJoin: () => void;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-[1.8rem] border bg-night-950/45 p-4 transition ${
        highlight
          ? "border-gold-300/35 shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
          : "border-white/10 hover:border-gold-300/25"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[1.15rem] border border-white/10">
          <ClubAvatar club={club} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-xl text-gold-100">{club.name}</h3>
            <span className="tag">{getClubStatusLabel(club)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-ivory/72">{club.description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="tag">{getClubMemberCountLabel(club)}</span>
            {club.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onOpen} className="btn-ghost">
          Ouvrir
        </button>
        <button
          type="button"
          onClick={onJoin}
          disabled={isClubFull(club)}
          className="btn-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isClubFull(club) ? "Complet" : club.visibility === "request" ? "Demander" : "Rejoindre"}
        </button>
      </div>
    </article>
  );
}

function ClubProfilePage({
  club,
  currentMember,
  currentGrade,
  currentClubFill,
  memberSearch,
  setMemberSearch,
  inviteSearch,
  setInviteSearch,
  onBack,
  onJoin,
  onLeave,
  onAccept,
  onReject,
  onPromote,
  onDemote,
  onKick,
  onInvite,
  onOpenCreateGrade,
  onOpenEdit,
  onCreateGrade,
  canManage,
  canMembers,
  canGrades,
  canRequests,
  users,
  gradeOpen,
  setGradeOpen,
  gradeDraft,
  setGradeDraft,
}: {
  club: Club;
  currentMember: ClubMember | null;
  currentGrade: ClubGrade | null;
  currentClubFill: number;
  memberSearch: string;
  setMemberSearch: (value: string) => void;
  inviteSearch: string;
  setInviteSearch: (value: string) => void;
  onBack: () => void;
  onJoin: (club: Club) => void;
  onLeave: (club: Club) => void;
  onAccept: (club: Club, memberId: string) => void;
  onReject: (club: Club, memberId: string) => void;
  onPromote: (club: Club, memberId: string) => void;
  onDemote: (club: Club, memberId: string) => void;
  onKick: (club: Club, memberId: string) => void;
  onInvite: (club: Club, memberId: string) => void;
  onOpenCreateGrade: () => void;
  onOpenEdit: () => void;
  onCreateGrade: (club: Club) => void;
  canManage: boolean;
  canMembers: boolean;
  canGrades: boolean;
  canRequests: boolean;
  users: ReturnType<typeof useAuth>["users"];
  gradeOpen: boolean;
  setGradeOpen: (value: boolean) => void;
  gradeDraft: GradeDraft;
  setGradeDraft: React.Dispatch<React.SetStateAction<GradeDraft>>;
}) {
  const memberIsHere = Boolean(currentMember);
  const currentGradeLabel = currentGrade ? currentGrade.name : null;
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return club.members;
    return club.members.filter((member) =>
      [member.username, member.handle, member.role, member.gradeId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [club.members, memberSearch]);
  return (
    <div className="mx-auto min-h-[100dvh] max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-ghost">
          <ChevronRight className="h-4 w-4 rotate-180" />
          Retour
        </button>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <button type="button" onClick={onOpenEdit} className="btn-gold">
              <Pencil className="h-4 w-4" />
              Modifier
            </button>
          )}
          {memberIsHere ? (
            <button type="button" onClick={() => onLeave(club)} className="btn-ghost">
              <LogOut className="h-4 w-4" />
              Quitter
            </button>
          ) : (
            <button type="button" onClick={() => onJoin(club)} className="btn-gold">
              <Plus className="h-4 w-4" />
              Rejoindre
            </button>
          )}
        </div>
      </div>

      <section className="card-royal overflow-hidden">
        <div className="relative h-48 sm:h-64">
          {club.bannerUrl ? (
            <img src={club.bannerUrl} alt={`${club.name} banner`} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(135deg,#261046,#0f0a1f_55%,#2b1748)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="h-24 w-24 overflow-hidden rounded-[1.6rem] border border-white/10 bg-night-950/55 shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
                <ClubAvatar club={club} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag">{getClubStatusLabel(club)}</span>
                  <span className="tag">{getClubMemberCountLabel(club)}</span>
                  {currentGradeLabel && <span className="tag">{currentGradeLabel}</span>}
                </div>
                <h1 className="mt-3 font-display text-4xl text-gold-100 sm:text-5xl">
                  {club.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/75">
                  {club.description}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <ClubMetric label="Membres" value={`${club.members.length} / ${club.memberLimit}`} />
              <ClubMetric label="Popularite" value={formatNumber(club.popularity)} />
              <ClubMetric label="Remplissage" value={`${currentClubFill}%`} />
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">Annonce</p>
              <p className="mt-2 text-sm leading-6 text-ivory/75">
                {club.announcement || "Aucune annonce pour le moment."}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">Regles</p>
              <p className="mt-2 text-sm leading-6 text-ivory/75">
                {club.rules || "Respect, entraide et bonne ambiance."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {club.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-white/10 bg-night-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                  Grades du club
                </p>
                <h2 className="mt-1 font-display text-2xl text-gold-100">
                  {club.grades.length} grades
                </h2>
              </div>
              {canGrades && (
                <button type="button" onClick={onOpenCreateGrade} className="btn-gold">
                  <BadgePlus className="h-4 w-4" />
                  Nouveau grade
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {(club.grades as ClubGrade[]).map((grade: ClubGrade) => (
                <div key={grade.id} className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold" style={{ color: grade.color }}>
                      {grade.name}
                    </p>
                    <span className="text-xs text-ivory/45">{grade.permissions.length} permissions</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ivory/55">{grade.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ClubSectionCard
          title="Membres"
          subtitle="Promouvoir, retrograder, exclure et inviter selon les permissions."
          icon={<Users className="h-5 w-5" />}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Rechercher un membre"
              className="glass-input pl-9"
            />
          </div>
          <div className="mt-4 space-y-2">
            {filteredMembers.map((member) => {
              const memberGrade = getClubMemberGrade(club, member);
              return (
                <div key={member.userId} className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-3">
                    <AvatarImage
                      candidates={[member.avatarImageUrl]}
                      fallbackSeed={member.userId}
                      alt={member.username}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-gold-100">{member.username}</p>
                        {member.role === "founder" && <span className="tag">Fondateur</span>}
                        <span className="tag">{memberGrade?.name ?? member.role}</span>
                      </div>
                      <p className="truncate text-xs text-ivory/55">
                        {member.handle ? `@${member.handle}` : "Sans handle"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="tag">Arrivee: {new Date(member.joinedAt).toLocaleDateString("fr-FR")}</span>
                    <span className="tag">Actif: {new Date(member.lastActiveAt).toLocaleDateString("fr-FR")}</span>
                    {canMembers && member.userId !== club.ownerId && (
                      <>
                        <button type="button" onClick={() => onPromote(club, member.userId)} className="btn-ghost">
                          Promouvoir
                        </button>
                        <button type="button" onClick={() => onDemote(club, member.userId)} className="btn-ghost">
                          Retrograder
                        </button>
                        <button type="button" onClick={() => onKick(club, member.userId)} className="btn-gold">
                          Exclure
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ClubSectionCard>

        <div className="space-y-4">
          <ClubSectionCard
            title="Demandes"
            subtitle="Accepte les demandes ou refuse-les."
            icon={<Bell className="h-5 w-5" />}
          >
            <div className="space-y-2">
              {club.requests.length === 0 ? (
                <p className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-ivory/65">
                  Aucune demande en attente.
                </p>
              ) : (
                club.requests.map((request) => (
                  <div key={request.userId} className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-3">
                      <AvatarImage
                        candidates={[request.avatarImageUrl]}
                        fallbackSeed={request.userId}
                        alt={request.username}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gold-100">{request.username}</p>
                        <p className="truncate text-xs text-ivory/55">{request.note || "Demande de rejoindre le club"}</p>
                      </div>
                    </div>
                    {canRequests && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => onAccept(club, request.userId)} className="btn-gold">
                          Accepter
                        </button>
                        <button type="button" onClick={() => onReject(club, request.userId)} className="btn-ghost">
                          Refuser
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ClubSectionCard>

          <ClubSectionCard
            title="Invitations"
            subtitle="Invite des membres actifs de la plateforme."
            icon={<BadgePlus className="h-5 w-5" />}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory/40" />
              <input
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Rechercher un membre a inviter"
                className="glass-input pl-9"
              />
            </div>
            <div className="mt-3 space-y-2">
              {users
                .filter((candidate) => !club.members.some((member) => member.userId === candidate.id))
                .filter((candidate) => {
                  const query = inviteSearch.trim().toLowerCase();
                  if (!query) return true;
                  return [candidate.username, candidate.handle ?? "", candidate.email].join(" ").toLowerCase().includes(query);
                })
                .slice(0, 5)
                .map((candidate) => (
                  <div key={candidate.id} className="flex items-center gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-3">
                    <AvatarImage
                      candidates={[candidate.avatar]}
                      fallbackSeed={candidate.id}
                      alt={candidate.username}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gold-100">{candidate.username}</p>
                      <p className="truncate text-xs text-ivory/55">
                        {candidate.handle ? `@${candidate.handle}` : candidate.email}
                      </p>
                    </div>
                    {canMembers && (
                      <button type="button" onClick={() => onInvite(club, candidate.id)} className="btn-ghost">
                        Inviter
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </ClubSectionCard>

          <ClubSectionCard
            title="Acces rapides"
            subtitle="Les raccourcis Club gardent la page mobile claire."
            icon={<Sparkles className="h-5 w-5" />}
          >
            <div className="flex flex-wrap gap-2">
              <Link to="/social/play" className="btn-ghost">
                Social
              </Link>
              <Link to="/live" className="btn-ghost">
                Live
              </Link>
              <Link to="/mondes" className="btn-ghost">
                Monde
              </Link>
              <Link to="/avatar" className="btn-ghost">
                Avatar
              </Link>
              <Link to="/familier" className="btn-ghost">
                Familier
              </Link>
            </div>
          </ClubSectionCard>
        </div>
      </div>

      {gradeOpen && (
        <ClubModal
          title="Nouveau grade"
          onClose={() => setGradeOpen(false)}
          onSubmit={() => onCreateGrade(club)}
          submitLabel="Creer le grade"
        >
          <div className="space-y-4">
            <Field label="Nom du grade">
              <input
                value={gradeDraft.name}
                onChange={(e) => setGradeDraft((current) => ({ ...current, name: e.target.value }))}
                className="glass-input"
                placeholder="Ex: Strategiste"
              />
            </Field>
            <Field label="Couleur">
              <input
                value={gradeDraft.color}
                onChange={(e) => setGradeDraft((current) => ({ ...current, color: e.target.value }))}
                className="glass-input"
                placeholder="#c084fc"
              />
            </Field>
            <Field label="Icone">
              <input
                value={gradeDraft.icon}
                onChange={(e) => setGradeDraft((current) => ({ ...current, icon: e.target.value }))}
                className="glass-input"
                placeholder="sparkles"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={gradeDraft.description}
                onChange={(e) => setGradeDraft((current) => ({ ...current, description: e.target.value }))}
                className="glass-input min-h-24 resize-none"
                placeholder="Explique le role du grade."
              />
            </Field>
            <Field label="Permissions">
              <div className="flex flex-wrap gap-2">
                {Object.entries(PERMISSION_LABELS).map(([perm, label]) => {
                  const currentPerm = perm as ClubGradePermission;
                  const active = gradeDraft.permissions.includes(currentPerm);
                  return (
                    <button
                      key={perm}
                      type="button"
                      onClick={() =>
                        setGradeDraft((current) => ({
                          ...current,
                          permissions: active
                            ? current.permissions.filter((item) => item !== currentPerm)
                            : [...current.permissions, currentPerm],
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-gold-300/55 bg-gold-500/15 text-gold-100"
                          : "border-white/10 bg-white/[0.04] text-ivory/70"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </ClubModal>
      )}
    </div>
  );
}
