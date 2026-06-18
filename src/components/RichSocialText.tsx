import { Fragment, type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { tokenizeSocialText } from "../data/communityContest";

interface MentionTarget {
  userId: string;
  handle: string;
}

interface RichSocialTextProps {
  content: string;
  mentionsByHandle: Map<string, MentionTarget>;
  profileHref: (userId: string) => string;
  hashtagHref?: (slug: string) => string;
  className?: string;
}

const MENTION_PATTERN = /(^|[^\w@])@([a-z0-9._-]+)/gim;

function renderMentions(
  text: string,
  mentionsByHandle: Map<string, MentionTarget>,
  profileHref: (userId: string) => string,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const rawHandle = match[2] ?? "";
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;

    const mention = mentionsByHandle.get(rawHandle.trim().replace(/^@+/, "").toLowerCase());
    if (!mention) continue;

    const mentionIndex = matchIndex + prefix.length;
    const mentionEnd = matchIndex + fullMatch.length;
    if (cursor < matchIndex) {
      parts.push(text.slice(cursor, matchIndex));
    }
    if (prefix) {
      parts.push(prefix);
    }

    parts.push(
      <Link
        key={`mention-${mention.userId}-${mentionIndex}`}
        to={profileHref(mention.userId)}
        className="font-medium text-gold-200 transition hover:text-gold-300 hover:underline"
      >
        @{mention.handle}
      </Link>,
    );
    cursor = mentionEnd;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length ? parts : [text];
}

export function RichSocialText({
  content,
  mentionsByHandle,
  profileHref,
  hashtagHref = (slug) => `/communaute/hashtag/${slug}`,
  className,
}: RichSocialTextProps) {
  const nodes = useMemo(() => {
    const tokens = tokenizeSocialText(content);
    const parts: ReactNode[] = [];

    for (const token of tokens) {
      if (token.type === "text") {
        parts.push(...renderMentions(token.value, mentionsByHandle, profileHref));
        continue;
      }

      parts.push(
        <Link
          key={`hashtag-${token.slug}-${parts.length}`}
          to={hashtagHref(token.slug)}
          className="font-medium text-gold-200 transition hover:text-gold-300 hover:underline"
        >
          {token.value}
        </Link>,
      );
    }

    return parts.length ? parts : [content];
  }, [content, hashtagHref, mentionsByHandle, profileHref]);

  return (
    <p className={className}>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </p>
  );
}
