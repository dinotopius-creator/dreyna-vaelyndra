/**
 * Scène live combinée : avatar 3D (déjà existant côté profils) +
 * familier du broadcaster, en sprites déplaçables au-dessus du player.
 *
 * Demande client (Alexandre, 20/04) :
 *   « Les avatars 3D existent déjà sur la plateforme. Le système d'avatar
 *     est déjà entièrement développé et fonctionnel sur les profils. Il
 *     NE faut PAS recréer un nouveau système d'avatar. Le but maintenant
 *     est uniquement d'intégrer l'avatar 3D déjà existant directement
 *     dans les lives utilisateurs. »
 *
 * Ce composant :
 *   1. récupère l'avatar du broadcaster via `apiGetProfile` et le rend
 *      avec `AvatarViewer` (qui sait déjà gérer Cuboid 3D + 2D fallback,
 *      cf. `src/components/AvatarViewer.tsx`).
 *   2. récupère le familier actif du broadcaster (`fetchUserFamiliars`)
 *      et reproduit les réactions live (cadeau → particules teintées,
 *      cœur → micro-rebond) — comme l'ancien `LiveFamiliarOverlay`.
 *   3. les place dans deux sprites draggables. Chaque sprite peut être
 *      déplacé, tourné par quart, miroir, verrouillé. Le host peut
 *      réinitialiser les positions ou masquer son avatar.
 *   4. persiste les positions par broadcaster en localStorage (cf.
 *      `src/lib/liveStage.ts`).
 *
 * Le composant remplace, quand actif, l'ancien `LiveFamiliarOverlay` :
 *   - avant : familier fixé en bas-gauche, pas de déplacement
 *   - après : familier déplaçable, et avatar 3D apparait à côté si le
 *     broadcaster a activé "Avatar 3D dans le live"
 *
 * Côté viewers : la scène est rendue en lecture seule, ce qui leur
 * donne une vue plus "premium" du live tout en restant 100 % DOM (zéro
 * surcoût WebRTC, zéro impact FPS sur le flux vidéo).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Eye, EyeOff, FlipHorizontal, Lock, RotateCw, RotateCcw, Unlock, RefreshCw, Settings } from "lucide-react";

import {
  fetchUserFamiliars,
  EVOLUTION_TIERS,
  type OwnedFamiliar,
} from "../lib/familiarsApi";
import { apiGetProfile, type UserProfileDto } from "../lib/api";
import { AvatarViewer } from "./AvatarViewer";
import { isFlatImageUrl } from "../lib/dicebear";
import { isAvatar3DUrl } from "../lib/avatar3d";
import {
  DEFAULT_LIVE_STAGE,
  clampNormalized,
  loadLiveStage,
  rotateLeft,
  rotateRight,
  saveLiveStage,
  type LiveStageSpriteState,
  type LiveStageState,
} from "../lib/liveStage";

const REACTION_EMOJIS = ["✨", "💫", "🌟", "⭐", "💖", "🪶", "🔮"];

interface Particle {
  id: string;
  dx: number;
  dy: number;
  emoji: string;
}

interface Props {
  broadcasterId: string;
  /** Pseudo affiché sous l'avatar (fallback si profil pas encore chargé). */
  broadcasterName: string;
  /** Fallback image si le profil serveur n'a pas encore répondu. */
  fallbackAvatar?: string | null;
  /** Si vrai → le host édite la scène (drag + boutons). Sinon → lecture seule. */
  canEdit: boolean;
  /** Si vrai → afficher l'avatar 3D du broadcaster en plus du familier. */
  showAvatar: boolean;
  /** Compteur monotone : déclenche un burst familier sur cadeau reçu. */
  giftTick: number;
  /** Couleur du dernier cadeau, pour teinter le burst. */
  lastGiftColor?: string | null;
  /** Compteur monotone : déclenche un micro-rebond familier sur cœur reçu. */
  heartTick?: number;
}

export function LiveStageOverlay({
  broadcasterId,
  broadcasterName,
  fallbackAvatar,
  canEdit,
  showAvatar,
  giftTick,
  lastGiftColor,
  heartTick,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [familiar, setFamiliar] = useState<OwnedFamiliar | null>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);

  const [stage, setStage] = useState<LiveStageState>(() =>
    loadLiveStage(broadcasterId),
  );
  // Édition d'un sprite à la fois : on n'ouvre les contrôles que pour
  // celui que le host a sélectionné, sinon la vidéo est noyée sous les
  // boutons. Valeurs : "avatar" | "familiar" | null.
  const [activeSprite, setActiveSprite] = useState<
    "avatar" | "familiar" | null
  >(null);

  // Burst familier : on garde le même mécanisme que l'ancien overlay.
  const [reactionKey, setReactionKey] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const lastGiftSeen = useRef(giftTick);
  const lastHeartSeen = useRef(heartTick ?? 0);

  const activeFamiliar = useMemo(() => {
    if (!familiar) return null;
    return familiar;
  }, [familiar]);

  // Recharge l'état dès qu'on change de broadcaster.
  useEffect(() => {
    setStage(loadLiveStage(broadcasterId));
    setActiveSprite(null);
  }, [broadcasterId]);

  // Charge le familier actif du broadcaster (héritage LiveFamiliarOverlay).
  useEffect(() => {
    let cancelled = false;
    fetchUserFamiliars(broadcasterId)
      .then((col) => {
        if (cancelled) return;
        const active =
          col.owned.find(
            (f) =>
              f.isActive ||
              f.id === col.activeUserFamiliarId ||
              f.familiarId === col.activeFamiliarId,
          ) ?? null;
        setFamiliar(active);
      })
      .catch(() => {
        if (!cancelled) setFamiliar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [broadcasterId]);

  // Charge le profil broadcaster uniquement si l'avatar live est réellement
  // affiché. En mode "familier seul", on évite ce fetch et on garde le
  // player plus léger pendant les lives desktop / partage d'écran.
  useEffect(() => {
    if (!broadcasterId || !showAvatar) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    apiGetProfile(broadcasterId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [broadcasterId, showAvatar]);

  // Burst sur cadeau reçu : rebond + particules (familier seulement).
  useEffect(() => {
    if (!activeFamiliar) return;
    if (giftTick === lastGiftSeen.current) return;
    lastGiftSeen.current = giftTick;
    setReactionKey((k) => k + 1);
    const energy = activeFamiliar.stats?.energy ?? 0;
    const particleCount = 4 + Math.floor(energy / 12);
    const now = Date.now();
    const next: Particle[] = Array.from({ length: particleCount }).map(
      (_, i) => ({
        id: `${now}-${i}`,
        dx: (i - (particleCount - 1) / 2) * 18 + (Math.random() - 0.5) * 12,
        dy: -60 - Math.random() * 30,
        emoji:
          REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)],
      }),
    );
    setParticles((p) => [...p, ...next]);
    const toClean = next.map((n) => n.id);
    const t = window.setTimeout(() => {
      setParticles((p) => p.filter((x) => !toClean.includes(x.id)));
    }, 1400);
    return () => window.clearTimeout(t);
  }, [giftTick, activeFamiliar]);

  // Micro-rebond sur cœur.
  useEffect(() => {
    if (!activeFamiliar) return;
    if (heartTick === undefined) return;
    if (heartTick === lastHeartSeen.current) return;
    lastHeartSeen.current = heartTick;
    setReactionKey((k) => k + 1);
  }, [heartTick, activeFamiliar]);

  const evolution = useMemo(
    () =>
      activeFamiliar
        ? EVOLUTION_TIERS[activeFamiliar.evolution.id] ?? null
        : null,
    [activeFamiliar],
  );

  const updateSprite = useCallback(
    (
      which: "avatar" | "familiar",
      patch: Partial<LiveStageSpriteState>,
    ) => {
      setStage((current) => {
        const sprite = current[which];
        const merged: LiveStageSpriteState = { ...sprite, ...patch };
        // Borne les coordonnées normalisées pour éviter qu'un sprite
        // soit complètement hors écran (et donc impossible à attraper).
        merged.x = clampNormalized(merged.x);
        merged.y = clampNormalized(merged.y);
        const next: LiveStageState = { ...current, [which]: merged };
        saveLiveStage(broadcasterId, next);
        return next;
      });
    },
    [broadcasterId],
  );

  const setAvatarVisible = useCallback(
    (visible: boolean) => {
      setStage((current) => {
        const next = { ...current, avatarVisible: visible };
        saveLiveStage(broadcasterId, next);
        return next;
      });
    },
    [broadcasterId],
  );

  const resetPositions = useCallback(() => {
    const next: LiveStageState = {
      ...DEFAULT_LIVE_STAGE,
      avatarVisible: stage.avatarVisible,
    };
    saveLiveStage(broadcasterId, next);
    setStage(next);
  }, [broadcasterId, stage.avatarVisible]);

  // ---------- Rendu ----------

  // Aucun broadcaster identifié → rien à rendre (cas race-condition).
  if (!broadcasterId) return null;

  // Aucune donnée pour l'instant ET pas d'avatar à montrer → on ne
  // pollue pas le DOM. (Mais si le familier charge plus tard, on le
  // montera quand il sera là — donc on ne return pas trop tôt si on
  // doit afficher l'avatar.)
  const hasTrueAvatar3DSource = !!(
    profile?.avatarUrl &&
    (isAvatar3DUrl(profile.avatarUrl) || !isFlatImageUrl(profile.avatarUrl))
  );
  const shouldShowAvatar = showAvatar && stage.avatarVisible;
  const shouldRenderAvatar = shouldShowAvatar && hasTrueAvatar3DSource;
  const shouldRenderAnything = activeFamiliar || shouldRenderAvatar;
  if (!shouldRenderAnything) return null;

  return (
    <div ref={stageRef} className="pointer-events-none absolute inset-0 z-20">
      {/* Sprite : avatar 3D du broadcaster. */}
      {shouldRenderAvatar && (
        <StageSprite
          id="avatar"
          stageContainerRef={stageRef}
          state={stage.avatar}
          canEdit={canEdit}
          isActive={activeSprite === "avatar"}
          onActivate={() =>
            setActiveSprite((current) =>
              current === "avatar" ? null : "avatar",
            )
          }
          onMove={(x, y) => updateSprite("avatar", { x, y })}
          onRotateLeft={() =>
            updateSprite("avatar", { rotation: rotateLeft(stage.avatar.rotation) })
          }
          onRotateRight={() =>
            updateSprite("avatar", { rotation: rotateRight(stage.avatar.rotation) })
          }
          onToggleMirror={() =>
            updateSprite("avatar", { mirror: !stage.avatar.mirror })
          }
          onToggleLock={() =>
            updateSprite("avatar", { locked: !stage.avatar.locked })
          }
          extraActions={
            canEdit
              ? [
                  {
                    label: "Masquer l'avatar",
                    icon: <EyeOff className="h-3 w-3" />,
                    onClick: () => setAvatarVisible(false),
                  },
                  {
                    label: "Réinitialiser positions",
                    icon: <RefreshCw className="h-3 w-3" />,
                    onClick: resetPositions,
                  },
                ]
              : []
          }
          label={`Avatar de ${broadcasterName}`}
        >
          <div className="relative h-32 w-24 sm:h-40 sm:w-28">
            <AvatarViewer
              src={profile?.avatarUrl ?? null}
              fallbackImage={profile?.avatarImageUrl ?? fallbackAvatar ?? null}
              alt={`Avatar de ${broadcasterName}`}
              size="portrait"
              framing="body"
              autoRotate
              interactive={false}
              equippedFrameId={profile?.equipped?.frame ?? null}
              equippedSceneId={profile?.equipped?.scene ?? null}
              equippedOutfit3DId={profile?.equipped?.outfit3d ?? null}
              equippedAccessory3DId={profile?.equipped?.accessory3d ?? null}
              className="shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
            />
          </div>
        </StageSprite>
      )}

      {/* Sprite : familier du broadcaster + particules de réactions. */}
      {activeFamiliar && (
        <StageSprite
          id="familiar"
          stageContainerRef={stageRef}
          state={stage.familiar}
          canEdit={canEdit}
          isActive={activeSprite === "familiar"}
          onActivate={() =>
            setActiveSprite((current) =>
              current === "familiar" ? null : "familiar",
            )
          }
          onMove={(x, y) => updateSprite("familiar", { x, y })}
          onRotateLeft={() =>
            updateSprite("familiar", {
              rotation: rotateLeft(stage.familiar.rotation),
            })
          }
          onRotateRight={() =>
            updateSprite("familiar", {
              rotation: rotateRight(stage.familiar.rotation),
            })
          }
          onToggleMirror={() =>
            updateSprite("familiar", { mirror: !stage.familiar.mirror })
          }
          onToggleLock={() =>
            updateSprite("familiar", { locked: !stage.familiar.locked })
          }
          extraActions={
            canEdit
              ? [
                  {
                    label: "Réinitialiser positions",
                    icon: <RefreshCw className="h-3 w-3" />,
                    onClick: resetPositions,
                  },
                ]
              : []
          }
          label={activeFamiliar.nickname ?? activeFamiliar.name}
        >
          <div className="relative h-16 w-16 sm:h-20 sm:w-20">
            <motion.div
              key={reactionKey}
              className="absolute inset-0 flex items-center justify-center rounded-full text-3xl sm:text-4xl"
              style={{
                background: `radial-gradient(circle at 50% 40%, ${activeFamiliar.color}44, ${activeFamiliar.color}11 60%, transparent)`,
                boxShadow: `0 0 24px -4px ${activeFamiliar.color}`,
                border: `1px solid ${activeFamiliar.color}55`,
              }}
              initial={{ scale: 0.85 }}
              animate={{
                scale: [1, 1.25, 0.95, 1],
                rotate: [0, -8, 6, 0],
                y: [0, -6, 2, 0],
              }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <motion.span
                style={{
                  filter: `drop-shadow(0 0 8px ${activeFamiliar.color})`,
                }}
                animate={{ y: [0, -3, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {activeFamiliar.icon}
              </motion.span>
            </motion.div>
            <AnimatePresence>
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base sm:text-lg"
                  style={{
                    filter: `drop-shadow(0 0 4px ${lastGiftColor ?? activeFamiliar.color})`,
                  }}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                  animate={{
                    opacity: [0, 1, 0],
                    x: p.dx,
                    y: p.dy,
                    scale: [0.6, 1.1, 0.9],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.3, ease: "easeOut" }}
                >
                  {p.emoji}
                </motion.span>
              ))}
            </AnimatePresence>
            <div
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-gold-400/30 bg-night-950/70 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-ivory/80 shadow"
              aria-hidden
            >
              {evolution?.emoji ?? "✨"} Niv {activeFamiliar.level}
            </div>
          </div>
        </StageSprite>
      )}

      {/* Bouton "réafficher l'avatar" si le host l'a masqué. */}
      {canEdit && showAvatar && hasTrueAvatar3DSource && !stage.avatarVisible && (
        <button
          type="button"
          onClick={() => setAvatarVisible(true)}
          className="pointer-events-auto absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-night-950/85 px-3 py-1 text-[11px] font-semibold text-gold-200 shadow backdrop-blur hover:border-gold-300"
        >
          <Eye className="h-3.5 w-3.5" /> Afficher mon avatar
        </button>
      )}
    </div>
  );
}

// ---------- Sprite générique (drag + boutons) ----------

interface SpriteAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface StageSpriteProps {
  id: string;
  stageContainerRef: React.RefObject<HTMLDivElement | null>;
  state: LiveStageSpriteState;
  canEdit: boolean;
  isActive: boolean;
  onActivate: () => void;
  onMove: (x: number, y: number) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onToggleMirror: () => void;
  onToggleLock: () => void;
  extraActions: SpriteAction[];
  label: string;
  children: React.ReactNode;
}

function StageSprite({
  id,
  stageContainerRef,
  state,
  canEdit,
  isActive,
  onActivate,
  onMove,
  onRotateLeft,
  onRotateRight,
  onToggleMirror,
  onToggleLock,
  extraActions,
  label,
  children,
}: StageSpriteProps) {
  const spriteRef = useRef<HTMLDivElement | null>(null);
  // Drag state local : on capture le pointer pour suivre même si on
  // sort du sprite, et on évite de toucher le DOM React pendant le drag
  // (utilise un RAF pour appliquer la dernière position).
  const dragRef = useRef<{
    pointerId: number;
    rect: DOMRect;
    parentRect: DOMRect;
  } | null>(null);
  const rafPending = useRef<number | null>(null);
  const lastNorm = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || state.locked) return;
    // Clic primaire / tap uniquement.
    if (event.button !== undefined && event.button !== 0) return;
    const sprite = spriteRef.current;
    if (!sprite) return;
    const parent = stageContainerRef.current;
    if (!parent) return;
    dragRef.current = {
      pointerId: event.pointerId,
      rect: sprite.getBoundingClientRect(),
      parentRect: parent.getBoundingClientRect(),
    };
    try {
      sprite.setPointerCapture(event.pointerId);
    } catch {
      // Safari/iOS plus ancien — on continue sans capture.
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const parent = drag.parentRect;
    const w = parent.width || 1;
    const h = parent.height || 1;
    const nx = (event.clientX - parent.left) / w;
    const ny = (event.clientY - parent.top) / h;
    lastNorm.current = { x: nx, y: ny };
    event.preventDefault();
    if (rafPending.current === null) {
      rafPending.current = requestAnimationFrame(() => {
        rafPending.current = null;
        if (!lastNorm.current) return;
        onMove(lastNorm.current.x, lastNorm.current.y);
      });
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (rafPending.current !== null) {
      cancelAnimationFrame(rafPending.current);
      rafPending.current = null;
    }
    if (lastNorm.current) {
      onMove(lastNorm.current.x, lastNorm.current.y);
      lastNorm.current = null;
    }
    event.preventDefault();
    const sprite = spriteRef.current;
    try {
      sprite?.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const transform = useMemo(() => {
    const parts: string[] = ["translate(-50%, -50%)"];
    if (state.rotation) parts.push(`rotate(${state.rotation}deg)`);
    if (state.mirror) parts.push("scaleX(-1)");
    return parts.join(" ");
  }, [state.rotation, state.mirror]);

  const style: CSSProperties = {
    left: `${state.x * 100}%`,
    top: `${state.y * 100}%`,
    transform,
    touchAction: "none",
  };

  return (
    <div
      ref={spriteRef}
      data-sprite={id}
      style={style}
      className={clsx(
        "pointer-events-auto absolute select-none",
        canEdit && !state.locked && "cursor-grab active:cursor-grabbing",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      aria-label={label}
    >
      <div className="relative">
        {children}

        {canEdit && (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onActivate();
            }}
            className={clsx(
              "absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border bg-night-950/90 shadow-md",
              isActive
                ? "border-gold-300 text-gold-100"
                : "border-gold-400/50 text-gold-200 hover:border-gold-300",
            )}
            aria-label="Options du sprite"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}

        {canEdit && isActive && (
          <div
            // Anti-effet miroir : on contre la transform du parent pour
            // que les boutons restent lisibles dans le bon sens même si
            // le sprite est mirroré ou tourné.
            style={{
              transform: `${state.mirror ? "scaleX(-1)" : ""} rotate(${(360 - state.rotation) % 360}deg)`.trim(),
            }}
            className="absolute -bottom-3 left-1/2 z-30 flex -translate-x-1/2 translate-y-full items-center gap-1 rounded-2xl border border-gold-400/40 bg-night-950/95 p-1.5 text-[11px] text-ivory/85 shadow-xl backdrop-blur"
          >
            <SpriteButton
              label="Rotation gauche"
              onClick={onRotateLeft}
              disabled={state.locked}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </SpriteButton>
            <SpriteButton
              label="Rotation droite"
              onClick={onRotateRight}
              disabled={state.locked}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </SpriteButton>
            <SpriteButton
              label="Effet miroir"
              onClick={onToggleMirror}
              active={state.mirror}
              disabled={state.locked}
            >
              <FlipHorizontal className="h-3.5 w-3.5" />
            </SpriteButton>
            <SpriteButton
              label={state.locked ? "Déverrouiller" : "Verrouiller"}
              onClick={onToggleLock}
              active={state.locked}
            >
              {state.locked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
            </SpriteButton>
            {extraActions.map((action) => (
              <SpriteButton
                key={action.label}
                label={action.label}
                onClick={action.onClick}
              >
                {action.icon}
              </SpriteButton>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpriteButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition",
        active
          ? "border-gold-300 bg-gold-500/15 text-gold-100"
          : "border-royal-500/30 hover:border-gold-400/40",
        disabled && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}
