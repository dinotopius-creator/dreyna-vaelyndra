import { Fragment, type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";

interface MentionTarget {
  userId: string;
  handle: string;
}

interface RichMentionTextProps {
  content: string;
  mentionsByHandle: Map<string, MentionTarget>;
  profileHref: (userId: string) => string;
  className?: string;
}

const MENTION_PATTERN = /(^|[^\w@])@([a-z0-9._-]+)/gim;

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function RichMentionText({
  content,
  mentionsByHandle,
  profileHref,
  className,
}: RichMentionTextProps) {
  const nodes = useMemo(() => {
    const parts: ReactNode[] = [];
    let cursor = 0;

    for (const match of content.matchAll(MENTION_PATTERN)) {
      const fullMatch = match[0];
      const prefix = match[1] ?? "";
      const rawHandle = match[2] ?? "";
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) continue;

      const mentionIndex = matchIndex + prefix.length;
      const mentionEnd = matchIndex + fullMatch.length;
      const mention = mentionsByHandle.get(normalizeHandle(rawHandle));

      if (!mention) continue;

      if (cursor < matchIndex) {
        parts.push(content.slice(cursor, matchIndex));
      }
      if (prefix) {
        parts.push(prefix);
      }

      parts.push(
        <Link
          key={`${mention.userId}-${mentionIndex}`}
          to={profileHref(mention.userId)}
          className="font-medium text-gold-200 transition hover:text-gold-300 hover:underline"
        >
          @{mention.handle}
        </Link>,
      );

      cursor = mentionEnd;
    }

    if (cursor < content.length) {
      parts.push(content.slice(cursor));
    }

    if (!parts.length) {
      return [content];
    }

    return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
  }, [content, mentionsByHandle, profileHref]);

  return <p className={className}>{nodes}</p>;
}

export function buildMentionLookup(
  entries: Array<{ userId: string; handle?: string | null; username?: string | null }>,
) {
  const lookup = new Map<string, MentionTarget>();

  for (const entry of entries) {
    if (!entry.userId) continue;
    const candidates = [entry.handle, entry.username?.replace(/\s+/g, "")];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = normalizeHandle(candidate);
      if (!normalized || lookup.has(normalized)) continue;
      lookup.set(normalized, {
        userId: entry.userId,
        handle: candidate.replace(/^@+/, ""),
      });
    }
  }

  return lookup;
}
