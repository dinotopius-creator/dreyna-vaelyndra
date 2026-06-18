import { formatNumber } from "./helpers";

export type ClubVisibility = "public" | "request" | "private";

export type ClubGradePermission =
  | "manage_club"
  | "edit_identity"
  | "manage_members"
  | "manage_grades"
  | "invite_members"
  | "accept_requests"
  | "publish_announcement";

export type ClubGrade = {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  permissions: ClubGradePermission[];
  description: string;
};

export type ClubMemberRole = "founder" | "admin" | "moderator" | "member";

export type ClubMember = {
  userId: string;
  username: string;
  handle: string | null;
  avatarImageUrl: string;
  joinedAt: string;
  role: ClubMemberRole;
  gradeId: string;
  lastActiveAt: string;
};

export type ClubJoinRequest = {
  userId: string;
  username: string;
  handle: string | null;
  avatarImageUrl: string;
  requestedAt: string;
  note?: string;
};

export type ClubInvitation = {
  userId: string;
  username: string;
  handle: string | null;
  avatarImageUrl: string;
  invitedAt: string;
  sentBy: string;
};

export type Club = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  bannerUrl: string | null;
  visibility: ClubVisibility;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
  createdAt: string;
  updatedAt: string;
  popularity: number;
  tags: string[];
  memberLimit: number;
  announcement?: string;
  rules?: string;
  grades: ClubGrade[];
  members: ClubMember[];
  requests: ClubJoinRequest[];
  invitations: ClubInvitation[];
};

export type ClubState = {
  currentClubId: string | null;
  clubs: Club[];
};

const STORAGE_KEY = "vaelyndra_clubs_v1";

const DEFAULT_GRADES: ClubGrade[] = [
  {
    id: "founder",
    name: "Fondateur",
    color: "#f7c96b",
    icon: "crown",
    order: 100,
    permissions: [
      "manage_club",
      "edit_identity",
      "manage_members",
      "manage_grades",
      "invite_members",
      "accept_requests",
      "publish_announcement",
    ],
    description: "Contrôle total du club.",
  },
  {
    id: "admin",
    name: "Administrateur",
    color: "#c084fc",
    icon: "shield",
    order: 80,
    permissions: [
      "manage_members",
      "manage_grades",
      "invite_members",
      "accept_requests",
      "publish_announcement",
    ],
    description: "Gere la vie du club.",
  },
  {
    id: "moderator",
    name: "Modérateur",
    color: "#5dd6ff",
    icon: "sparkles",
    order: 60,
    permissions: ["manage_members", "invite_members", "accept_requests"],
    description: "Anime et modere les membres.",
  },
  {
    id: "member",
    name: "Membre",
    color: "#9ca3af",
    icon: "heart",
    order: 10,
    permissions: [],
    description: "Membre standard du club.",
  },
];

const DEFAULT_CLUBS: Club[] = [
  {
    id: "club-lune-dargent",
    slug: "lune-dargent",
    name: "Lune d'Argent",
    description:
      "Un club calme et stylé pour les joueurs qui aiment les avatars premium, les lives doux et les belles tenues.",
    imageUrl: null,
    bannerUrl: null,
    visibility: "public",
    ownerId: "user-lyria",
    ownerName: "Lyria",
    ownerAvatar: "https://i.pravatar.cc/200?u=club-lune-dargent",
    createdAt: "2026-05-01T18:00:00Z",
    updatedAt: "2026-06-18T20:00:00Z",
    popularity: 9821,
    tags: ["avatar", "style", "lune"],
    memberLimit: 500,
    announcement: "Bienvenue aux nouveaux membres. On partage nos looks et nos lives favoris.",
    rules: "Respect, style et entraide.",
    grades: DEFAULT_GRADES,
    members: [
      {
        userId: "user-lyria",
        username: "Lyria",
        handle: "lyria",
        avatarImageUrl: "https://i.pravatar.cc/200?u=lyria",
        joinedAt: "2026-05-01T18:00:00Z",
        role: "founder",
        gradeId: "founder",
        lastActiveAt: "2026-06-19T21:50:00Z",
      },
      {
        userId: "user-caelum",
        username: "Caelum",
        handle: "caelum",
        avatarImageUrl: "https://i.pravatar.cc/200?u=caelum",
        joinedAt: "2026-05-03T11:20:00Z",
        role: "moderator",
        gradeId: "moderator",
        lastActiveAt: "2026-06-19T21:10:00Z",
      },
      {
        userId: "user-roi-des-zems",
        username: "Le roi des zems💎",
        handle: "roi",
        avatarImageUrl: "https://i.pravatar.cc/200?u=roi-des-zems",
        joinedAt: "2026-05-04T09:00:00Z",
        role: "admin",
        gradeId: "admin",
        lastActiveAt: "2026-06-19T21:35:00Z",
      },
    ],
    requests: [],
    invitations: [],
  },
  {
    id: "club-atelier-neon",
    slug: "atelier-neon",
    name: "Atelier Neon",
    description:
      "Club créatif pour partager avatars, harmonies de couleurs et captures de live.",
    imageUrl: null,
    bannerUrl: null,
    visibility: "request",
    ownerId: "user-caelum",
    ownerName: "Caelum",
    ownerAvatar: "https://i.pravatar.cc/200?u=club-atelier-neon",
    createdAt: "2026-05-12T19:30:00Z",
    updatedAt: "2026-06-19T18:20:00Z",
    popularity: 7321,
    tags: ["create", "avatar", "neon"],
    memberLimit: 500,
    announcement: "Les demandes sont validées chaque soir par l'equipe du club.",
    rules: "Montre ton style et reste bienveillant.",
    grades: DEFAULT_GRADES,
    members: [
      {
        userId: "user-caelum",
        username: "Caelum",
        handle: "caelum",
        avatarImageUrl: "https://i.pravatar.cc/200?u=caelum",
        joinedAt: "2026-05-12T19:30:00Z",
        role: "founder",
        gradeId: "founder",
        lastActiveAt: "2026-06-19T18:20:00Z",
      },
      {
        userId: "user-lyria",
        username: "Lyria",
        handle: "lyria",
        avatarImageUrl: "https://i.pravatar.cc/200?u=lyria",
        joinedAt: "2026-05-14T08:10:00Z",
        role: "admin",
        gradeId: "admin",
        lastActiveAt: "2026-06-19T20:01:00Z",
      },
    ],
    requests: [],
    invitations: [],
  },
  {
    id: "club-monde-vivant",
    slug: "monde-vivant",
    name: "Monde Vivant",
    description:
      "Club très actif autour des Mondes, des lives et des événements communautaires.",
    imageUrl: null,
    bannerUrl: null,
    visibility: "public",
    ownerId: "user-dreyna",
    ownerName: "Dreyna",
    ownerAvatar: "https://i.pravatar.cc/200?u=dreyna",
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-06-19T19:20:00Z",
    popularity: 15550,
    tags: ["live", "monde", "event"],
    memberLimit: 500,
    announcement: "On organise souvent des sorties Live et Monde.",
    rules: "Pas de spam, on garde l'espace premium.",
    grades: DEFAULT_GRADES,
    members: [
      {
        userId: "user-dreyna",
        username: "Dreyna",
        handle: "dreyna",
        avatarImageUrl: "https://i.pravatar.cc/200?u=dreyna",
        joinedAt: "2026-05-20T10:00:00Z",
        role: "founder",
        gradeId: "founder",
        lastActiveAt: "2026-06-19T19:20:00Z",
      },
      {
        userId: "user-lyria",
        username: "Lyria",
        handle: "lyria",
        avatarImageUrl: "https://i.pravatar.cc/200?u=lyria",
        joinedAt: "2026-05-22T12:35:00Z",
        role: "moderator",
        gradeId: "moderator",
        lastActiveAt: "2026-06-19T20:22:00Z",
      },
      {
        userId: "user-caelum",
        username: "Caelum",
        handle: "caelum",
        avatarImageUrl: "https://i.pravatar.cc/200?u=caelum",
        joinedAt: "2026-05-24T15:42:00Z",
        role: "admin",
        gradeId: "admin",
        lastActiveAt: "2026-06-19T20:48:00Z",
      },
    ],
    requests: [],
    invitations: [],
  },
  {
    id: "club-les-sylvains",
    slug: "les-sylvains",
    name: "Les Sylvains",
    description:
      "Communauté douce pour les familiers, les tenues sylvaines et les discussions calme.",
    imageUrl: null,
    bannerUrl: null,
    visibility: "public",
    ownerId: "user-lyria",
    ownerName: "Lyria",
    ownerAvatar: "https://i.pravatar.cc/200?u=sylvains",
    createdAt: "2026-05-28T09:45:00Z",
    updatedAt: "2026-06-18T23:20:00Z",
    popularity: 6114,
    tags: ["familier", "style", "douceur"],
    memberLimit: 500,
    announcement: "On organise des conseils style et des échanges sur les familiers.",
    rules: "Bienveillance et aide aux nouveaux.",
    grades: DEFAULT_GRADES,
    members: [
      {
        userId: "user-lyria",
        username: "Lyria",
        handle: "lyria",
        avatarImageUrl: "https://i.pravatar.cc/200?u=lyria",
        joinedAt: "2026-05-28T09:45:00Z",
        role: "founder",
        gradeId: "founder",
        lastActiveAt: "2026-06-19T18:00:00Z",
      },
      {
        userId: "user-roi-des-zems",
        username: "Le roi des zems💎",
        handle: "roi",
        avatarImageUrl: "https://i.pravatar.cc/200?u=roi-des-zems",
        joinedAt: "2026-05-30T08:05:00Z",
        role: "member",
        gradeId: "member",
        lastActiveAt: "2026-06-19T19:33:00Z",
      },
    ],
    requests: [],
    invitations: [],
  },
];

function makeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function safeParseState(raw: string | null): ClubState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ClubState>;
    if (!Array.isArray(parsed.clubs)) return null;
    return {
      currentClubId:
        typeof parsed.currentClubId === "string" ? parsed.currentClubId : null,
      clubs: parsed.clubs as Club[],
    };
  } catch {
    return null;
  }
}

export function readClubState(): ClubState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParseState(raw);
    if (parsed) return normalizeState(parsed);
  } catch {
    /* ignore */
  }
  return normalizeState({ currentClubId: null, clubs: DEFAULT_CLUBS });
}

export function writeClubState(state: ClubState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  } catch {
    /* ignore */
  }
}

export function normalizeState(state: ClubState): ClubState {
  const clubs = state.clubs.map((club) => normalizeClub(club));
  return {
    currentClubId: clubs.some((club) => club.id === state.currentClubId)
      ? state.currentClubId
      : null,
    clubs,
  };
}

export function normalizeClub(club: Club): Club {
  const grades = [...club.grades].sort((a, b) => b.order - a.order);
  const members = [...club.members].sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );
  return {
    ...club,
    slug: club.slug || makeSlug(club.name),
    memberLimit: Math.min(Math.max(club.memberLimit || 500, 50), 500),
    grades: grades.length > 0 ? grades : DEFAULT_GRADES,
    members,
    requests: [...club.requests],
    invitations: [...club.invitations],
    tags: club.tags ?? [],
  };
}

export function getClubById(state: ClubState, clubId: string | null | undefined) {
  if (!clubId) return null;
  return state.clubs.find((club) => club.id === clubId) ?? null;
}

export function getClubBySlug(state: ClubState, slug: string | null | undefined) {
  if (!slug) return null;
  const normalized = makeSlug(slug);
  return (
    state.clubs.find((club) => club.slug === normalized) ?? null
  );
}

export function getUserClub(state: ClubState, userId: string | null | undefined) {
  if (!userId) return null;
  return (
    state.clubs.find((club) => club.members.some((member) => member.userId === userId)) ??
    null
  );
}

export function getUserMember(club: Club, userId: string | null | undefined) {
  if (!userId) return null;
  return club.members.find((member) => member.userId === userId) ?? null;
}

export function getUserGrade(club: Club, userId: string | null | undefined) {
  const member = getUserMember(club, userId);
  if (!member) return null;
  return club.grades.find((grade) => grade.id === member.gradeId) ?? null;
}

export function hasPermission(
  club: Club,
  userId: string | null | undefined,
  permission: ClubGradePermission,
) {
  const grade = getUserGrade(club, userId);
  return Boolean(grade?.permissions.includes(permission));
}

export function canManageClub(club: Club, userId: string | null | undefined) {
  return hasPermission(club, userId, "manage_club") || hasPermission(club, userId, "edit_identity");
}

export function canManageMembers(club: Club, userId: string | null | undefined) {
  return hasPermission(club, userId, "manage_members");
}

export function canManageGrades(club: Club, userId: string | null | undefined) {
  return hasPermission(club, userId, "manage_grades");
}

export function canAcceptRequests(club: Club, userId: string | null | undefined) {
  return hasPermission(club, userId, "accept_requests");
}

export function isClubFull(club: Club) {
  return club.members.length >= club.memberLimit;
}

export function createClub(
  state: ClubState,
  input: {
    ownerId: string;
    ownerName: string;
    ownerHandle: string | null;
    ownerAvatar: string;
    name: string;
    description: string;
    visibility: ClubVisibility;
    imageUrl: string | null;
    bannerUrl: string | null;
    rules?: string;
  },
): ClubState {
  const name = input.name.trim();
  const description = input.description.trim();
  const slug = makeSlug(name);
  const id = `club-${slug}-${Date.now()}`;
  const now = new Date().toISOString();
  const founder: ClubMember = {
    userId: input.ownerId,
    username: input.ownerName,
    handle: input.ownerHandle,
    avatarImageUrl: input.ownerAvatar,
    joinedAt: now,
    role: "founder",
    gradeId: "founder",
    lastActiveAt: now,
  };
  const club: Club = normalizeClub({
    id,
    slug,
    name,
    description,
    imageUrl: input.imageUrl,
    bannerUrl: input.bannerUrl,
    visibility: input.visibility,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    ownerAvatar: input.ownerAvatar,
    createdAt: now,
    updatedAt: now,
    popularity: 1200,
    tags: [slug, "club"],
    memberLimit: 500,
    announcement: "Club créé récemment. Les premières places sont ouvertes.",
    rules: input.rules || "Respect, style et entraide.",
    grades: DEFAULT_GRADES,
    members: [founder],
    requests: [],
    invitations: [],
  });
  return normalizeState({
    currentClubId: club.id,
    clubs: [club, ...state.clubs],
  });
}

export function joinClub(
  state: ClubState,
  clubId: string,
  user: {
    userId: string;
    username: string;
    handle: string | null;
    avatarImageUrl: string;
  },
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (club.members.some((member) => member.userId === user.userId)) return club;
    if (isClubFull(club)) return club;
    const member: ClubMember = {
      userId: user.userId,
      username: user.username,
      handle: user.handle,
      avatarImageUrl: user.avatarImageUrl,
      joinedAt: now,
      role: "member",
      gradeId: "member",
      lastActiveAt: now,
    };
    return {
      ...club,
      updatedAt: now,
      popularity: club.popularity + 35,
      members: [member, ...club.members],
      requests: club.requests.filter((request) => request.userId !== user.userId),
      invitations: club.invitations.filter((inv) => inv.userId !== user.userId),
    };
  });
  return normalizeState({ currentClubId: clubId, clubs });
}

export function requestJoinClub(
  state: ClubState,
  clubId: string,
  user: {
    userId: string;
    username: string;
    handle: string | null;
    avatarImageUrl: string;
  },
  note?: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (club.members.some((member) => member.userId === user.userId)) return club;
    if (club.requests.some((request) => request.userId === user.userId)) return club;
    return {
      ...club,
      updatedAt: now,
      requests: [
        { userId: user.userId, username: user.username, handle: user.handle, avatarImageUrl: user.avatarImageUrl, requestedAt: now, note },
        ...club.requests,
      ],
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function leaveClub(
  state: ClubState,
  clubId: string,
  userId: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (club.ownerId === userId) return club;
    return {
      ...club,
      updatedAt: now,
      popularity: Math.max(0, club.popularity - 10),
      members: club.members.filter((member) => member.userId !== userId),
      requests: club.requests.filter((request) => request.userId !== userId),
      invitations: club.invitations.filter((inv) => inv.userId !== userId),
    };
  });
  return normalizeState({
    currentClubId: state.currentClubId === clubId ? null : state.currentClubId,
    clubs,
  });
}

export function updateClubIdentity(
  state: ClubState,
  clubId: string,
  patch: Partial<Pick<Club, "name" | "description" | "imageUrl" | "bannerUrl" | "visibility" | "rules" | "announcement">>,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    const nextName = patch.name?.trim() || club.name;
    return normalizeClub({
      ...club,
      name: nextName,
      slug: makeSlug(nextName),
      description: patch.description?.trim() ?? club.description,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : club.imageUrl,
      bannerUrl: patch.bannerUrl !== undefined ? patch.bannerUrl : club.bannerUrl,
      visibility: patch.visibility ?? club.visibility,
      rules: patch.rules !== undefined ? patch.rules : club.rules,
      announcement:
        patch.announcement !== undefined ? patch.announcement : club.announcement,
      updatedAt: now,
    });
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function acceptRequest(
  state: ClubState,
  clubId: string,
  userId: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    const request = club.requests.find((item) => item.userId === userId);
    if (!request || isClubFull(club)) return club;
    const nextMember: ClubMember = {
      userId: request.userId,
      username: request.username,
      handle: request.handle,
      avatarImageUrl: request.avatarImageUrl,
      joinedAt: now,
      role: "member",
      gradeId: "member",
      lastActiveAt: now,
    };
    return {
      ...club,
      updatedAt: now,
      popularity: club.popularity + 15,
      requests: club.requests.filter((item) => item.userId !== userId),
      members: [nextMember, ...club.members],
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function rejectRequest(
  state: ClubState,
  clubId: string,
  userId: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    return {
      ...club,
      updatedAt: now,
      requests: club.requests.filter((item) => item.userId !== userId),
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function inviteMember(
  state: ClubState,
  clubId: string,
  member: {
    userId: string;
    username: string;
    handle: string | null;
    avatarImageUrl: string;
  },
  invitedBy: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (club.invitations.some((inv) => inv.userId === member.userId)) return club;
    return {
      ...club,
      updatedAt: now,
      invitations: [
        {
          ...member,
          invitedAt: now,
          sentBy: invitedBy,
        },
        ...club.invitations,
      ],
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function removeMember(
  state: ClubState,
  clubId: string,
  memberId: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (memberId === club.ownerId) return club;
    return {
      ...club,
      updatedAt: now,
      members: club.members.filter((member) => member.userId !== memberId),
      requests: club.requests.filter((request) => request.userId !== memberId),
      invitations: club.invitations.filter((inv) => inv.userId !== memberId),
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function updateMemberGrade(
  state: ClubState,
  clubId: string,
  memberId: string,
  gradeId: string,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    if (!club.grades.some((grade) => grade.id === gradeId)) return club;
    return {
      ...club,
      updatedAt: now,
      members: club.members.map((member) =>
        member.userId === memberId
          ? {
              ...member,
              gradeId,
              role: (member.role === "founder" ? "founder" : "member") as ClubMemberRole,
              lastActiveAt: now,
            }
          : member,
      ),
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function updateMemberRole(
  state: ClubState,
  clubId: string,
  memberId: string,
  role: ClubMemberRole,
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    return {
      ...club,
      updatedAt: now,
      members: club.members.map((member) =>
        member.userId === memberId
          ? {
              ...member,
              role: role as ClubMemberRole,
              gradeId: role === "founder" ? "founder" : role,
              lastActiveAt: now,
            }
          : member,
      ),
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function promoteMember(
  state: ClubState,
  clubId: string,
  memberId: string,
): ClubState {
  return updateMemberRole(state, clubId, memberId, "admin");
}

export function demoteMember(
  state: ClubState,
  clubId: string,
  memberId: string,
): ClubState {
  return updateMemberRole(state, clubId, memberId, "member");
}

export function createGrade(
  state: ClubState,
  clubId: string,
  input: {
    name: string;
    color: string;
    icon: string;
    permissions: ClubGradePermission[];
    description: string;
  },
): ClubState {
  const now = new Date().toISOString();
  const clubs = state.clubs.map((club) => {
    if (club.id !== clubId) return club;
    const newGrade: ClubGrade = {
      id: `grade-${makeSlug(input.name)}-${Date.now()}`,
      name: input.name.trim(),
      color: input.color,
      icon: input.icon,
      order: Math.max(...club.grades.map((grade) => grade.order), 0) + 5,
      permissions: input.permissions,
      description: input.description.trim(),
    };
    return {
      ...club,
      updatedAt: now,
      grades: [newGrade, ...club.grades],
    };
  });
  return normalizeState({ currentClubId: state.currentClubId, clubs });
}

export function getClubMemberCountLabel(club: Club) {
  return `${formatNumber(club.members.length)} / ${formatNumber(club.memberLimit)} membres`;
}

export function getClubStatusLabel(club: Club) {
  if (club.visibility === "public") return "Public";
  if (club.visibility === "request") return "Sur demande";
  return "Prive";
}

export function getTopClubs(clubs: Club[]) {
  return [...clubs].sort(
    (a, b) =>
      b.popularity - a.popularity ||
      b.members.length - a.members.length ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getSuggestedClubs(clubs: Club[], userClubId: string | null) {
  return getTopClubs(clubs).filter(
    (club) =>
      club.id !== userClubId &&
      club.visibility !== "private" &&
      !isClubFull(club),
  );
}

export function getClubMemberGrade(club: Club, member: ClubMember) {
  return club.grades.find((grade) => grade.id === member.gradeId) ?? club.grades.find((grade) => grade.id === "member") ?? null;
}
