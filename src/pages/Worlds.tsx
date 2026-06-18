import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Crown,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Radio,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import type { World3DPlayer } from "../components/worlds/World3DStage";
import { FollowButton } from "../components/FollowButton";
import { Handle } from "../components/Handle";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { useWorldVoice } from "../contexts/WorldVoiceContext";
import {
  ApiError,
  apiApplyWalletDelta,
  apiGetProfile,
  apiHeartbeatWorldPresence,
  apiLeavePrivateWorldVoice,
  apiLeaveWorldPresence,
  apiListWorldPresence,
  apiRequestPrivateWorldVoice,
  apiRespondPrivateWorldVoice,
  apiSendWorldInteraction,
  type UserProfileDto,
  type WorldPresenceDto,
} from "../lib/api";
import {
  fetchUserFamiliars,
  type OwnedFamiliar,
} from "../lib/familiarsApi";
import { formatRelative } from "../lib/helpers";

type DistrictId = "place" | "arcades" | "observatory";

interface WorldSpeechBubble {
  id: string;
  userId: string;
  content: string;
  createdAt: number;
  expiresAt: number;
}

const World3DStage = lazy(() => import("../components/worlds/World3DStage"));

interface WorldsProps {
  dedicatedMode?: boolean;
}

const WORLD_BOOT_STEPS = [
  "Connexion au monde...",
  "Chargement de votre avatar...",
  "Préparation de l'univers...",
  "Synchronisation du vocal...",
  "Entrée dans Vaelyndra...",
];

interface District {
  id: DistrictId;
  name: string;
  accent: string;
  description: string;
  center: { x: number; y: number };
  mood: string;
  sky: string;
  flora: string;
  signature: string;
  orb: string;
  ambience: string;
  badge: string;
}

interface WorldChatMessage {
  id: string;
  author: string;
  handle?: string | null;
  content: string;
  tone?: "system" | "member";
  district?: DistrictId;
  createdAt: string;
}

interface StageMember {
  id: string;
  username: string;
  handle?: string | null;
  avatarImageUrl: string;
  avatarUrl?: string | null;
  role: string;
  x: number;
  y: number;
  status: string;
  aura: string;
  voiceEnabled: boolean;
  voiceChannelId: string;
  privateVoicePartnerId?: string | null;
  interactionKind?: string | null;
  interactionFromUserId?: string | null;
  interactionFromUsername?: string | null;
  interactionPartnerUserId?: string | null;
  interactionExpiresAt?: string | null;
  appearance?: World3DPlayer["appearance"];
}

interface SelectedWorldMember {
  member: StageMember;
  profile: UserProfileDto | null;
  loading: boolean;
  anchor: { x: number; y: number } | null;
}

type LueurRarity = "common" | "rare" | "epic";

interface WorldLueurNode {
  id: string;
  district: DistrictId;
  x: number;
  y: number;
  value: number;
  rarity: LueurRarity;
  label: string;
  respawnMs: number;
  availableAt: number;
  temporary?: boolean;
}

interface WorldHotspot {
  id: string;
  district: DistrictId;
  title: string;
  hint: string;
  description: string;
  x: number;
  y: number;
  radius: number;
  reward: number;
  glyph: string;
  resonance: string;
}

interface WorldAmbientEvent {
  id: string;
  district: DistrictId;
  title: string;
  copy: string;
  bonusLueurs: number;
  durationMs: number;
}

interface LueurBurst {
  id: string;
  x: number;
  y: number;
  value: number;
  rarity: LueurRarity;
}

type WorldCuteInteractionKind =
  | "wave"
  | "heart"
  | "hug"
  | "applaud"
  | "dance"
  | "lueur";

const WORLD_ID = "main";
const WORLD_LUEUR_DAILY_CAP = 90;
const WORLD_SYNC_DEBOUNCE_MS = 1400;
const WORLD_CLOCK_TICK_MS = 1000;
const LUEUR_STORAGE_PREFIX = "vaelyndra-world-lueurs";

const DISTRICTS: District[] = [
  {
    id: "place",
    name: "Place publique",
    accent: "from-gold-400/30 via-amber-300/10 to-rose-300/10",
    description: "Le coeur du royaume, entre rencontres spontanées et passages de familiers.",
    center: { x: 49, y: 62 },
    mood: "Agora dorée, fontaine centrale et rondes de familiers.",
    sky: "Aube doree",
    flora: "Parterres fleuris et herbes hautes",
    signature: "Fontaine solaire",
    orb: "Soleil",
    ambience: "Un coeur vivant baigne dans une lumiere chaude, avec des fleurs en bord de place et des rubans d'herbe qui bougent doucement.",
    badge: "Cour royale",
  },
  {
    id: "arcades",
    name: "Arcades des créateurs",
    accent: "from-cyan-300/25 via-sky-400/10 to-indigo-400/10",
    description: "Un couloir social pensé pour les vitrines d'avatars, fan arts et mini événements.",
    center: { x: 30, y: 50 },
    mood: "Galeries néon, cadres flottants et stands de créations.",
    sky: "Ciel pastel de fin de journee",
    flora: "Lianes, fleurs lumineuses et prairie neon",
    signature: "Serres creatives",
    orb: "Soleil couchant",
    ambience: "Les vitrines flottent dans un jardin électrique, entouré d'herbe vive et de fleurs qui reprennent les couleurs des créations.",
    badge: "Galerie vivante",
  },
  {
    id: "observatory",
    name: "Observatoire live",
    accent: "from-fuchsia-400/25 via-purple-400/10 to-rose-300/10",
    description: "Le balcon d'où l'on regarde les streamers en direct et les happenings du soir.",
    center: { x: 72, y: 42 },
    mood: "Dôme céleste, écrans live suspendus et vue sur le royaume.",
    sky: "Nuit astrale",
    flora: "Jardin lunaire et herbes d'argent",
    signature: "Terrasse des constellations",
    orb: "Lune",
    ambience: "Une scène de nuit claire avec lune, étoiles, halos et herbes argentées pour donner au live une allure cérémonielle.",
    badge: "Balcon celeste",
  },
];

const EVENT_BOARD = [
  {
    id: "event-aurora",
    title: "Défilé des familiers célestes",
    schedule: "Ce soir · 21:00",
    copy: "Parade lumineuse sur la place centrale avec bonus de présence et captures photo.",
  },
  {
    id: "event-live",
    title: "After live communautaire",
    schedule: "Dans 35 min",
    copy: "On bascule de l'observatoire au live du streamer vedette du moment.",
  },
  {
    id: "event-guild",
    title: "Ronde des nouveaux membres",
    schedule: "Ouvert maintenant",
    copy: "Parcours guidé du hub pour accueillir les nouveaux profils et leurs familiers.",
  },
];

const DISTRICT_LUEURS: Record<
  DistrictId,
  Array<Omit<WorldLueurNode, "district" | "availableAt">>
> = {
  place: [
    { id: "place-lueur-1", x: 22, y: 71, value: 1, rarity: "common", label: "eclat de parterre", respawnMs: 16000 },
    { id: "place-lueur-2", x: 34, y: 65, value: 1, rarity: "common", label: "fil d'aube", respawnMs: 18000 },
    { id: "place-lueur-3", x: 47, y: 56, value: 2, rarity: "rare", label: "goutte de fontaine", respawnMs: 24000 },
    { id: "place-lueur-4", x: 58, y: 68, value: 1, rarity: "common", label: "pollenne dore", respawnMs: 17000 },
    { id: "place-lueur-5", x: 70, y: 62, value: 1, rarity: "common", label: "herbe haute", respawnMs: 18000 },
    { id: "place-lueur-6", x: 81, y: 73, value: 2, rarity: "rare", label: "rune solaire", respawnMs: 26000 },
  ],
  arcades: [
    { id: "arcade-lueur-1", x: 18, y: 74, value: 1, rarity: "common", label: "pixel neon", respawnMs: 18000 },
    { id: "arcade-lueur-2", x: 28, y: 48, value: 1, rarity: "common", label: "verre chanteur", respawnMs: 19000 },
    { id: "arcade-lueur-3", x: 40, y: 63, value: 2, rarity: "rare", label: "echo de vitrine", respawnMs: 24000 },
    { id: "arcade-lueur-4", x: 56, y: 41, value: 1, rarity: "common", label: "fil cyan", respawnMs: 17000 },
    { id: "arcade-lueur-5", x: 67, y: 70, value: 1, rarity: "common", label: "pétale électrique", respawnMs: 18000 },
    { id: "arcade-lueur-6", x: 78, y: 52, value: 3, rarity: "epic", label: "maquette inspiree", respawnMs: 34000 },
  ],
  observatory: [
    { id: "obs-lueur-1", x: 16, y: 64, value: 1, rarity: "common", label: "poussiere d'etoile", respawnMs: 18000 },
    { id: "obs-lueur-2", x: 29, y: 38, value: 2, rarity: "rare", label: "givre astral", respawnMs: 25000 },
    { id: "obs-lueur-3", x: 45, y: 60, value: 1, rarity: "common", label: "halo lunaire", respawnMs: 19000 },
    { id: "obs-lueur-4", x: 58, y: 34, value: 2, rarity: "rare", label: "comète lente", respawnMs: 26000 },
    { id: "obs-lueur-5", x: 72, y: 72, value: 1, rarity: "common", label: "filament froid", respawnMs: 18000 },
    { id: "obs-lueur-6", x: 84, y: 50, value: 3, rarity: "epic", label: "éclat de météore", respawnMs: 36000 },
  ],
};

const DISTRICT_HOTSPOTS: Record<DistrictId, WorldHotspot[]> = {
  place: [
    {
      id: "place-fountain",
      district: "place",
      title: "Fontaine solaire",
      hint: "Son coeur pulse plus fort quand tu t'approches.",
      description: "Le bassin retient des lueurs dormantes et relache parfois un souffle dore.",
      x: 49,
      y: 42,
      radius: 12,
      reward: 5,
      glyph: "F",
      resonance: "Le cercle d'eau renvoie une benediction chaude sur toute la place.",
    },
    {
      id: "place-garden",
      district: "place",
      title: "Roseraie des serments",
      hint: "Les fleurs répondent aux membres patients.",
      description: "Une bordure fleurie cache de petites lueurs entre les herbes hautes.",
      x: 23,
      y: 76,
      radius: 10,
      reward: 4,
      glyph: "R",
      resonance: "Les petales se soulevent puis laissent tomber des poussières d'aube.",
    },
  ],
  arcades: [
    {
      id: "arcades-mirror",
      district: "arcades",
      title: "Miroir des createurs",
      hint: "Le verre garde les idees qui vibrent le plus fort.",
      description: "Les vitrines retiennent des impulsions de couleur et relâchent parfois une série d'éclats.",
      x: 62,
      y: 30,
      radius: 11,
      reward: 5,
      glyph: "M",
      resonance: "Les vitrines se synchronisent et allument la galerie pendant quelques secondes.",
    },
    {
      id: "arcades-workbench",
      district: "arcades",
      title: "Atelier cache",
      hint: "Un recoin discret chante sous le neon.",
      description: "Des outils oubliés battent doucement sous la verriere et aiment les explorateurs curieux.",
      x: 31,
      y: 66,
      radius: 10,
      reward: 4,
      glyph: "A",
      resonance: "Une pulsation cyan traverse les panneaux et réveille des lueurs de vitrine.",
    },
  ],
  observatory: [
    {
      id: "observatory-moonwell",
      district: "observatory",
      title: "Puits lunaire",
      hint: "La pierre réfracte les météorites lentes.",
      description: "Un puits de nuit retient les fragments tombes des constellations.",
      x: 64,
      y: 35,
      radius: 11,
      reward: 6,
      glyph: "L",
      resonance: "Le dôme reflète la lune et fait pleuvoir quelques éclats rares.",
    },
    {
      id: "observatory-rail",
      district: "observatory",
      title: "Rail des comètes",
      hint: "Quand le ciel change, les rails se remettent a murmurer.",
      description: "Les passerelles celestes accumulent une charge lumineuse qui ne se montre pas a tout le monde.",
      x: 24,
      y: 54,
      radius: 10,
      reward: 4,
      glyph: "C",
      resonance: "Une trame froide traverse le balcon et réveille la bordure du ciel.",
    },
  ],
};

const DISTRICT_AMBIENT_EVENTS: Record<DistrictId, WorldAmbientEvent[]> = {
  place: [
    {
      id: "place-breeze",
      district: "place",
      title: "Brise doree",
      copy: "Les herbes hautes se penchent et de nouvelles lueurs glissent vers les parterres.",
      bonusLueurs: 2,
      durationMs: 9000,
    },
    {
      id: "place-fountain-song",
      district: "place",
      title: "Chant de la fontaine",
      copy: "La place retient son souffle : le bassin central relache un cycle de gouttes lumineuses.",
      bonusLueurs: 3,
      durationMs: 8000,
    },
  ],
  arcades: [
    {
      id: "arcades-neon-surge",
      district: "arcades",
      title: "Surge neon",
      copy: "Les vitrines se synchronisent. Quelques éclats de création deviennent visibles.",
      bonusLueurs: 2,
      durationMs: 9000,
    },
    {
      id: "arcades-gallery-whisper",
      district: "arcades",
      title: "Murmure de galerie",
      copy: "Une onde traverse les cadres. Les panneaux caches s'ouvrent un instant.",
      bonusLueurs: 3,
      durationMs: 8500,
    },
  ],
  observatory: [
    {
      id: "observatory-meteor-drift",
      district: "observatory",
      title: "Dérive météore",
      copy: "Une traînée lente coupe le dôme et réveille des lueurs plus rares.",
      bonusLueurs: 2,
      durationMs: 8500,
    },
    {
      id: "observatory-lunar-flare",
      district: "observatory",
      title: "Halo lunaire",
      copy: "La terrasse s'eclaircit. Le puits lunaire pulse et attire les explorateurs.",
      bonusLueurs: 3,
      durationMs: 9500,
    },
  ],
};

const BASE_CHAT: WorldChatMessage[] = [
  {
    id: "world-boot-1",
    author: "Système",
    content: "Le portail des Mondes est ouvert. Approchez de la place publique pour croiser la cour.",
    tone: "system",
    district: "place",
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "world-boot-2",
    author: "Maîtresse des lieux",
    handle: "dreyna",
    content: "Les streamers visibles ici peuvent être rejoints instantanément depuis l'observatoire.",
    tone: "member",
    district: "observatory",
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
];

const WORLD_INTERACTION_META: Record<
  WorldCuteInteractionKind,
  {
    label: string;
    emoji: string;
    toast: string;
    copy: (actor: string, target: string) => string;
  }
> = {
  wave: {
    label: "Faire coucou",
    emoji: "👋",
    toast: "Coucou envoye.",
    copy: (actor, target) => `${actor} fait coucou à ${target}.`,
  },
  heart: {
    label: "Envoyer un coeur",
    emoji: "💖",
    toast: "Coeur envoye.",
    copy: (actor, target) => `${actor} envoie un coeur tendre a ${target}.`,
  },
  hug: {
    label: "Faire un calin",
    emoji: "🤗",
    toast: "Calin envoye.",
    copy: (actor, target) => `${actor} partage un calin doux avec ${target}.`,
  },
  applaud: {
    label: "Applaudir",
    emoji: "👏",
    toast: "Applaudissement envoye.",
    copy: (actor, target) => `${actor} applaudit ${target} avec enthousiasme.`,
  },
  dance: {
    label: "Danser ensemble",
    emoji: "✨",
    toast: "Invitation à danser envoyée.",
    copy: (actor, target) => `${actor} lance une danse complice avec ${target}.`,
  },
  lueur: {
    label: "Envoyer une petite lueur",
    emoji: "🪄",
    toast: "Petite lueur envoyée.",
    copy: (actor, target) => `${actor} envoie une petite lueur scintillante a ${target}.`,
  },
};

function toApiDetail(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const match = error.message.match(/"detail":"([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function Worlds({ dedicatedMode = false }: WorldsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { profile, setProfile } = useProfile();
  const { liveRegistry } = useLive();
  const { notify } = useToast();
  const [district, setDistrict] = useState<DistrictId>("place");
  const [position, setPosition] = useState({ x: 49, y: 62 });
  const [activeFamiliar, setActiveFamiliar] = useState<OwnedFamiliar | null>(null);
  // Cache of other users' active familiars shown on the map
  const [otherFamiliars, setOtherFamiliars] = useState<Record<string, OwnedFamiliar | null>>({});
  const familiarsLoadingRef = useRef<Record<string, boolean>>({});
  const [chatMessages, setChatMessages] = useState<WorldChatMessage[]>(BASE_CHAT);
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const [worldChatExpanded, setWorldChatExpanded] = useState(false);
  const [worldChatAttention, setWorldChatAttention] = useState(0);
  const [worldEmotesOpen, setWorldEmotesOpen] = useState(false);
  const [worldEmotePulse, setWorldEmotePulse] = useState<{
    kind: WorldCuteInteractionKind;
    userIds: string[];
    expiresAt: number;
  } | null>(null);
  const [worldSpeechBubbles, setWorldSpeechBubbles] = useState<WorldSpeechBubble[]>([]);
  const [worldMembers, setWorldMembers] = useState<WorldPresenceDto[]>([]);
  const [selectedMember, setSelectedMember] = useState<SelectedWorldMember | null>(null);
  const [memberActionBusy, setMemberActionBusy] = useState<string | null>(null);
  const [privateVoiceBusy, setPrivateVoiceBusy] = useState(false);
  const [isCompactMenu, setIsCompactMenu] = useState(false);
  const [worldClock, setWorldClock] = useState(() => Date.now());
  const [lueurNodes, setLueurNodes] = useState<Record<DistrictId, WorldLueurNode[]>>(
    () => createInitialLueurNodes(),
  );
  const [lueurBursts, setLueurBursts] = useState<LueurBurst[]>([]);
  const [sessionLueurs, setSessionLueurs] = useState(0);
  const [queuedLueurs, setQueuedLueurs] = useState(0);
  const [syncingLueurs, setSyncingLueurs] = useState(false);
  const [dailyWorldLueurs, setDailyWorldLueurs] = useState(() =>
    readWorldLueurProgress(null).total,
  );
  const [discoveredHotspots, setDiscoveredHotspots] = useState<Record<string, boolean>>(() =>
    readWorldLueurProgress(null).hotspots,
  );
  const [ambientEvent, setAmbientEvent] = useState<WorldAmbientEvent | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [lastCollectAt, setLastCollectAt] = useState(0);
  const lueurFlushRef = useRef(0);
  const profileRef = useRef(profile);
  const collectedRecentlyRef = useRef<Record<string, number>>({});
  const lastIncomingInviteRef = useRef<string | null>(null);

  const {
    voiceEnabled,
    micEnabled,
    voiceLoading,
    voiceLevel,
    connectionCount: worldVoiceConnections,
    error: worldVoiceError,
    currentChannelId,
    privateVoicePartnerId,
    toggleVoice,
    VoiceAudioLayer,
  } = useWorldVoice({
    worldId: WORLD_ID,
    userId: user?.id,
    district,
    members: worldMembers,
  });

  const mapRef = useRef<HTMLDivElement | null>(null);
  const [isWorldFullscreen, setIsWorldFullscreen] = useState(false);
  const [worldBooting, setWorldBooting] = useState(dedicatedMode);
  const [worldBootStep, setWorldBootStep] = useState(0);
  const [worldMenuOpen, setWorldMenuOpen] = useState(false);
  const [worldSwitchingTo, setWorldSwitchingTo] = useState<DistrictId | null>(null);
  const [worldViewportLandscape, setWorldViewportLandscape] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(orientation: landscape)").matches || window.innerWidth > window.innerHeight;
  });
  const worldSwitchTimerRef = useRef<number | null>(null);
  const worldGameActive = dedicatedMode || isWorldFullscreen;
  const worldLandscapeMode = worldGameActive && worldViewportLandscape;

  const focusWorldChatInput = useCallback(() => {
    const input = chatInputRef.current;
    if (!input) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    });
  }, []);

  const openWorldChat = useCallback(() => {
    setWorldMenuOpen(false);
    setWorldChatExpanded(true);
    setWorldChatAttention((value) => value + 1);
    focusWorldChatInput();
  }, [focusWorldChatInput]);

  const openWorldEmotes = useCallback(() => {
    setWorldMenuOpen(false);
    setWorldEmotesOpen(true);
  }, []);

  function handlePointerDown() {
    // Clicking or tapping the map should not teleport the player.
  }

  function handlePointerMove() {
    // Movement stays on dedicated controls to preserve player interactions.
  }

  function handlePointerUp() {
    // Movement stays on dedicated controls to preserve player interactions.
  }

  const enterWorldGame = useCallback(() => {
    if (!dedicatedMode) {
      navigate("/mondes/play", {
        state: {
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        },
      });
      return;
    }
    if (worldBooting || isWorldFullscreen) return;
    setWorldBooting(true);
    setWorldBootStep(0);
  }, [
    dedicatedMode,
    isWorldFullscreen,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    worldBooting,
  ]);

  const exitWorldGame = useCallback(() => {
    setWorldBooting(false);
    setIsWorldFullscreen(false);
    setWorldMenuOpen(false);
    setWorldSwitchingTo(null);
    setWorldSpeechBubbles([]);
    if (worldSwitchTimerRef.current !== null) {
      window.clearTimeout(worldSwitchTimerRef.current);
      worldSwitchTimerRef.current = null;
    }
    setWorldBootStep(0);
    void document.exitFullscreen?.().catch(() => undefined);
    if (dedicatedMode) {
      const state = location.state as { returnTo?: string } | null;
      const returnTo =
        state?.returnTo && state.returnTo !== location.pathname
          ? state.returnTo
          : "/mondes";
      navigate(returnTo, { replace: true });
    }
  }, [dedicatedMode, location.pathname, location.state, navigate]);

  const switchWorld = useCallback(
    (nextDistrict: DistrictId) => {
      if (nextDistrict === district || worldSwitchingTo) return;
      setWorldMenuOpen(false);
      setWorldSwitchingTo(nextDistrict);
      if (worldSwitchTimerRef.current !== null) {
        window.clearTimeout(worldSwitchTimerRef.current);
      }
      worldSwitchTimerRef.current = window.setTimeout(() => {
        setDistrict(nextDistrict);
        setWorldSwitchingTo(null);
        setWorldBooting(false);
        setIsWorldFullscreen(true);
        worldSwitchTimerRef.current = null;
      }, 560);
    },
    [district, worldSwitchingTo],
  );

  useEffect(() => {
    return () => {
      if (worldSwitchTimerRef.current !== null) {
        window.clearTimeout(worldSwitchTimerRef.current);
        worldSwitchTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setWorldSpeechBubbles((current) => current.filter((bubble) => bubble.expiresAt > now));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!worldBooting) return undefined;
    let step = 0;
    const stepTimer = window.setInterval(() => {
      step += 1;
      setWorldBootStep(Math.min(step, WORLD_BOOT_STEPS.length - 1));
    }, 360);
    const readyTimer = window.setTimeout(() => {
      window.clearInterval(stepTimer);
      setWorldBooting(false);
      setIsWorldFullscreen(true);
    }, 1850);
    return () => {
      window.clearInterval(stepTimer);
      window.clearTimeout(readyTimer);
    };
  }, [worldBooting]);

  useEffect(() => {
    if (!worldGameActive) {
      document.body.classList.remove("vaelyndra-world-game-open");
      return undefined;
    }
    document.body.classList.add("vaelyndra-world-game-open");
    const node = mapRef.current;
    if (!dedicatedMode) {
      void node?.requestFullscreen?.().catch(() => undefined);
    }
    const onFullscreenChange = () => {
      if (!dedicatedMode && !document.fullscreenElement) {
        setIsWorldFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.classList.remove("vaelyndra-world-game-open");
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [dedicatedMode, worldGameActive]);

  const refreshWorldPresence = useCallback(async () => {
    try {
      const entries = await apiListWorldPresence(WORLD_ID);
      setWorldMembers(entries);
    } catch {
      setWorldMembers([]);
    }
  }, []);

  const selectedDistrict = useMemo(
    () => DISTRICTS.find((entry) => entry.id === district) ?? DISTRICTS[0],
    [district],
  );

  const visibleLueurs = useMemo(
    () =>
      lueurNodes[district].filter((entry) => entry.availableAt <= worldClock),
    [district, lueurNodes, worldClock],
  );

  const districtHotspots = useMemo(
    () => DISTRICT_HOTSPOTS[district],
    [district],
  );

  const nearbyHotspot = useMemo(() => {
    return districtHotspots
      .map((entry) => ({
        entry,
        distance: distancePct(position.x, position.y, entry.x, entry.y),
      }))
      .filter((item) => item.distance <= item.entry.radius + 4)
      .sort((a, b) => a.distance - b.distance)[0]?.entry ?? null;
  }, [districtHotspots, position.x, position.y]);

  const lueurPouchTotal = useMemo(
    () => (profile?.lueurs ?? 0) + queuedLueurs,
    [profile?.lueurs, queuedLueurs],
  );

  const hiddenSecretsCount = useMemo(
    () =>
      Object.values(DISTRICT_HOTSPOTS)
        .flat()
        .filter((entry) => discoveredHotspots[entry.id]).length,
    [discoveredHotspots],
  );

  const liveEntries = useMemo(
    () =>
      Object.values(liveRegistry).sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [liveRegistry],
  );

  const stageMembers = useMemo<StageMember[]>(() => {
    const palette = [
      "shadow-[0_0_35px_rgba(250,204,21,0.35)]",
      "shadow-[0_0_35px_rgba(56,189,248,0.28)]",
      "shadow-[0_0_35px_rgba(244,114,182,0.25)]",
      "shadow-[0_0_35px_rgba(52,211,153,0.25)]",
    ];
    return worldMembers
      .filter(
        (entry) => entry.userId !== user?.id && entry.district === district,
      )
      .map((entry, index) => {
        const liveMatch = liveEntries.find((live) => live.userId === entry.userId);
        return {
          id: entry.userId,
          username: entry.username,
          handle: entry.handle ?? null,
          avatarImageUrl: entry.avatarImageUrl,
          avatarUrl: entry.avatarUrl,
          x: entry.posX,
          y: entry.posY,
          role: entry.role,
          status: liveMatch ? "en live" : entry.district === "observatory" ? "observe" : "dans le monde",
          aura: liveMatch
            ? "shadow-[0_0_38px_rgba(244,63,94,0.32)]"
            : palette[index % palette.length],
          voiceEnabled: entry.voiceEnabled,
          voiceChannelId: entry.voiceChannelId,
          privateVoicePartnerId: entry.privateVoicePartnerId,
          interactionKind: entry.interactionKind,
          interactionFromUserId: entry.interactionFromUserId,
          interactionFromUsername: entry.interactionFromUsername,
          interactionPartnerUserId: entry.interactionPartnerUserId,
          interactionExpiresAt: entry.interactionExpiresAt,
          appearance: entry.appearance ?? {
            avatarUrl: entry.avatarUrl,
            outfit3d: null,
            accessory3d: null,
            frame: null,
          },
        };
      });
  }, [district, liveEntries, user?.id, worldMembers]);

  const myWorldPresence = useMemo(
    () => worldMembers.find((entry) => entry.userId === user?.id) ?? null,
    [user?.id, worldMembers],
  );

  const world3DPlayers = useMemo<World3DPlayer[]>(() => {
    const activePulse =
      worldEmotePulse && worldEmotePulse.expiresAt > worldClock ? worldEmotePulse : null;
    const interactionFor = (playerId: string, fallback: string | null) => {
      if (!activePulse) return fallback;
      return activePulse.userIds.includes(playerId) ? activePulse.kind : fallback;
    };
    const selfPlayer: World3DPlayer | null = user
      ? {
          id: user.id,
          username: user.username,
          x: position.x,
          y: position.y,
          isSelf: true,
          voiceEnabled: micEnabled,
          isSpeaking: micEnabled && voiceLevel > 12,
          interactionKind: interactionFor(user.id, myWorldPresence?.interactionKind ?? null),
          appearance: {
            avatarUrl: profile?.avatarUrl ?? null,
            outfit3d: profile?.equipped?.outfit3d ?? null,
            accessory3d: profile?.equipped?.accessory3d ?? null,
            frame: profile?.equipped?.frame ?? null,
          },
          familiarIcon: activeFamiliar?.icon ?? null,
          familiarColor: activeFamiliar?.color ?? null,
          familiarName: activeFamiliar?.nickname ?? activeFamiliar?.name ?? null,
          familiarAccessoryIcon: activeFamiliar?.cosmetics?.accessory?.icon ?? null,
          familiarHairIcon: activeFamiliar?.cosmetics?.hair?.icon ?? null,
        }
      : null;

    const others = stageMembers.map((member) => ({
      id: member.id,
      username: member.username,
      x: member.x,
      y: member.y,
      voiceEnabled: member.voiceEnabled,
      isSpeaking: member.voiceEnabled,
      interactionKind: interactionFor(member.id, member.interactionKind ?? null),
      appearance: member.appearance ?? null,
      familiarIcon: otherFamiliars[member.id]?.icon ?? null,
      familiarColor: otherFamiliars[member.id]?.color ?? null,
      familiarName: otherFamiliars[member.id]?.nickname ?? otherFamiliars[member.id]?.name ?? null,
      familiarAccessoryIcon: otherFamiliars[member.id]?.cosmetics?.accessory?.icon ?? null,
      familiarHairIcon: otherFamiliars[member.id]?.cosmetics?.hair?.icon ?? null,
    }));

    return selfPlayer ? [selfPlayer, ...others] : others;
  }, [
    activeFamiliar?.color,
    activeFamiliar?.icon,
    activeFamiliar?.name,
    activeFamiliar?.nickname,
    activeFamiliar?.cosmetics?.accessory?.icon,
    activeFamiliar?.cosmetics?.hair?.icon,
    myWorldPresence?.interactionKind,
    otherFamiliars,
    position.x,
    position.y,
    profile?.avatarUrl,
    profile?.equipped?.accessory3d,
    profile?.equipped?.frame,
    profile?.equipped?.outfit3d,
    stageMembers,
    worldClock,
    worldEmotePulse,
    user,
    micEnabled,
    voiceLevel,
  ]);

  const pendingIncomingVoiceInvite = useMemo(
    () =>
      myWorldPresence?.pendingVoiceInviteFromUserId
        ? worldMembers.find(
            (entry) => entry.userId === myWorldPresence.pendingVoiceInviteFromUserId,
          ) ?? null
        : null,
    [myWorldPresence, worldMembers],
  );

  useEffect(() => {
    setPosition(selectedDistrict.center);
  }, [selectedDistrict]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    const progress = readWorldLueurProgress(user?.id ?? null);
    setDailyWorldLueurs(progress.total);
    setDiscoveredHotspots(progress.hotspots);
  }, [user?.id]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setWorldClock(Date.now()),
      WORLD_CLOCK_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setIsCompactMenu(window.innerWidth < 768);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    writeWorldLueurProgress(user?.id ?? null, {
      total: dailyWorldLueurs,
      hotspots: discoveredHotspots,
    });
  }, [dailyWorldLueurs, discoveredHotspots, user?.id]);

  useEffect(() => {
    setSelectedMember(null);
  }, [district]);

  useEffect(() => {
    if (!selectedMember) return;
    const fresh = stageMembers.find((entry) => entry.id === selectedMember.member.id);
    if (!fresh) {
      setSelectedMember(null);
      return;
    }
    if (fresh !== selectedMember.member) {
      setSelectedMember((current) =>
        current
          ? {
              ...current,
              member: fresh,
            }
          : current,
      );
    }
  }, [selectedMember, stageMembers]);

  useEffect(() => {
    if (!pendingIncomingVoiceInvite) {
      lastIncomingInviteRef.current = null;
      return;
    }
    if (lastIncomingInviteRef.current === pendingIncomingVoiceInvite.userId) return;
    lastIncomingInviteRef.current = pendingIncomingVoiceInvite.userId;
    notify(`${pendingIncomingVoiceInvite.username} souhaite discuter en vocal privé.`, "info");
    if (selectedMember?.member.id === pendingIncomingVoiceInvite.userId) return;
    const member =
      stageMembers.find((entry) => entry.id === pendingIncomingVoiceInvite.userId) ?? null;
    if (!member) return;
    void openMemberCard(member, null);
  }, [notify, openMemberCard, pendingIncomingVoiceInvite, selectedMember?.member.id, stageMembers]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPresence() {
      await refreshWorldPresence().catch(() => undefined);
      if (cancelled) return;
    }

    void refreshPresence();
    const timer = window.setInterval(refreshPresence, 1200); // poll more frequently for smoother movement
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshWorldPresence]);

  useEffect(() => {
    if (!user) {
      setActiveFamiliar(null);
      return;
    }
    let cancelled = false;
    fetchUserFamiliars(user.id)
      .then((collection) => {
        if (cancelled) return;
        const active =
          collection.owned.find(
            (entry) => entry.id === collection.activeUserFamiliarId || entry.familiarId === collection.activeFamiliarId,
          ) ?? null;
        setActiveFamiliar(active);
      })
      .catch(() => {
        if (!cancelled) setActiveFamiliar(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fetch other members' active familiars so players can see companions of others
  useEffect(() => {
    if (!user) return;
    // Collect visible members in current district
    const visible = worldMembers.filter((m) => m.district === district && m.userId !== user.id);
    const toFetch = visible
      .map((m) => m.userId)
      .filter((id) => !(id in otherFamiliars) && !familiarsLoadingRef.current[id])
      .slice(0, 16); // limit concurrent fetches

    if (!toFetch.length) return;

    toFetch.forEach((id) => {
      familiarsLoadingRef.current[id] = true;
    });

    (async () => {
      await Promise.all(
        toFetch.map(async (id) => {
          try {
            const col = await fetchUserFamiliars(id);
            const active =
              col.owned.find((entry) => entry.id === col.activeUserFamiliarId || entry.familiarId === col.activeFamiliarId) ?? null;
            setOtherFamiliars((prev) => ({ ...prev, [id]: active }));
          } catch {
            setOtherFamiliars((prev) => ({ ...prev, [id]: null }));
          } finally {
            familiarsLoadingRef.current[id] = false;
          }
        }),
      );
    })();
  }, [worldMembers, district, user]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (!["arrowup", "arrowdown", "arrowleft", "arrowright", "z", "q", "s", "d", "w", "a"].includes(key)) {
        return;
      }
      event.preventDefault();
      const step = 3;
      if (key === "arrowup" || key === "z" || key === "w") moveBy(0, -step);
      if (key === "arrowdown" || key === "s") moveBy(0, step);
      if (key === "arrowleft" || key === "q" || key === "a") moveBy(-step, 0);
      if (key === "arrowright" || key === "d") moveBy(step, 0);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!liveEntries.length) return;
    setChatMessages((current) => {
      const firstLive = liveEntries[0];
      if (current.some((entry) => entry.id === `live-pulse-${firstLive.userId}`)) {
        return current;
      }
      const nextMessage: WorldChatMessage = {
        id: `live-pulse-${firstLive.userId}`,
        author: "Signal live",
        content: `${firstLive.username} diffuse maintenant depuis l'observatoire.`,
        tone: "system",
        district: "observatory",
        createdAt: new Date().toISOString(),
      };
      return [nextMessage, ...current].slice(0, 12);
    });
  }, [liveEntries]);

  useEffect(() => {
    if (!visibleLueurs.length) return;
    const nearbyNodes = visibleLueurs
      .filter((entry) => distancePct(position.x, position.y, entry.x, entry.y) <= 6.5)
      .slice(0, 2);
    nearbyNodes.forEach((entry) => collectLueur(entry, "proximity"));
  }, [district, position.x, position.y, visibleLueurs, worldClock]);

  useEffect(() => {
    if (!queuedLueurs || !user || syncingLueurs) return;
    const timeout = window.setTimeout(async () => {
      const amount = lueurFlushRef.current;
      if (!amount) return;
      setSyncingLueurs(true);
      try {
        const updated = await apiApplyWalletDelta(user.id, {
          lueurs: amount,
          reason: `world:exploration:${district}`,
        });
        profileRef.current = updated;
        setProfile(updated);
        setQueuedLueurs((current) => Math.max(0, current - amount));
      } catch {
        notify("Les lueurs vibrent encore hors ligne. Elles seront retentées.", "info");
      } finally {
        setSyncingLueurs(false);
      }
    }, WORLD_SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [district, notify, queuedLueurs, setProfile, syncingLueurs, user]);

  useEffect(() => {
    lueurFlushRef.current = queuedLueurs;
  }, [queuedLueurs]);

  useEffect(() => {
    if (!lueurBursts.length) return;
    const timeout = window.setTimeout(() => {
      setLueurBursts((current) => current.slice(-6));
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [lueurBursts]);

  useEffect(() => {
    const availableEvents = DISTRICT_AMBIENT_EVENTS[district];
    if (!availableEvents.length) return;
    let cancelled = false;
    let timeout: number | null = null;

    const trigger = () => {
      const event =
        availableEvents[Math.floor(Math.random() * availableEvents.length)];
      setAmbientEvent({
        ...event,
        id: `${event.id}-${Date.now()}`,
      });
      awakenDormantLueurs(district, event.bonusLueurs);
      addWorldMessage("Flux du monde", event.copy);
      timeout = window.setTimeout(() => {
        if (!cancelled) setAmbientEvent(null);
      }, event.durationMs);
    };

    const loop = () => {
      const nextDelay = 22000 + Math.round(Math.random() * 14000);
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        trigger();
        loop();
      }, nextDelay);
    };

    loop();

    return () => {
      cancelled = true;
      if (timeout !== null) window.clearTimeout(timeout);
      setAmbientEvent(null);
    };
  }, [district]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function heartbeat() {
      try {
        await apiHeartbeatWorldPresence(WORLD_ID, {
          district,
          posX: Math.round(position.x),
          posY: Math.round(position.y),
          voiceEnabled,
        });
        const entries = await apiListWorldPresence(WORLD_ID);
        if (!cancelled) setWorldMembers(entries);
      } catch {
        /* best effort */
      }
    }

    void heartbeat();
    const timer = window.setInterval(heartbeat, 8000);

    // Real-time presence: send immediate updates on position change (throttled)
    const lastSentRef = { current: 0 } as { current: number };
    let sendTimeout: number | null = null;

    const sendImmediate = async () => {
      try {
        await apiHeartbeatWorldPresence(WORLD_ID, {
          district,
          posX: Math.round(position.x),
          posY: Math.round(position.y),
          voiceEnabled,
        });
        lastSentRef.current = Date.now();
      } catch {
        /* ignore */
      }
    };

    // attach a listener for position changes via custom event (we call moveBy which updates state)
    // Using a Mutation-like approach: listen to window for 'vaelyndra:position-change' events (dispatched below when moveBy runs)
    function onPosChange() {
      const now = Date.now();
      const elapsed = now - lastSentRef.current;
      const minInterval = 200; // ms
      if (elapsed > minInterval) {
        void sendImmediate();
      } else {
        if (sendTimeout !== null) window.clearTimeout(sendTimeout);
        sendTimeout = window.setTimeout(() => void sendImmediate(), minInterval - elapsed);
      }
    }

    window.addEventListener("vaelyndra:position-change", onPosChange as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (sendTimeout !== null) window.clearTimeout(sendTimeout);
      window.removeEventListener("vaelyndra:position-change", onPosChange as EventListener);
    };
  }, [district, position.x, position.y, user, voiceEnabled]);

  useEffect(() => {
    if (!user) return;
    return () => {
      void apiLeaveWorldPresence(WORLD_ID).catch(() => undefined);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!worldGameActive) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: OrientationLockType) => Promise<void>;
      unlock?: () => void;
    };
    void orientation.lock?.("landscape").catch(() => undefined);
    return () => {
      orientation.unlock?.();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [worldGameActive]);

  useEffect(() => {
    if (!worldGameActive || typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(orientation: landscape)");
    const updateViewportMode = () => {
      setWorldViewportLandscape(mediaQuery.matches || window.innerWidth > window.innerHeight);
    };
    updateViewportMode();
    mediaQuery.addEventListener?.("change", updateViewportMode);
    window.addEventListener("resize", updateViewportMode);
    window.addEventListener("orientationchange", updateViewportMode);
    window.visualViewport?.addEventListener("resize", updateViewportMode);
    return () => {
      mediaQuery.removeEventListener?.("change", updateViewportMode);
      window.removeEventListener("resize", updateViewportMode);
      window.removeEventListener("orientationchange", updateViewportMode);
      window.visualViewport?.removeEventListener("resize", updateViewportMode);
    };
  }, [worldGameActive]);

  useEffect(() => {
    if (!worldMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorldMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [worldMenuOpen]);

  useEffect(() => {
    if (!worldVoiceError) return;
    if (worldVoiceError === "duplicate-peer") {
      notify("Le vocal du monde est déjà ouvert dans un autre onglet.", "info");
      return;
    }
    if (worldVoiceError === "audio-unsupported") {
      notify("Le vocal du monde n'est pas supporté sur cet appareil.", "error");
      return;
    }
    notify("Le vocal du monde a rencontré une erreur. Vérifie ton micro.", "error");
  }, [notify, worldVoiceError]);

  function moveBy(deltaX: number, deltaY: number) {
    setPosition((current) => {
      const newX = clamp(current.x + deltaX, 10, 88);
      const newY = clamp(current.y + deltaY, 18, 84);
      // dispatch a small event so the presence effect can send an immediate update
      try {
        window.dispatchEvent(new CustomEvent("vaelyndra:position-change", { detail: { x: newX, y: newY } }));
      } catch {
        // ignore in non-browser environments
      }
      return { x: newX, y: newY };
    });
  }

  function moveTo(next: { x: number; y: number }) {
    const newX = clamp(next.x, 10, 88);
    const newY = clamp(next.y, 18, 84);
    setPosition({ x: newX, y: newY });
    try {
      window.dispatchEvent(
        new CustomEvent("vaelyndra:position-change", {
          detail: { x: newX, y: newY },
        }),
      );
    } catch {
      // ignore in non-browser environments
    }
  }

  function selectWorld3DPlayer(playerId: string, anchor: { x: number; y: number }) {
    const member = stageMembers.find((entry) => entry.id === playerId);
    if (!member) return;
    void openMemberCard(member, anchor);
  }

  function collectWorld3DLueur(nodeId: string) {
    const node = visibleLueurs.find((entry) => entry.id === nodeId);
    if (!node) return;
    collectLueur(node, "tap");
  }

  function triggerWorld3DHotspot(hotspotId: string) {
    const hotspot = districtHotspots.find((entry) => entry.id === hotspotId);
    if (!hotspot) return;
    triggerHotspot(hotspot);
  }

  function sendMessage() {
    const cleaned = chatInput.trim();
    if (!cleaned) return;
    const author = user?.username ?? "Visiteur";
    const now = Date.now();
    setChatMessages((current) => {
      const nextMessage: WorldChatMessage = {
        id: `msg-${Date.now()}`,
        author,
        handle: user?.handle ?? null,
        content: cleaned,
        tone: "member",
        district,
        createdAt: new Date().toISOString(),
      };
      return [nextMessage, ...current].slice(0, 12);
    });
    if (user?.id) {
      setWorldSpeechBubbles((current) => {
        const nextBubble: WorldSpeechBubble = {
          id: `bubble-${user.id}-${now}`,
          userId: user.id,
          content: cleaned,
          createdAt: now,
          expiresAt: now + 5400,
        };
        return [nextBubble, ...current]
          .filter((bubble) => bubble.expiresAt > now)
          .slice(0, 10);
      });
    }
    setChatInput("");
  }

  function addWorldMessage(author: string, content: string, tone: "system" | "member" = "system") {
    setChatMessages((current) => {
      const nextMessage: WorldChatMessage = {
        id: `world-social-${Date.now()}`,
        author,
        content,
        tone,
        district,
        createdAt: new Date().toISOString(),
      };
      return [nextMessage, ...current].slice(0, 12);
    });
  }

  async function openMemberCard(
    member: StageMember,
    anchor: { x: number; y: number } | null,
  ) {
    setSelectedMember({ member, profile: null, loading: true, anchor });
    try {
      const memberProfile = await apiGetProfile(member.id);
      setSelectedMember({ member, profile: memberProfile, loading: false, anchor });
    } catch {
      setSelectedMember({ member, profile: null, loading: false, anchor });
    }
  }

  async function sendCuteAction(kind: WorldCuteInteractionKind) {
    if (!selectedMember) return;
    const target = selectedMember.profile?.username ?? selectedMember.member.username;
    const actor = user?.username ?? "Visiteur";
    const meta = WORLD_INTERACTION_META[kind];
    const expiresAt = Date.now() + 5200;
    const userIds = Array.from(new Set([user?.id, selectedMember.member.id].filter(Boolean))) as string[];
    setWorldEmotePulse({ kind, userIds, expiresAt });
    setMemberActionBusy(kind);
    try {
      await apiSendWorldInteraction(WORLD_ID, {
        targetUserId: selectedMember.member.id,
        kind,
      });
      await refreshWorldPresence();
      addWorldMessage("Lien social", meta.copy(actor, target));
      notify(`${meta.toast} ${target}.`, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        notify("Interaction trop rapide. Attends un instant.", "info");
      } else {
        notify("Impossible d'envoyer cette interaction pour le moment.", "error");
      }
    } finally {
      setMemberActionBusy(null);
    }
  }

  async function requestPrivateVoice(targetUserId: string) {
    setPrivateVoiceBusy(true);
    try {
      await apiRequestPrivateWorldVoice(WORLD_ID, targetUserId);
      await refreshWorldPresence();
      notify("Invitation au vocal privé envoyée.", "success");
    } catch (err) {
      notify(
        toApiDetail(err, "Impossible de lancer le vocal privé pour le moment."),
        "error",
      );
    } finally {
      setPrivateVoiceBusy(false);
    }
  }

  async function respondPrivateVoice(requesterUserId: string, accept: boolean) {
    setPrivateVoiceBusy(true);
    try {
      await apiRespondPrivateWorldVoice(WORLD_ID, { requesterUserId, accept });
      await refreshWorldPresence();
      notify(
        accept ? "Vocal privé activé." : "Invitation au vocal privé refusée.",
        accept ? "success" : "info",
      );
    } catch {
      notify("Impossible de traiter cette invitation.", "error");
    } finally {
      setPrivateVoiceBusy(false);
    }
  }

  async function leavePrivateVoice() {
    setPrivateVoiceBusy(true);
    try {
      await apiLeavePrivateWorldVoice(WORLD_ID);
      await refreshWorldPresence();
      notify("Retour au vocal normal du monde.", "success");
    } catch {
      notify("Impossible de quitter le vocal privé pour le moment.", "error");
    } finally {
      setPrivateVoiceBusy(false);
    }
  }

  function awardWorldLueurs(rawAmount: number, reason: string) {
    if (rawAmount <= 0) return 0;
    const remaining = Math.max(0, WORLD_LUEUR_DAILY_CAP - dailyWorldLueurs);
    const granted = Math.min(rawAmount, remaining);
    if (!granted) {
      notify("Le flux quotidien de lueurs a déjà été capté pour aujourd'hui.", "info");
      return 0;
    }

    setDailyWorldLueurs((current) => current + granted);
    setSessionLueurs((current) => current + granted);
    if (user) {
      setQueuedLueurs((current) => current + granted);
    }
    setComboCount((current) =>
      Date.now() - lastCollectAt < 6000 ? current + 1 : 1,
    );
    setLastCollectAt(Date.now());

    if (profileRef.current) {
      const optimistic = {
        ...profileRef.current,
        lueurs: profileRef.current.lueurs + granted,
      };
      profileRef.current = optimistic;
      setProfile(optimistic);
    }

    if (!user && sessionLueurs === 0 && granted > 0) {
      notify("Connecte-toi pour lier durablement ces lueurs a ton compte.", "info");
    }

    if (granted >= 3) {
      addWorldMessage("Lueurs", `${reason} réveille ${granted} lueurs autour de toi.`);
    }

    return granted;
  }

  function playLueurChime(rarity: LueurRarity) {
    if (typeof window === "undefined") return;
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = rarity === "epic" ? "triangle" : "sine";
      oscillator.frequency.value =
        rarity === "epic" ? 880 : rarity === "rare" ? 740 : 620;
      gain.gain.value = rarity === "epic" ? 0.03 : 0.02;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
      oscillator.stop(audioContext.currentTime + 0.18);
      window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
      }, 240);
    } catch {
      /* best effort */
    }
  }

  function awakenDormantLueurs(targetDistrict: DistrictId, count: number) {
    setLueurNodes((current) => {
      const nodes = [...current[targetDistrict]];
      const sleeping = nodes
        .filter((entry) => entry.availableAt > Date.now())
        .sort((a, b) => a.availableAt - b.availableAt)
        .slice(0, count);
      if (!sleeping.length) return current;
      const awakened = new Set(sleeping.map((entry) => entry.id));
      return {
        ...current,
        [targetDistrict]: nodes.map((entry) =>
          awakened.has(entry.id)
            ? { ...entry, availableAt: Date.now() + Math.round(Math.random() * 900) }
            : entry,
        ),
      };
    });
  }

  function collectLueur(node: WorldLueurNode, source: "tap" | "proximity") {
    const now = Date.now();
    if ((collectedRecentlyRef.current[node.id] ?? 0) > now - 700) return;
    collectedRecentlyRef.current[node.id] = now;

    setLueurNodes((current) => ({
      ...current,
      [node.district]: current[node.district].map((entry) =>
        entry.id === node.id
          ? {
              ...entry,
              availableAt:
                now +
                entry.respawnMs +
                Math.round(Math.random() * (entry.rarity === "common" ? 5000 : 9000)),
            }
          : entry,
      ),
    }));

    setLueurBursts((current) => [
      ...current.slice(-7),
      {
        id: `${node.id}-${now}`,
        x: node.x,
        y: node.y,
        value: node.value,
        rarity: node.rarity,
      },
    ]);

    const granted = awardWorldLueurs(
      node.value,
      source === "tap" ? node.label : `La ${node.label}`,
    );
    playLueurChime(node.rarity);

    if (granted && (node.rarity !== "common" || source === "tap")) {
      notify(`+${granted} lueur${granted > 1 ? "s" : ""} : ${node.label}.`, "success");
    }
  }

  function triggerHotspot(hotspot: WorldHotspot) {
    const distance = distancePct(position.x, position.y, hotspot.x, hotspot.y);
    if (distance > hotspot.radius + 4) {
      notify(`Approche-toi de ${hotspot.title.toLowerCase()} pour l'activer.`, "info");
      return;
    }

    const isFirstDiscovery = !discoveredHotspots[hotspot.id];
    setDiscoveredHotspots((current) => ({ ...current, [hotspot.id]: true }));
    awakenDormantLueurs(hotspot.district, isFirstDiscovery ? 3 : 1);

    const granted = awardWorldLueurs(
      isFirstDiscovery ? hotspot.reward : 1,
      hotspot.title,
    );

    addWorldMessage(
      "Resonance",
      isFirstDiscovery
        ? `${hotspot.title} s'ouvre : ${hotspot.resonance}`
        : `${hotspot.title} pulse encore, puis se rendort doucement.`,
    );

    setAmbientEvent({
      id: `${hotspot.id}-echo-${Date.now()}`,
      district: hotspot.district,
      title: hotspot.title,
      copy: hotspot.description,
      bonusLueurs: isFirstDiscovery ? 2 : 1,
      durationMs: 7000,
    });

    if (granted) {
      notify(
        isFirstDiscovery
          ? `${hotspot.title} révèle +${granted} lueurs.`
          : `${hotspot.title} laisse encore filer une lueur.`,
        "success",
      );
    }
  }

  return (
    <div
      className={
        dedicatedMode
          ? "h-[100dvh] w-screen overflow-hidden bg-night-950"
          : "mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12"
      }
    >
      <VoiceAudioLayer />
      {!dedicatedMode && (
        <SectionHeading
          eyebrow="Mondes"
          title={
            <>
              La place <span className="text-mystic">virtuelle</span> de Vaelyndra
            </>
          }
          subtitle="Un hub social vivant où les membres se déplacent avec leur familier, repèrent les lives en direct et rejoignent les événements du royaume."
        />
      )}

      {!dedicatedMode && (
      <section className="mt-8 overflow-hidden rounded-[34px] border border-gold-400/20 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_34%),linear-gradient(135deg,rgba(8,15,31,0.96),rgba(20,10,39,0.92)_55%,rgba(7,23,28,0.96))] shadow-[0_28px_120px_rgba(2,6,23,0.5)]">
        <div className="grid gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.15fr,0.85fr] lg:px-8 lg:py-8">
          <div className="relative">
            <div className="absolute inset-x-0 top-0 h-24 rounded-full bg-gold-300/10 blur-3xl" />
            <div className="relative">
              <div className="inline-flex rounded-full border border-gold-400/25 bg-gold-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-gold-100">
                {selectedDistrict.badge}
              </div>
              <h2 className="mt-4 max-w-3xl font-display text-3xl text-ivory sm:text-5xl">
                {selectedDistrict.name}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-ivory/72">
                {selectedDistrict.ambience}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <WorldPill label="Ciel" value={selectedDistrict.sky} />
              <WorldPill label="Flore" value={selectedDistrict.flora} />
              <WorldPill label="Astre" value={selectedDistrict.orb} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
            {DISTRICTS.map((entry) => {
              const active = entry.id === district;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setDistrict(entry.id)}
                  className={`group rounded-[26px] border p-4 text-left transition ${
                    active
                      ? "border-gold-300/45 bg-white/10 shadow-[0_18px_50px_rgba(250,204,21,0.14)]"
                      : "border-white/10 bg-white/[0.04] hover:border-gold-400/30 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-gold-200/70">
                        {entry.badge}
                      </div>
                      <div className="mt-2 font-display text-2xl text-ivory">
                        {entry.name}
                      </div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                      active ? "bg-gold-400/15 text-gold-100" : "bg-white/5 text-ivory/55"
                    }`}>
                      {entry.orb}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ivory/65">
                    {entry.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-ivory/55">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      {entry.sky}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      {entry.signature}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      )}

      <div className={dedicatedMode ? "h-[100dvh] w-screen" : "mt-8 grid gap-4 xl:grid-cols-[1.52fr,0.48fr]"}>
        <section className={dedicatedMode ? "h-[100dvh] overflow-hidden bg-night-950" : "overflow-hidden rounded-[28px] border border-royal-500/30 bg-night-900/70 shadow-[0_24px_80px_rgba(2,6,23,0.45)]"}>
          {!dedicatedMode && (
          <div className="border-b border-royal-500/20 bg-gradient-to-r from-night-900 via-night-900/80 to-night-900/50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gold-300">
                  Hub persistant
                </p>
                <h2 className="mt-1 font-display text-2xl text-gold-200">
                  {selectedDistrict.name}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-ivory/65">
                  {selectedDistrict.description}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ivory/45">
                  {selectedDistrict.mood}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={enterWorldGame}
                  disabled={worldBooting}
                  className="hidden items-center gap-2 rounded-full border border-gold-300/35 bg-gold-500/12 px-4 py-2 text-sm font-semibold text-gold-100 shadow-[0_12px_36px_rgba(250,204,21,0.12)] transition hover:border-gold-200/60 disabled:cursor-wait disabled:opacity-70 md:inline-flex"
                >
                  <Sparkles className="h-4 w-4" />
                  {worldBooting ? "Ouverture..." : "Entrer dans le monde"}
                </button>
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={voiceLoading}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    micEnabled
                      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                      : voiceEnabled
                        ? "border-gold-400/60 bg-gold-500/10 text-gold-100"
                      : "border-royal-500/30 text-ivory/75 hover:border-gold-400/60 hover:text-gold-200"
                  }`}
                >
                  {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {voiceLoading
                    ? "Activation..."
                    : micEnabled
                      ? "Couper le micro"
                      : voiceEnabled
                        ? "Activer le micro"
                        : "Rejoindre le vocal"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {DISTRICTS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setDistrict(entry.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.2em] transition ${
                    entry.id === district
                      ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                      : "border-royal-500/30 text-ivory/60 hover:border-gold-400/45 hover:text-gold-200"
                  }`}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
          )}

            <div className={dedicatedMode ? "relative h-[100dvh] overflow-hidden p-0" : "relative overflow-hidden p-4 md:p-5"}>
              {!dedicatedMode && (
              <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr,0.8fr]">
                <div className="rounded-[24px] border border-white/10 bg-night-950/55 p-4 backdrop-blur-xl">
                <div className="text-[11px] uppercase tracking-[0.24em] text-gold-200/75">
                  Signature visuelle
                </div>
                <div className="mt-2 font-display text-xl text-ivory md:text-2xl">
                  {selectedDistrict.signature}
                </div>
                <p className="mt-2 text-sm leading-6 text-ivory/62">
                  {selectedDistrict.ambience}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                <CompactStat label="Presence" value={String(stageMembers.length + (user ? 1 : 0))} />
                <CompactStat label="Lives" value={String(liveEntries.length)} />
                <CompactStat label="Lueurs" value={String(visibleLueurs.length)} />
                <CompactStat label="Secrets" value={String(districtHotspots.length)} />
              </div>
            </div>
              )}

            {!dedicatedMode && (
            <div className="mb-3 flex justify-end md:hidden">
              <button
                type="button"
                onClick={enterWorldGame}
                disabled={worldBooting}
                className="inline-flex items-center gap-2 rounded-full border border-gold-300/35 bg-gold-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-100 shadow-[0_12px_36px_rgba(250,204,21,0.12)] disabled:cursor-wait disabled:opacity-70"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {worldBooting ? "Ouverture..." : "Entrer dans le monde"}
              </button>
            </div>
            )}

            <div
              ref={mapRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative overflow-hidden border border-white/10 bg-gradient-to-br [perspective:1200px] ${
                worldGameActive
                  ? "fixed inset-0 z-[80] h-[100dvh] w-screen min-h-[100dvh] rounded-none border-0"
                  : "min-h-[420px] rounded-[30px] sm:min-h-[560px] md:min-h-[680px] xl:min-h-[780px]"
              } ${selectedDistrict.accent}`}
            >
              {worldBooting && (
                <div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#05010c] px-5 text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(250,204,21,0.18),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(34,211,238,0.16),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(6,3,16,0.98))]" />
                  <motion.div
                    className="relative w-full max-w-md rounded-[34px] border border-gold-200/20 bg-night-950/72 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                    initial={{ opacity: 0, scale: 0.96, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-gold-200/25 bg-gold-300/10 shadow-[0_0_55px_rgba(250,204,21,0.22)]">
                      <Sparkles className="h-9 w-9 animate-pulse text-gold-200" />
                    </div>
                    <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-gold-200/75">
                      Mode jeu Vaelyndra
                    </p>
                    <h3 className="mt-2 font-display text-3xl text-gold-100">
                      Entrée dans le monde
                    </h3>
                    <p className="mt-3 min-h-6 text-sm text-ivory/70">
                      {WORLD_BOOT_STEPS[worldBootStep]}
                    </p>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-gold-300 via-cyan-200 to-emerald-200"
                        initial={{ width: "8%" }}
                        animate={{
                          width: `${Math.min(100, ((worldBootStep + 1) / WORLD_BOOT_STEPS.length) * 100)}%`,
                        }}
                        transition={{ duration: 0.25 }}
                      />
                    </div>
                    <p className="mt-4 text-xs leading-5 text-ivory/50">
                      Préchargement du rendu 3D, des contrôles tactiles, du vocal et des lueurs visibles.
                    </p>
                  </motion.div>
                </div>
              )}
              {worldSwitchingTo && (
                <div className="absolute inset-0 z-[85] flex items-center justify-center bg-night-950/32 px-5 text-center backdrop-blur-sm">
                  <div className="rounded-[28px] border border-white/12 bg-night-950/82 px-5 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">
                      Changement de monde
                    </p>
                    <p className="mt-2 font-display text-lg text-gold-100">
                      {DISTRICTS.find((entry) => entry.id === worldSwitchingTo)?.name ?? "Nouveau monde"}
                    </p>
                    <p className="mt-1 text-sm text-ivory/68">
                      Synchronisation de la room et de l’avatar...
                    </p>
                  </div>
                </div>
              )}
              <DistrictBackdrop district={district} />
              <DistrictAmbientVeil district={district} activeEvent={ambientEvent} />
              <Suspense
                fallback={
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-night-950/45 text-center backdrop-blur-sm">
                    <div className="rounded-3xl border border-gold-300/20 bg-night-950/75 px-5 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-gold-200">
                        Monde 3D
                      </p>
                      <p className="mt-2 text-sm text-ivory/65">
                        Chargement de la scène temps réel...
                      </p>
                    </div>
                  </div>
                }
              >
                <World3DStage
                  district={district}
                  players={world3DPlayers}
                  lueurs={visibleLueurs}
                  hotspots={districtHotspots}
                  speechBubbles={worldSpeechBubbles}
                  onMove={moveTo}
                  onSelectPlayer={selectWorld3DPlayer}
                  onCollectLueur={collectWorld3DLueur}
                  onTriggerHotspot={triggerWorld3DHotspot}
                />
              </Suspense>

              {ambientEvent?.district === district && (
                <div className="absolute left-4 top-4 z-20 max-w-sm rounded-[24px] border border-gold-300/30 bg-night-950/72 px-4 py-3 backdrop-blur-xl">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
                    Evenement vivant
                  </div>
                  <div className="mt-1 font-display text-lg text-gold-100">
                    {ambientEvent.title}
                  </div>
                  <p className="mt-1 text-sm text-ivory/65">{ambientEvent.copy}</p>
                </div>
              )}

              {lueurBursts.map((burst) => (
                <motion.div
                  key={burst.id}
                  className="pointer-events-none absolute z-[17] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
                  initial={{ opacity: 0.95, y: 0, scale: 0.9 }}
                  animate={{ opacity: 0, y: -34, scale: 1.18 }}
                  transition={{ duration: 0.95, ease: "easeOut" }}
                >
                  <div
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      burst.rarity === "epic"
                        ? "bg-cyan-200/18 text-cyan-100"
                        : burst.rarity === "rare"
                          ? "bg-gold-200/16 text-gold-100"
                          : "bg-white/12 text-ivory"
                    }`}
                  >
                    +{burst.value}
                  </div>
                </motion.div>
              ))}

              <div className="absolute bottom-5 left-5 hidden md:flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveBy(-5, 0)}
                  className="rounded-full border border-royal-500/30 bg-night-950/70 px-3 py-1.5 text-xs text-ivory/75 transition hover:border-gold-400/50"
                >
                  Gauche
                </button>
                <button
                  type="button"
                  onClick={() => moveBy(0, -5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/70 px-3 py-1.5 text-xs text-ivory/75 transition hover:border-gold-400/50"
                >
                  Avancer
                </button>
                <button
                  type="button"
                  onClick={() => moveBy(0, 5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/70 px-3 py-1.5 text-xs text-ivory/75 transition hover:border-gold-400/50"
                >
                  Reculer
                </button>
                <button
                  type="button"
                  onClick={() => moveBy(5, 0)}
                  className="rounded-full border border-royal-500/30 bg-night-950/70 px-3 py-1.5 text-xs text-ivory/75 transition hover:border-gold-400/50"
                >
                  Droite
                </button>
              </div>

              <div
                className={`absolute z-30 rounded-2xl border border-white/10 bg-night-950/70 px-4 py-3 backdrop-blur ${
                  worldGameActive
                    ? "left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] max-w-[min(15rem,42vw)]"
                    : "right-5 top-5 md:bottom-5 md:top-auto"
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ivory/60">
                  <Volume2 className="h-3.5 w-3.5 text-gold-300" />
                  Salon vocal
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ivory/45">
                  {voiceEnabled
                    ? currentChannelId.startsWith("private:")
                      ? "discussion privée active"
                      : micEnabled
                        ? `${worldVoiceConnections} présence${worldVoiceConnections > 1 ? "s" : ""} audio reliée${worldVoiceConnections > 1 ? "s" : ""}`
                        : `écoute active · micro coupé · ${worldVoiceConnections} lien${worldVoiceConnections > 1 ? "s" : ""}`
                    : "vocal non rejoint"}
                </div>
                <div className="mt-3 flex gap-1">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span
                      key={index}
                      className={`${worldGameActive ? "h-7 w-1.5" : "h-10 w-2"} rounded-full bg-emerald-300/15 transition`}
                      style={{
                        background:
                          index < Math.max(1, Math.round(voiceLevel / 10))
                            ? "linear-gradient(180deg, rgba(110,231,183,0.95), rgba(16,185,129,0.35))"
                            : "rgba(148,163,184,0.14)",
                      }}
                    />
                  ))}
                </div>
                {currentChannelId.startsWith("private:") && (
                  <button
                    type="button"
                    disabled={privateVoiceBusy}
                    onClick={() => void leavePrivateVoice()}
                    className="mt-3 w-full rounded-full border border-rose-400/35 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-300/70 disabled:opacity-60"
                  >
                    Quitter le privé
                  </button>
                )}
              </div>

              {worldGameActive && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label="Fermer le menu du monde"
                    onClick={() => setWorldMenuOpen(false)}
                    hidden={!worldMenuOpen}
                  />
                  <div className="absolute right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex items-start gap-2">
                    <div className="rounded-2xl border border-white/10 bg-night-950/58 px-3 py-2 text-right backdrop-blur">
                      <p className="text-[9px] uppercase tracking-[0.22em] text-gold-200/70">
                        Mode monde
                      </p>
                      <p className="font-display text-sm text-gold-100">
                        {selectedDistrict.name}
                      </p>
                      {worldSwitchingTo && (
                        <p className="mt-1 text-[10px] text-ivory/55">
                          Changement vers{" "}
                          {DISTRICTS.find((entry) => entry.id === worldSwitchingTo)?.name ?? "le monde"}...
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setWorldMenuOpen((current) => !current)}
                      className="inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-night-950/76 text-ivory/86 shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-gold-300/45 hover:text-gold-100 active:scale-95"
                      aria-haspopup="menu"
                      aria-expanded={worldMenuOpen}
                      aria-label="Ouvrir le menu du monde"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex items-start gap-2">
                    <button
                      type="button"
                      onClick={openWorldEmotes}
                      className="inline-flex h-11 min-h-11 items-center gap-2 rounded-full border border-emerald-400/30 bg-night-950/76 px-4 text-sm text-emerald-100 shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-emerald-300/55 hover:text-emerald-50 active:scale-95"
                      aria-haspopup="dialog"
                      aria-expanded={worldEmotesOpen}
                      aria-label="Ouvrir les emotes du monde"
                    >
                      ✨ Emotes
                    </button>
                  </div>
                  {worldMenuOpen && (
                    <div className="absolute right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(4rem+env(safe-area-inset-top))] z-50 w-[min(20rem,calc(100vw-1.25rem))] overflow-hidden rounded-[24px] border border-white/12 bg-night-950/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
                      <div className="px-3 pb-2 pt-1">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/68">
                          Menu du monde
                        </p>
                        <p className="mt-1 text-sm text-ivory/62">
                          Micro, changement de monde et chat compact.
                        </p>
                      </div>
                      <div className="space-y-1.5 px-1 pb-1">
                        <button
                          type="button"
                          onClick={() => {
                            void toggleVoice();
                            setWorldMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-ivory/88 transition hover:bg-white/8"
                        >
                          {micEnabled ? <Mic className="h-4 w-4 text-emerald-300" /> : <MicOff className="h-4 w-4 text-slate-300" />}
                          {micEnabled ? "Micro activé" : "Activer le micro"}
                        </button>
                        <button
                          type="button"
                          onClick={openWorldChat}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-ivory/88 transition hover:bg-white/8"
                        >
                          <MessageCircle className="h-4 w-4 text-sky-300" />
                          Ouvrir le chat
                        </button>
                        <div className="mt-2 rounded-2xl border border-white/8 bg-white/4 p-2">
                          <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-ivory/48">
                            Changer de monde
                          </p>
                          <div className="grid gap-1">
                            {DISTRICTS.map((entry) => {
                              const active = entry.id === district;
                              const pending = worldSwitchingTo === entry.id;
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  disabled={active || pending}
                                  onClick={() => switchWorld(entry.id)}
                                  className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                                    active
                                      ? "bg-gold-500/14 text-gold-100"
                                      : "text-ivory/84 hover:bg-white/8"
                                  } disabled:cursor-default disabled:opacity-70`}
                                >
                                  <span>{entry.name}</span>
                                  <span className="text-[10px] uppercase tracking-[0.16em] text-ivory/48">
                                    {active ? "Actuel" : pending ? "..." : "Aller"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={exitWorldGame}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-rose-100 transition hover:bg-rose-500/12"
                        >
                          <X className="h-4 w-4" />
                          Quitter le monde
                        </button>
                      </div>
                    </div>
                  )}
                  {worldEmotesOpen && (
                    <div className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(4rem+env(safe-area-inset-top))] z-50 w-[min(22rem,calc(100vw-1.25rem))] overflow-hidden rounded-[24px] border border-emerald-300/18 bg-night-950/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
                      <div className="px-3 pb-2 pt-1">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/75">
                          Emotes et duos
                        </p>
                        <p className="mt-1 text-sm text-ivory/62">
                          Choisis un joueur pour lui envoyer une interaction ou lance une emote rapide.
                        </p>
                      </div>
                      <div className="grid gap-2 px-1 pb-1 sm:grid-cols-2">
                        {(Object.entries(WORLD_INTERACTION_META) as Array<
                          [WorldCuteInteractionKind, (typeof WORLD_INTERACTION_META)[WorldCuteInteractionKind]]
                        >).map(([kind, meta]) => (
                          <button
                            key={kind}
                            type="button"
                            disabled={memberActionBusy !== null}
                            onClick={() => {
                              setWorldEmotesOpen(false);
                              if (!selectedMember) {
                                notify("Choisis d'abord un joueur pour cette interaction.", "info");
                                return;
                              }
                              void sendCuteAction(kind);
                            }}
                            className="flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-left text-sm text-ivory/86 transition hover:border-emerald-300/35 hover:text-emerald-50 disabled:opacity-50"
                          >
                            <span className="text-lg">{meta.emoji}</span>
                            <span className="leading-5">{meta.label}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={openWorldChat}
                          className="sm:col-span-2 flex items-center gap-3 rounded-2xl border border-sky-300/20 bg-sky-500/8 px-3 py-3 text-left text-sm text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/12"
                        >
                          <MessageCircle className="h-4 w-4 text-sky-300" />
                          Ouvrir le chat du monde
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-[26px] border border-gold-400/25 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.14),transparent_38%),linear-gradient(180deg,rgba(17,24,39,0.82),rgba(17,24,39,0.64))] p-5 shadow-[0_18px_40px_rgba(2,6,23,0.26)]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-300" />
              <h3 className="font-display text-xl text-gold-100">Bourse de lueurs</h3>
            </div>
            <p className="mt-2 text-sm text-ivory/65">
              Explore, réveille les zones secrètes et laisse les événements du monde guider ta collecte.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <CompactStat label="En poche" value={String(lueurPouchTotal)} />
              <CompactStat label="Session" value={String(sessionLueurs)} />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-night-950/55 p-4">
              <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-ivory/55">
                <span>Flux du jour</span>
                <span>{dailyWorldLueurs}/{WORLD_LUEUR_DAILY_CAP}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-300 via-amber-300 to-cyan-300 transition-all"
                  style={{
                    width: `${Math.min(100, (dailyWorldLueurs / WORLD_LUEUR_DAILY_CAP) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-3 text-xs text-ivory/60">
                {syncingLueurs
                  ? "Synchronisation des lueurs en cours..."
                  : queuedLueurs > 0
                    ? `${queuedLueurs} lueur${queuedLueurs > 1 ? "s" : ""} en attente de scellement.`
                    : "Toutes tes lueurs visibles sont déjà scellées."}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-night-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                Exploration active
              </div>
              <div className="mt-2 text-sm text-ivory/70">
                {nearbyHotspot
                  ? `${nearbyHotspot.title} : ${nearbyHotspot.hint}`
                  : `Il reste ${visibleLueurs.length} lueur${visibleLueurs.length > 1 ? "s" : ""} visible${visibleLueurs.length > 1 ? "s" : ""} dans ${selectedDistrict.name.toLowerCase()}.`}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-ivory/60">
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Secrets ouverts : {hiddenSecretsCount}
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Combo : x{Math.max(comboCount, 1)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-royal-500/30 bg-night-900/60 p-5">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-gold-300" />
              <h3 className="font-display text-xl text-gold-200">Ton portail</h3>
            </div>
            <p className="mt-2 text-sm text-ivory/65">
              Avatar, familier et accès rapides vers le reste du royaume.
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to={user ? "/avatar" : "/connexion"}
                className="rounded-2xl border border-royal-500/30 bg-night-950/60 px-4 py-3 text-sm text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200"
              >
                Ouvrir l'atelier avatar
              </Link>
              <Link
                to={user ? "/familier" : "/connexion"}
                className="rounded-2xl border border-royal-500/30 bg-night-950/60 px-4 py-3 text-sm text-ivory/80 transition hover:border-gold-400/60 hover:text-gold-200"
              >
                Gérer mon familier
              </Link>
              <Link
                to={user ? "/live/studio" : "/connexion"}
                className="rounded-2xl border border-gold-400/30 bg-gold-500/10 px-4 py-4 text-base md:py-3 md:text-sm text-gold-100 transition hover:border-gold-300/70 hover:bg-gold-500/15"
              >
                Passer du monde au live studio
              </Link>
            </div>
            {user && (
              <div className="mt-4 rounded-2xl border border-royal-500/30 bg-night-950/55 p-4">
                <div className="flex items-center gap-3">
                  <AvatarImage
                    candidates={[profile?.avatarImageUrl, user.avatar]}
                    fallbackSeed={user.id}
                    alt={user.username}
                    className="h-12 w-12 rounded-2xl object-cover"
                  />
                  <div>
                    <div className="font-display text-gold-200">{user.username}</div>
                    <Handle handle={profile?.handle ?? user.handle} className="text-xs" />
                  </div>
                </div>
                {activeFamiliar ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-2xl"
                      style={{
                        background: `${activeFamiliar.color}22`,
                        boxShadow: `0 0 22px -8px ${activeFamiliar.color}`,
                      }}
                    >
                      {activeFamiliar.icon}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-ivory/90">
                        {activeFamiliar.nickname ?? activeFamiliar.name}
                      </div>
                      <div className="text-xs text-ivory/55">
                        Niveau {activeFamiliar.level} · compagnon actif
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-ivory/55">
                    Choisis un familier pour l'emmener dans les Mondes.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-[26px] border border-royal-500/30 bg-night-900/60 p-5">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-rose-300" />
              <h3 className="font-display text-xl text-gold-200">Lives visibles</h3>
            </div>
            <div className="mt-4 space-y-3">
              {liveEntries.length > 0 ? (
                liveEntries.slice(0, 3).map((entry) => (
                  <Link
                    key={entry.userId}
                    to={`/live/${entry.userId}`}
                    className="block rounded-2xl border border-royal-500/30 bg-night-950/60 p-3 transition hover:border-gold-400/60"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarImage
                        candidates={[entry.avatar]}
                        fallbackSeed={entry.userId}
                        alt={entry.username}
                        className="h-12 w-12 rounded-2xl object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-display text-gold-200">
                          {entry.title || `${entry.username} est en direct`}
                        </div>
                        <div className="truncate text-xs text-ivory/55">
                          {entry.username} · {formatRelative(entry.startedAt)}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-2xl border border-royal-500/25 bg-night-950/55 p-4 text-sm text-ivory/55">
                  Aucun streamer visible pour l'instant. L'observatoire s'animera dès le prochain direct.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[26px] border border-royal-500/30 bg-night-900/60 p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-cyan-300" />
              <h3 className="font-display text-xl text-gold-200">Événements</h3>
            </div>
            <div className="mt-4 space-y-3">
              {ambientEvent && (
                <div className="rounded-2xl border border-gold-300/30 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.6))] p-4 shadow-[0_16px_40px_rgba(250,204,21,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">
                      En cours dans {labelForDistrict(ambientEvent.district)}
                    </div>
                    <span className="rounded-full border border-gold-300/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-gold-100">
                      +{ambientEvent.bonusLueurs} lueurs réveillées
                    </span>
                  </div>
                  <div className="mt-2 font-display text-gold-100">{ambientEvent.title}</div>
                  <p className="mt-1 text-sm text-ivory/65">{ambientEvent.copy}</p>
                </div>
              )}
              {EVENT_BOARD.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-royal-500/30 bg-night-950/60 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">
                    {event.schedule}
                  </div>
                  <div className="mt-1 font-display text-gold-200">{event.title}</div>
                  <p className="mt-1 text-sm text-ivory/60">{event.copy}</p>
                  <button
                    type="button"
                    onClick={() => notify(`Inscription ajoutée : ${event.title}`, "success")}
                    className="mt-3 rounded-full border border-gold-400/35 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-gold-100 transition hover:border-gold-300/70"
                  >
                    Rejoindre
                  </button>
                </div>
              ))}
            </div>
          </section>

          {worldGameActive && !worldChatExpanded ? (
            <button
              type="button"
              onClick={openWorldChat}
              className={`fixed z-[96] inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-night-950/88 px-4 py-2 text-sm text-sky-100 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-sky-300/40 hover:text-sky-50 active:scale-95 ${
                worldLandscapeMode
                  ? "left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))]"
                  : "left-[calc(0.9rem+env(safe-area-inset-left))] bottom-[calc(0.9rem+env(safe-area-inset-bottom))]"
              }`}
              aria-label="Ouvrir le chat du monde"
            >
              <MessageCircle className="h-4 w-4" />
              Chat
              <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-200/80">
                {chatMessages.length}
              </span>
            </button>
          ) : (
            <section
              className={`rounded-[26px] border border-royal-500/30 bg-night-900/60 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] ${
                worldGameActive
                  ? `fixed z-[95] w-[min(${worldLandscapeMode ? "19rem" : "21rem"},calc(100vw-1rem))] overflow-hidden backdrop-blur-xl touch-pan-y overscroll-contain md:w-[min(22rem,calc(100vw-2rem))] ${
                      worldLandscapeMode
                        ? `left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] max-h-[calc(100dvh-1.5rem)] ring-1 ring-sky-300/20 shadow-[0_20px_50px_rgba(0,0,0,0.18),0_0_0_1px_rgba(125,211,252,0.08)]`
                        : `left-[calc(0.9rem+env(safe-area-inset-left))] bottom-[calc(0.9rem+env(safe-area-inset-bottom))] max-h-[min(30rem,calc(100dvh-5rem))] ring-1 ring-sky-300/20 shadow-[0_20px_50px_rgba(0,0,0,0.18),0_0_0_1px_rgba(125,211,252,0.08)]`
                    }`
                  : ""
              }`}
              onPointerDownCapture={(event) => {
                if (worldGameActive) event.stopPropagation();
              }}
            >
              <div className={`flex items-center gap-2 ${worldChatAttention > 0 ? "animate-[socialLikeBurst_900ms_ease-out_1]" : ""}`}>
                <Sparkles className="h-4 w-4 text-gold-300" />
                <h3 className="font-display text-lg text-gold-200">Chat du monde</h3>
                <button
                  type="button"
                  onClick={() => setWorldChatExpanded(false)}
                  className="ml-auto rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/55 transition hover:border-gold-300/35 hover:text-gold-100"
                  aria-label="Réduire le chat du monde"
                >
                  Réduire
                </button>
              </div>
              <div
                className={`mt-3 space-y-2 overflow-y-auto pr-1 ${
                  worldGameActive
                    ? worldLandscapeMode
                      ? "max-h-[min(15rem,calc(100dvh-10rem))]"
                      : "max-h-[min(17rem,calc(100dvh-8rem))]"
                    : "max-h-none"
                }`}
              >
                {chatMessages.slice(0, worldGameActive ? 4 : 6).map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl border px-3 py-2 ${
                      message.tone === "system"
                        ? "border-gold-400/20 bg-gold-500/8"
                        : "border-royal-500/25 bg-night-950/55"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-ivory/90">
                            {message.author}
                          </div>
                          {message.district && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ivory/55">
                              {labelForDistrict(message.district)}
                            </span>
                          )}
                        </div>
                        {message.handle && <Handle handle={message.handle} className="text-[11px]" />}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-ivory/40">
                        {formatRelative(message.createdAt)}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-ivory/70">{message.content}</p>
                  </div>
                ))}
              </div>
              <div
                className={`mt-3 flex gap-2 ${
                  worldGameActive ? (worldLandscapeMode ? "flex-col items-stretch" : "items-end") : ""
                }`}
              >
                <input
                  key={`world-chat-${worldChatExpanded ? "open" : "closed"}-${worldChatAttention}`}
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendMessage();
                  }}
                  placeholder="Dire quelque chose dans le hub..."
                  data-world-chat-input="true"
                  inputMode="text"
                  enterKeyHint="send"
                  autoComplete="off"
                  autoFocus={worldChatExpanded}
                  className={`glass-input flex-1 ${worldGameActive ? "min-h-11 text-sm" : ""} ${worldLandscapeMode ? "w-full" : ""}`}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  className={`rounded-full border border-gold-400/35 px-4 py-2 text-sm text-gold-100 transition hover:border-gold-300/70 ${
                    worldGameActive ? "min-h-11" : ""
                  } ${worldLandscapeMode ? "w-full" : ""}`}
                >
                  Envoyer
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      {selectedMember && (
        <>
          <button
            type="button"
            aria-label="Fermer le menu joueur"
            onClick={() => setSelectedMember(null)}
            className="fixed inset-0 z-30 bg-transparent"
          />
          <section
            className={`fixed z-40 rounded-[28px] border border-royal-500/35 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.5)] backdrop-blur-xl ${
              isCompactMenu
                ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 max-w-none"
                : "w-[min(360px,calc(100vw-2rem))]"
            }`}
            style={
              isCompactMenu
                ? undefined
                : {
                    left: Math.max(
                      16,
                      Math.min(
                        (selectedMember.anchor?.x ?? 220) - 150,
                        window.innerWidth - 376,
                      ),
                    ),
                    top: Math.max(
                      96,
                      Math.min(
                        (selectedMember.anchor?.y ?? 180) - 24,
                        window.innerHeight - 440,
                      ),
                    ),
                  }
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <AvatarImage
                  candidates={[
                    selectedMember.profile?.avatarImageUrl ?? selectedMember.member.avatarImageUrl,
                  ]}
                  fallbackSeed={selectedMember.member.id}
                  alt={selectedMember.member.username}
                  className="h-14 w-14 rounded-[20px] object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate font-display text-xl text-gold-100">
                    {selectedMember.profile?.username ?? selectedMember.member.username}
                  </div>
                  <Handle
                    handle={selectedMember.profile?.handle ?? selectedMember.member.handle}
                    className="text-xs"
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-ivory/55">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      {selectedMember.profile?.followersCount ?? 0} abonnes
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      {selectedMember.member.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-full border border-white/10 p-2 text-ivory/60 transition hover:border-gold-300/40 hover:text-gold-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                  Liens rapides
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/u/${selectedMember.member.id}`}
                    className="rounded-full border border-gold-400/35 px-3 py-2 text-sm text-gold-100 transition hover:border-gold-300/70"
                  >
                    Voir le profil
                  </Link>
                  {user && user.id !== selectedMember.member.id && (
                    <Link
                      to={`/messages/${encodeURIComponent(selectedMember.member.id)}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Ecrire
                    </Link>
                  )}
                  {selectedMember.profile && (
                    <FollowButton
                      targetId={selectedMember.profile.id}
                      targetUsername={selectedMember.profile.username}
                      onChange={(nowFollowing) =>
                        setSelectedMember((current) =>
                          current && current.profile
                            ? {
                                ...current,
                                profile: {
                                  ...current.profile,
                                  followersCount:
                                    current.profile.followersCount + (nowFollowing ? 1 : -1),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                    Emotes à deux
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">
                    {selectedMember.member.id === user?.id ? "toi" : "cible choisie"}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(Object.entries(WORLD_INTERACTION_META) as Array<
                    [WorldCuteInteractionKind, (typeof WORLD_INTERACTION_META)[WorldCuteInteractionKind]]
                  >).map(([kind, meta]) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={memberActionBusy !== null}
                      onClick={() => void sendCuteAction(kind)}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-3 text-left text-sm text-ivory/82 transition hover:border-gold-300/35 hover:text-gold-100 disabled:opacity-50"
                    >
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="leading-5">{meta.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                    Discussion vocale privée
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ivory/45">
                    {currentChannelId.startsWith("private:") ? "canal privé" : "canal de zone"}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {myWorldPresence?.pendingVoiceInviteFromUserId === selectedMember.member.id ? (
                    <>
                      <button
                        type="button"
                        disabled={privateVoiceBusy}
                        onClick={() => void respondPrivateVoice(selectedMember.member.id, true)}
                        className="rounded-full border border-emerald-400/45 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 transition hover:border-emerald-300/70 disabled:opacity-60"
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        disabled={privateVoiceBusy}
                        onClick={() => void respondPrivateVoice(selectedMember.member.id, false)}
                        className="rounded-full border border-white/10 px-3 py-2 text-sm text-ivory/80 transition hover:border-gold-300/35 disabled:opacity-60"
                      >
                        Refuser
                      </button>
                    </>
                  ) : privateVoicePartnerId === selectedMember.member.id ? (
                    <button
                      type="button"
                      disabled={privateVoiceBusy}
                      onClick={() => void leavePrivateVoice()}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-400/45 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 transition hover:border-rose-300/70 disabled:opacity-60"
                    >
                      <Volume2 className="h-4 w-4" />
                      Quitter le vocal privé
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        privateVoiceBusy ||
                        !!myWorldPresence?.pendingVoiceInviteToUserId ||
                        !!myWorldPresence?.pendingVoiceInviteFromUserId ||
                        (!!privateVoicePartnerId && privateVoicePartnerId !== selectedMember.member.id)
                      }
                      onClick={() => void requestPrivateVoice(selectedMember.member.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-gold-400/35 px-3 py-2 text-sm text-gold-100 transition hover:border-gold-300/70 disabled:opacity-50"
                    >
                      <Volume2 className="h-4 w-4" />
                      {myWorldPresence?.pendingVoiceInviteToUserId === selectedMember.member.id
                        ? "Invitation envoyée"
                        : "Discussion vocale privée"}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </section>
                </>
              )}

      {pendingIncomingVoiceInvite && !selectedMember && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(8,47,73,0.82))] px-4 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">
              Invitation vocale privée
            </div>
            <div className="mt-1 text-sm text-ivory/80">
              {pendingIncomingVoiceInvite.username} souhaite discuter en tête-à-tête.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={privateVoiceBusy}
              onClick={() => void respondPrivateVoice(pendingIncomingVoiceInvite.userId, true)}
              className="rounded-full border border-emerald-400/45 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 transition hover:border-emerald-300/70 disabled:opacity-60"
            >
              Accepter
            </button>
            <button
              type="button"
              disabled={privateVoiceBusy}
              onClick={() => void respondPrivateVoice(pendingIncomingVoiceInvite.userId, false)}
              className="rounded-full border border-white/10 px-3 py-2 text-sm text-ivory/80 transition hover:border-gold-300/35 disabled:opacity-60"
            >
              Refuser
            </button>
          </div>
        </section>
      )}

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorldFact
          icon={<Crown className="h-4 w-4" />}
          title="Hub social persistant"
          copy="Présence des membres, zones distinctes et circulation libre dans la place."
        />
        <WorldFact
          icon={<Mic className="h-4 w-4" />}
          title="Chat vocal de zone"
          copy="Le micro relie maintenant les membres presents dans la meme zone du monde avec un vrai canal audio temps reel."
        />
        <WorldFact
          icon={<Radio className="h-4 w-4" />}
          title="Pont vers les lives"
          copy="L'observatoire relie directement le monde social et les streamers actifs."
        />
        <WorldFact
          icon={<Sparkles className="h-4 w-4" />}
          title="Lueurs a collecter"
          copy="Chaque monde révèle ses propres éclats, secrets et mini-événements pour récompenser l'exploration."
        />
      </section>
    </div>
  );
}

function WorldPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.24em] text-gold-200/70">{label}</div>
      <div className="mt-2 text-sm text-ivory/80">{value}</div>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-night-950/55 px-4 py-3 backdrop-blur">
      <div className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">{label}</div>
      <div className="mt-2 font-display text-lg text-gold-100 md:text-xl">{value}</div>
    </div>
  );
}
function WorldFact({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-[26px] border border-royal-500/30 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.8),rgba(15,23,42,0.56))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.25)]">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/10 text-gold-200">
        {icon}
      </div>
      <div className="mt-4 font-display text-xl text-gold-100">{title}</div>
      <p className="mt-2 text-sm leading-6 text-ivory/65">{copy}</p>
    </div>
  );
}

function DistrictAmbientVeil({
  district,
  activeEvent,
}: {
  district: DistrictId;
  activeEvent: WorldAmbientEvent | null;
}) {
  const palette =
    district === "arcades"
      ? {
          glow: "bg-cyan-300/12",
          beam: "from-cyan-300/14 via-sky-300/8 to-transparent",
          spark: "bg-cyan-100/80",
          ring: "border-cyan-200/20",
        }
      : district === "observatory"
        ? {
            glow: "bg-fuchsia-300/10",
            beam: "from-fuchsia-300/14 via-purple-300/10 to-transparent",
            spark: "bg-white/85",
            ring: "border-fuchsia-100/20",
          }
        : {
            glow: "bg-gold-300/12",
            beam: "from-gold-300/14 via-amber-300/10 to-transparent",
            spark: "bg-gold-100/85",
            ring: "border-gold-100/20",
          };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`absolute inset-x-[10%] top-[8%] h-28 rounded-full blur-3xl ${palette.glow}`} />
      <div className={`absolute inset-x-0 top-[18%] h-40 bg-gradient-to-r ${palette.beam}`} />
      {Array.from({ length: 5 }).map((_, index) => (
        <motion.span
          key={`${district}-spark-${index}`}
          className={`absolute h-1.5 w-1.5 rounded-full shadow-[0_0_16px_rgba(255,255,255,0.35)] ${palette.spark}`}
          style={{
            left: `${14 + index * 16}%`,
            top: `${18 + ((index * 9) % 46)}%`,
          }}
          animate={{
            y: [0, -10 - index, 0],
            opacity: [0.25, 0.95, 0.3],
            scale: [0.8, 1.15, 0.85],
          }}
          transition={{
            duration: 5 + index * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.25,
          }}
        />
      ))}
      {activeEvent?.district === district && (
        <>
          <motion.div
            className={`absolute inset-x-[18%] top-[24%] h-32 rounded-full blur-3xl ${palette.glow}`}
            animate={{ opacity: [0.2, 0.5, 0.25], scale: [0.96, 1.06, 0.98] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`absolute left-1/2 top-[44%] h-44 w-44 -translate-x-1/2 rounded-full border ${palette.ring}`}
            animate={{ scale: [0.8, 1.18], opacity: [0.5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
        </>
      )}
    </div>
  );
}

function DistrictBackdrop({ district }: { district: DistrictId }) {
  if (district === "arcades") {
    return (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(253,224,71,0.18),transparent_18%),radial-gradient(circle_at_82%_16%,rgba(34,211,238,0.18),transparent_24%),linear-gradient(180deg,rgba(37,99,235,0.12),rgba(2,6,23,0.86))]" />
        <div className="absolute left-[8%] top-[8%] h-20 w-20 rounded-full bg-amber-200/65 blur-[2px] shadow-[0_0_70px_rgba(253,224,71,0.45)]" />
        <div className="absolute inset-x-[8%] top-[18%] h-44 rounded-[40px] border border-cyan-200/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.04))]" />
        <div className="absolute left-[8%] top-[20%] h-44 w-32 rounded-[32px] border border-cyan-200/20 bg-cyan-300/8 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur" />
        <div className="absolute left-[27%] top-[16%] h-52 w-24 rounded-[28px] border border-sky-200/18 bg-sky-300/8 backdrop-blur" />
        <div className="absolute right-[10%] top-[18%] h-48 w-36 rounded-[36px] border border-indigo-200/18 bg-indigo-300/8 shadow-[0_0_50px_rgba(129,140,248,0.12)] backdrop-blur" />
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={`arcade-flower-${index}`}
            className="absolute rounded-full border border-cyan-200/18 bg-cyan-200/10 backdrop-blur"
            style={{
              left: `${8 + index * 12}%`,
              bottom: `${15 + (index % 3) * 2}%`,
              width: `${18 + (index % 2) * 8}px`,
              height: `${18 + (index % 2) * 8}px`,
              boxShadow: "0 0 18px rgba(103,232,249,0.18)",
            }}
          />
        ))}
        <div className="absolute inset-x-[10%] bottom-[10%] h-24 rounded-[28px] border border-cyan-300/15 bg-[linear-gradient(90deg,rgba(34,211,238,0.1),rgba(56,189,248,0.04),rgba(99,102,241,0.14))]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-emerald-950 via-emerald-900/78 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[radial-gradient(circle_at_12px_100%,rgba(16,185,129,0.9),transparent_45%),radial-gradient(circle_at_44px_100%,rgba(74,222,128,0.7),transparent_42%),radial-gradient(circle_at_76px_100%,rgba(21,128,61,0.85),transparent_44%)] bg-[length:88px_100%] opacity-90" />
      </>
    );
  }

  if (district === "observatory") {
    return (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.16),transparent_22%),radial-gradient(circle_at_70%_20%,rgba(196,181,253,0.14),transparent_20%),linear-gradient(180deg,rgba(10,10,35,0.08),rgba(3,7,18,0.9))]" />
        <div className="absolute right-[14%] top-[10%] h-24 w-24 rounded-full border border-white/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95),rgba(224,231,255,0.74)_38%,rgba(147,197,253,0.12)_70%)] shadow-[0_0_80px_rgba(226,232,240,0.35)]" />
        <div className="absolute left-1/2 top-[9%] h-56 w-[72%] -translate-x-1/2 rounded-t-[180px] border border-fuchsia-200/14 bg-fuchsia-200/4 backdrop-blur-[2px]" />
        <div className="absolute left-[14%] top-[22%] h-20 w-36 rounded-[24px] border border-rose-200/16 bg-rose-200/8 shadow-[0_0_28px_rgba(244,114,182,0.12)] backdrop-blur" />
        <div className="absolute right-[12%] top-[22%] h-24 w-40 rounded-[26px] border border-purple-200/16 bg-purple-200/8 shadow-[0_0_36px_rgba(192,132,252,0.12)] backdrop-blur" />
        <div className="absolute left-1/2 top-[46%] h-32 w-[44%] -translate-x-1/2 rounded-[50%] border border-fuchsia-200/18 bg-night-950/64 shadow-[0_0_60px_rgba(192,132,252,0.12)]" />
        {Array.from({ length: 14 }).map((_, index) => (
          <span
            key={`star-${index}`}
            className="absolute h-1.5 w-1.5 rounded-full bg-white/80"
            style={{
              left: `${12 + ((index * 13) % 76)}%`,
              top: `${8 + ((index * 9) % 22)}%`,
              boxShadow: "0 0 14px rgba(255,255,255,0.55)",
            }}
          />
        ))}
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`moon-flower-${index}`}
            className="absolute rounded-full border border-fuchsia-100/18 bg-fuchsia-100/10"
            style={{
              left: `${16 + index * 14}%`,
              bottom: `${13 + (index % 2) * 3}%`,
              width: `${14 + (index % 2) * 6}px`,
              height: `${14 + (index % 2) * 6}px`,
              boxShadow: "0 0 22px rgba(244,114,182,0.16)",
            }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-emerald-950 via-emerald-900/68 to-transparent opacity-95" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[radial-gradient(circle_at_14px_100%,rgba(203,213,225,0.78),transparent_40%),radial-gradient(circle_at_42px_100%,rgba(167,243,208,0.38),transparent_38%),radial-gradient(circle_at_72px_100%,rgba(190,242,100,0.32),transparent_38%)] bg-[length:88px_100%] opacity-80" />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,247,204,0.22),transparent_24%),linear-gradient(180deg,rgba(4,10,24,0.08),rgba(4,10,24,0.8))]" />
      <div className="absolute left-1/2 top-[12%] h-24 w-24 -translate-x-1/2 rounded-full bg-amber-200/85 shadow-[0_0_95px_rgba(251,191,36,0.5)]" />
      <div className="absolute inset-x-[8%] top-[12%] h-28 rounded-full bg-gold-300/12 blur-3xl" />
      <div className="absolute left-[18%] top-[34%] h-28 w-28 rounded-full border border-gold-200/18 bg-gold-200/10 shadow-[0_0_28px_rgba(250,204,21,0.12)]" />
      <div className="absolute left-1/2 top-[36%] h-36 w-36 -translate-x-1/2 rounded-full border border-gold-200/20 bg-[radial-gradient(circle,rgba(255,255,255,0.1),rgba(250,204,21,0.12),transparent_68%)]" />
      <div className="absolute left-1/2 top-[41%] h-14 w-14 -translate-x-1/2 rounded-full border border-gold-100/30 bg-gold-100/15" />
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`place-flower-${index}`}
          className="absolute rounded-full border border-rose-100/18 bg-rose-100/12"
          style={{
            left: `${10 + index * 10}%`,
            bottom: `${14 + (index % 3) * 2}%`,
            width: `${14 + (index % 2) * 8}px`,
            height: `${14 + (index % 2) * 8}px`,
            boxShadow: "0 0 18px rgba(251,191,36,0.12)",
          }}
        />
      ))}
      <div className="absolute inset-x-[6%] bottom-[18%] h-20 rounded-[30px] border border-gold-300/10 bg-gold-300/8 opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-emerald-950 via-emerald-900/78 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-[radial-gradient(circle_at_12px_100%,rgba(34,197,94,0.9),transparent_40%),radial-gradient(circle_at_36px_100%,rgba(163,230,53,0.74),transparent_40%),radial-gradient(circle_at_70px_100%,rgba(21,128,61,0.9),transparent_44%)] bg-[length:84px_100%] opacity-90" />
      <div className="absolute bottom-[-6%] left-[12%] right-[12%] h-44 rounded-[50%] border border-gold-300/10 bg-night-950/44 blur-[2px]" />
    </>
  );
}

function labelForDistrict(district: DistrictId) {
  return DISTRICTS.find((entry) => entry.id === district)?.name ?? "Monde";
}

function createInitialLueurNodes(): Record<DistrictId, WorldLueurNode[]> {
  return {
    place: DISTRICT_LUEURS.place.map((entry) => ({ ...entry, district: "place", availableAt: 0 })),
    arcades: DISTRICT_LUEURS.arcades.map((entry) => ({ ...entry, district: "arcades", availableAt: 0 })),
    observatory: DISTRICT_LUEURS.observatory.map((entry) => ({
      ...entry,
      district: "observatory",
      availableAt: 0,
    })),
  };
}

function progressStorageKey(userId: string | null) {
  return `${LUEUR_STORAGE_PREFIX}:${userId ?? "guest"}`;
}

function readWorldLueurProgress(userId: string | null) {
  if (typeof window === "undefined") {
    return { total: 0, hotspots: {} as Record<string, boolean> };
  }

  try {
    const raw = window.localStorage.getItem(progressStorageKey(userId));
    if (!raw) {
      return { total: 0, hotspots: {} as Record<string, boolean> };
    }

    const parsed = JSON.parse(raw) as {
      day?: string;
      total?: number;
      hotspots?: string[];
    };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.day !== today) {
      return { total: 0, hotspots: {} as Record<string, boolean> };
    }

    return {
      total: Number.isFinite(parsed.total) ? Math.max(0, parsed.total ?? 0) : 0,
      hotspots: Object.fromEntries((parsed.hotspots ?? []).map((entry) => [entry, true])),
    };
  } catch {
    return { total: 0, hotspots: {} as Record<string, boolean> };
  }
}

function writeWorldLueurProgress(
  userId: string | null,
  payload: { total: number; hotspots: Record<string, boolean> },
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      progressStorageKey(userId),
      JSON.stringify({
        day: new Date().toISOString().slice(0, 10),
        total: Math.max(0, payload.total),
        hotspots: Object.keys(payload.hotspots).filter((entry) => payload.hotspots[entry]),
      }),
    );
  } catch {
    // Ignore storage failures and keep the world playable.
  }
}

function distancePct(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
