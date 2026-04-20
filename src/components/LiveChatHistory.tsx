/**
 * Panneau d'historique du chat live : complémente le `LiveChatOverlay`
 * (qui fait disparaître les messages au bout de 7 s) en permettant au
 * streamer et aux viewers de remonter dans le temps et de retrouver qui
 * a parlé.
 *
 * Fonctionnalités :
 *   - Scroll libre (mobile + PC) : on ne remonte pas l'ascenseur de force
 *     quand un nouveau message arrive si le user est déjà en train de
 *     lire plus haut.
 *   - Bouton "↓ Nouveaux messages" quand on est remonté et que de
 *     nouveaux messages arrivent.
 *   - Clic sur un pseudo ou un avatar → ouvre un menu contextuel
 *     (`LiveUserContextMenu`) permettant au minimum d'aller voir le
 *     profil. Pour le broadcaster, le menu expose en plus mute et kick.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crown } from "lucide-react";
import type { ChatMessage } from "../types";
import { getOfficial } from "../data/officials";
import { CREATURES } from "../data/creatures";
import { LiveUserContextMenu } from "./LiveUserContextMenu";

interface Props {
  messages: ChatMessage[];
  systemAuthorId: string;
  /** `id` du broadcaster du live affiché (propriétaire du chat). */
  broadcasterId: string;
  /** Est-ce que l'utilisateur courant est le broadcaster ? */
  isBroadcaster: boolean;
  /** Id du user connecté (ou null s'il est anonyme). */
  currentUserId: string | null;
  /**
   * Callback quand le broadcaster clique sur "Mute X min" dans le menu
   * contextuel. La durée est déjà convertie en secondes.
   */
  onMute: (targetUserId: string, targetName: string, durationSeconds: number) => void;
  /** Callback quand le broadcaster clique sur "Expulser". */
  onKick: (targetUserId: string, targetName: string, durationSeconds: number) => void;
}

/**
 * Fenêtre au-dessus de laquelle on considère que le user est "en bas"
 * (donc on peut auto-scroll à chaque nouveau message). Exprimée en px.
 */
const AT_BOTTOM_THRESHOLD_PX = 60;

export function LiveChatHistory({
  messages,
  systemAuthorId,
  broadcasterId,
  isBroadcaster,
  currentUserId,
  onMute,
  onKick,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Nombre de nouveaux messages arrivés pendant qu'on était remonté.
  const [unseenCount, setUnseenCount] = useState(0);
  // Dernier id connu pour ne compter qu'une fois par message.
  const lastKnownIdRef = useRef<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<{
    authorId: string;
    authorName: string;
  } | null>(null);

  // Quand un nouveau message arrive :
  //   - si on est déjà en bas → on scrolle vers le bas et on reset le
  //     compteur.
  //   - sinon → on incrémente le badge "nouveaux messages" et on laisse
  //     l'utilisateur continuer à lire sans le téléporter.
  // On passe par un `setTimeout(…, 0)` pour sortir du render courant et
  // éviter que la lint `set-state-in-effect` remonte un faux positif
  // (cf. react-hooks/set-state-in-effect).
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (lastKnownIdRef.current === last.id) return;
    lastKnownIdRef.current = last.id;
    const shouldStick = isAtBottom;
    const handle = window.setTimeout(() => {
      if (shouldStick) {
        scrollToBottom(false);
        setUnseenCount(0);
      } else {
        setUnseenCount((c) => Math.min(c + 1, 99));
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, [messages, isAtBottom]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < AT_BOTTOM_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    if (atBottom) setUnseenCount(0);
  }

  function scrollToBottom(smooth: boolean) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setIsAtBottom(true);
    setUnseenCount(0);
  }

  // Première ouverture : on se positionne tout en bas sans animation.
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false));
  }, []);

  return (
    <div className="mt-4 rounded-2xl border border-ivory/10 bg-night-900/70 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-ivory/60">
        <span className="uppercase tracking-[0.22em]">Historique du chat</span>
        <span className="text-[10px]">{messages.length} message{messages.length > 1 ? "s" : ""}</span>
      </div>
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="max-h-64 overflow-y-auto pr-1 sm:max-h-80"
        >
          <ul className="space-y-1.5">
            {messages.map((m) => (
              <ChatHistoryLine
                key={m.id}
                msg={m}
                isSystem={m.authorId === systemAuthorId}
                isBroadcasterMessage={m.authorId === broadcasterId}
                canModerate={
                  isBroadcaster &&
                  m.authorId !== broadcasterId &&
                  m.authorId !== systemAuthorId &&
                  m.authorId !== currentUserId
                }
                onOpenMenu={() =>
                  setOpenMenuFor({ authorId: m.authorId, authorName: m.authorName })
                }
              />
            ))}
          </ul>
        </div>
        {!isAtBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gold-shine px-3 py-1 text-xs font-semibold text-night-900 shadow-lg"
          >
            <ChevronDown className="mr-1 inline h-3 w-3" />
            {unseenCount > 0 ? `${unseenCount} nouveau${unseenCount > 1 ? "x" : ""} message${unseenCount > 1 ? "s" : ""}` : "Revenir en bas"}
          </button>
        )}
      </div>
      {openMenuFor && (
        <LiveUserContextMenu
          targetUserId={openMenuFor.authorId}
          targetName={openMenuFor.authorName}
          canModerate={
            isBroadcaster &&
            openMenuFor.authorId !== broadcasterId &&
            openMenuFor.authorId !== systemAuthorId &&
            openMenuFor.authorId !== currentUserId
          }
          onClose={() => setOpenMenuFor(null)}
          onMute={(durationSeconds) => {
            onMute(openMenuFor.authorId, openMenuFor.authorName, durationSeconds);
            setOpenMenuFor(null);
          }}
          onKick={(durationSeconds) => {
            onKick(openMenuFor.authorId, openMenuFor.authorName, durationSeconds);
            setOpenMenuFor(null);
          }}
        />
      )}
    </div>
  );
}

function ChatHistoryLine({
  msg,
  isSystem,
  isBroadcasterMessage,
  canModerate,
  onOpenMenu,
}: {
  msg: ChatMessage;
  isSystem: boolean;
  isBroadcasterMessage: boolean;
  canModerate: boolean;
  onOpenMenu: () => void;
}) {
  const official = useMemo(() => getOfficial(msg.authorId), [msg.authorId]);
  const creature = useMemo(
    () =>
      official ? CREATURES.find((c) => c.id === official.creatureId) : null,
    [official],
  );
  // Les messages système (cœurs, gifts, annonces) ne sont pas cliquables —
  // il n'y a pas de profil à ouvrir derrière. Idem pour le propre message
  // du user courant (inutile d'ouvrir son propre profil depuis le chat).
  const clickable = !isSystem;
  const hint = canModerate
    ? "Options de modération"
    : clickable
      ? "Voir le profil"
      : "";
  return (
    <li
      className={
        "flex items-start gap-2 rounded-xl px-2 py-1 " +
        (isSystem
          ? "border border-gold-400/30 bg-gold-500/10 text-gold-100"
          : isBroadcasterMessage
            ? "bg-gold-500/5 text-ivory"
            : "text-ivory/90")
      }
    >
      <button
        type="button"
        onClick={onOpenMenu}
        disabled={!clickable}
        title={hint}
        aria-label={hint || msg.authorName}
        className="flex flex-none items-start gap-2 text-left disabled:cursor-default"
      >
        <img
          src={msg.authorAvatar}
          alt=""
          className="h-6 w-6 flex-none rounded-full border border-gold-400/30 object-cover"
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-ivory/65">
          <button
            type="button"
            onClick={onOpenMenu}
            disabled={!clickable}
            title={hint}
            className="font-semibold text-gold-200 hover:underline disabled:hover:no-underline"
          >
            {msg.authorName}
          </button>
          {official?.role === "admin" && (
            <span className="inline-flex items-center rounded-full bg-gold-500/30 px-1 text-[9px] text-gold-100">
              <Crown className="mr-0.5 h-2 w-2" /> admin
            </span>
          )}
          {official?.role === "animator" && (
            <span className="rounded-full bg-fuchsia-500/30 px-1 text-[9px] text-fuchsia-100">
              🎭 animateur·ice
            </span>
          )}
          {creature && (
            <span className="text-[10px]" aria-hidden>
              {creature.icon}
            </span>
          )}
        </div>
        <p className="break-words text-sm leading-snug">{msg.content}</p>
      </div>
    </li>
  );
}
