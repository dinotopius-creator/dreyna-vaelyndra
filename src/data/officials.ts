/**
 * Comptes officiels Vaelyndra (miroir de `backend/app/main.py:OFFICIAL_ACCOUNTS`).
 *
 * Utilisé côté front pour deviner le rôle et la créature d'un auteur de
 * post/commentaire sans avoir à faire un round-trip par carte. Quand le
 * profil serveur est déjà chargé, préférer ses champs `role` / `creature`.
 */
export interface Official {
  id: string;
  username: string;
  role: "admin" | "animator";
  creatureId: string;
}

export const OFFICIALS: Official[] = [
  {
    id: "user-dreyna",
    username: "Dreyna",
    role: "animator",
    creatureId: "elfe",
  },
  {
    id: "user-kamestars",
    username: "Kamestars LV",
    role: "animator",
    creatureId: "fee",
  },
  {
    id: "user-roi-des-zems",
    username: "Le roi des zems💎",
    role: "admin",
    creatureId: "dragon",
  },
];

const OFFICIALS_BY_ID: Record<string, Official> = Object.fromEntries(
  OFFICIALS.map((o) => [o.id, o]),
);

/** Retourne l'official (ou null) pour un user id donné. */
export function getOfficial(userId: string | null | undefined): Official | null {
  if (!userId) return null;
  return OFFICIALS_BY_ID[userId] ?? null;
}
