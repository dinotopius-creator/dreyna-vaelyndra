import { useEffect, useState } from "react";
import {
  apiGetCommunityActivityLeaderboard,
  type CommunityActivityEntryDto,
} from "../lib/api";

export type HomeCommunityMember = {
  id: string;
  name: string;
  avatar: string;
  score: number;
};

function toMember(entry: CommunityActivityEntryDto): HomeCommunityMember {
  return {
    id: entry.id,
    name: entry.username,
    avatar: entry.avatarImageUrl,
    score: entry.score,
  };
}

export function useHomeCommunityMembers(limit = 5) {
  const [members, setMembers] = useState<HomeCommunityMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiGetCommunityActivityLeaderboard(limit)
      .then((result) => {
        if (cancelled) return;
        setMembers(result.entries.map(toMember));
      })
      .catch(() => {
        if (cancelled) return;
        setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return members;
}
