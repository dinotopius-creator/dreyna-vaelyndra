import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Crown,
  Heart,
  MessageCircle,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { FollowButton } from "../components/FollowButton";
import { Handle } from "../components/Handle";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import { useWorldVoice } from "../contexts/WorldVoiceContext";
import {
  apiApplyWalletDelta,
  apiGetProfile,
  apiHeartbeatWorldPresence,
  apiLeaveWorldPresence,
  apiListWorldPresence,
  type UserProfileDto,
  type WorldPresenceDto,
} from "../lib/api";
import {
  fetchUserFamiliars,
  type OwnedFamiliar,
} from "../lib/familiarsApi";
import { formatRelative } from "../lib/helpers";

type DistrictId = "place" | "arcades" | "observatory";

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
  x: number;
  y: number;
  status: string;
  aura: string;
  voiceEnabled: boolean;
}

interface SelectedWorldMember {
  member: StageMember;
  profile: UserProfileDto | null;
  loading: boolean;
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
    ambience: "Les vitrines flottent dans un jardin electrique, entoure d'herbe vive et de fleurs qui reprennent les couleurs des creations.",
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
    ambience: "Une scene de nuit claire avec lune, etoiles, halos et herbes argentees pour donner au live une allure ceremonielle.",
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
    { id: "arcade-lueur-5", x: 67, y: 70, value: 1, rarity: "common", label: "petale electrique", respawnMs: 18000 },
    { id: "arcade-lueur-6", x: 78, y: 52, value: 3, rarity: "epic", label: "maquette inspiree", respawnMs: 34000 },
  ],
  observatory: [
    { id: "obs-lueur-1", x: 16, y: 64, value: 1, rarity: "common", label: "poussiere d'etoile", respawnMs: 18000 },
    { id: "obs-lueur-2", x: 29, y: 38, value: 2, rarity: "rare", label: "givre astral", respawnMs: 25000 },
    { id: "obs-lueur-3", x: 45, y: 60, value: 1, rarity: "common", label: "halo lunaire", respawnMs: 19000 },
    { id: "obs-lueur-4", x: 58, y: 34, value: 2, rarity: "rare", label: "comete lente", respawnMs: 26000 },
    { id: "obs-lueur-5", x: 72, y: 72, value: 1, rarity: "common", label: "filament froid", respawnMs: 18000 },
    { id: "obs-lueur-6", x: 84, y: 50, value: 3, rarity: "epic", label: "eclat de meteore", respawnMs: 36000 },
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
      hint: "Les fleurs repondent aux membres patients.",
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
      description: "Les vitrines retiennent des impulsions de couleur et relachent parfois une serie d'eclats.",
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
      resonance: "Une pulsation cyan traverse les panneaux et reveille des lueurs de vitrine.",
    },
  ],
  observatory: [
    {
      id: "observatory-moonwell",
      district: "observatory",
      title: "Puits lunaire",
      hint: "La pierre refracte les meteorites lentes.",
      description: "Un puits de nuit retient les fragments tombes des constellations.",
      x: 64,
      y: 35,
      radius: 11,
      reward: 6,
      glyph: "L",
      resonance: "Le dome reflète la lune et fait pleuvoir quelques eclats rares.",
    },
    {
      id: "observatory-rail",
      district: "observatory",
      title: "Rail des cometes",
      hint: "Quand le ciel change, les rails se remettent a murmurer.",
      description: "Les passerelles celestes accumulent une charge lumineuse qui ne se montre pas a tout le monde.",
      x: 24,
      y: 54,
      radius: 10,
      reward: 4,
      glyph: "C",
      resonance: "Une trame froide traverse le balcon et reveille la bordure du ciel.",
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
      copy: "Les vitrines se synchronisent. Quelques eclats de creation deviennent visibles.",
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
      title: "Derive meteore",
      copy: "Une trainee lente coupe le dome et reveille des lueurs plus rares.",
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

export function Worlds() {
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
  const [worldMembers, setWorldMembers] = useState<WorldPresenceDto[]>([]);
  const [selectedMember, setSelectedMember] = useState<SelectedWorldMember | null>(null);
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

  const {
    voiceEnabled,
    voiceLoading,
    voiceLevel,
    connectionCount: worldVoiceConnections,
    error: worldVoiceError,
    toggleVoice,
    VoiceAudioLayer,
  } = useWorldVoice({
    worldId: WORLD_ID,
    userId: user?.id,
    district,
    members: worldMembers,
  });

  const mapRef = useRef<HTMLDivElement | null>(null);
  function handlePointerDown() {
    // Clicking or tapping the map should not teleport the player.
  }

  function handlePointerMove() {
    // Movement stays on dedicated controls to preserve player interactions.
  }

  function handlePointerUp() {
    // Movement stays on dedicated controls to preserve player interactions.
  }

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
          status: liveMatch ? "en live" : entry.district === "observatory" ? "observe" : "dans le monde",
          aura: liveMatch
            ? "shadow-[0_0_38px_rgba(244,63,94,0.32)]"
            : palette[index % palette.length],
          voiceEnabled: entry.voiceEnabled,
        };
      });
  }, [district, liveEntries, user?.id, worldMembers]);

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
    writeWorldLueurProgress(user?.id ?? null, {
      total: dailyWorldLueurs,
      hotspots: discoveredHotspots,
    });
  }, [dailyWorldLueurs, discoveredHotspots, user?.id]);

  useEffect(() => {
    setSelectedMember(null);
  }, [district]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPresence() {
      try {
        const entries = await apiListWorldPresence(WORLD_ID);
        if (!cancelled) setWorldMembers(entries);
      } catch {
        if (!cancelled) setWorldMembers([]);
      }
    }

    void refreshPresence();
    const timer = window.setInterval(refreshPresence, 1200); // poll more frequently for smoother movement
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

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
        notify("Les lueurs vibrent encore hors ligne. Elles seront retentees.", "info");
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
      void apiLeaveWorldPresence(WORLD_ID).catch(() => undefined);
    };
  }, [district, position.x, position.y, user, voiceEnabled]);

  useEffect(() => {
    if (!worldVoiceError) return;
    if (worldVoiceError === "duplicate-peer") {
      notify("Le vocal du monde est deja ouvert dans un autre onglet.", "info");
      return;
    }
    if (worldVoiceError === "audio-unsupported") {
      notify("Le vocal du monde n'est pas supporte sur cet appareil.", "error");
      return;
    }
    notify("Le vocal du monde a rencontre une erreur. Verifie ton micro.", "error");
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

  function sendMessage() {
    const cleaned = chatInput.trim();
    if (!cleaned) return;
    const author = user?.username ?? "Visiteur";
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

  async function openMemberCard(member: StageMember) {
    setSelectedMember({ member, profile: null, loading: true });
    try {
      const memberProfile = await apiGetProfile(member.id);
      setSelectedMember({ member, profile: memberProfile, loading: false });
    } catch {
      setSelectedMember({ member, profile: null, loading: false });
    }
  }

  function sendCuteAction(kind: "wave" | "sparkle") {
    if (!selectedMember) return;
    const target = selectedMember.profile?.username ?? selectedMember.member.username;
    const actor = user?.username ?? "Visiteur";
    const content =
      kind === "wave"
        ? `${actor} salue ${target} avec une reverence lumineuse.`
        : `${actor} envoie une pluie d'etincelles a ${target}.`;
    addWorldMessage("Lien social", content);
    notify(kind === "wave" ? `Salut envoye a ${target}.` : `Eclat envoye a ${target}.`, "success");
  }

  function awardWorldLueurs(rawAmount: number, reason: string) {
    if (rawAmount <= 0) return 0;
    const remaining = Math.max(0, WORLD_LUEUR_DAILY_CAP - dailyWorldLueurs);
    const granted = Math.min(rawAmount, remaining);
    if (!granted) {
      notify("Le flux quotidien de lueurs a deja ete capte pour aujourd'hui.", "info");
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
      addWorldMessage("Lueurs", `${reason} reveille ${granted} lueurs autour de toi.`);
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
          ? `${hotspot.title} revele +${granted} lueurs.`
          : `${hotspot.title} laisse encore filer une lueur.`,
        "success",
      );
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
      <VoiceAudioLayer />
      <SectionHeading
        eyebrow="Mondes"
        title={
          <>
            La place <span className="text-mystic">virtuelle</span> de Vaelyndra
          </>
        }
        subtitle="Un hub social vivant où les membres se déplacent avec leur familier, repèrent les lives en direct et rejoignent les événements du royaume."
      />

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

      <div className="mt-8 grid gap-4 xl:grid-cols-[1.52fr,0.48fr]">
        <section className="overflow-hidden rounded-[28px] border border-royal-500/30 bg-night-900/70 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
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
              <button
                type="button"
                onClick={toggleVoice}
                disabled={voiceLoading}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  voiceEnabled
                    ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                    : "border-royal-500/30 text-ivory/75 hover:border-gold-400/60 hover:text-gold-200"
                }`}
              >
                {voiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {voiceLoading
                  ? "Activation..."
                  : voiceEnabled
                    ? "Chat vocal actif"
                    : "Activer le chat vocal"}
              </button>
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

          <div className="relative overflow-hidden p-4 md:p-5">
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

            <div
              ref={mapRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative min-h-[320px] sm:min-h-[500px] md:min-h-[620px] xl:min-h-[760px] overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br ${selectedDistrict.accent}`}
            >
              <DistrictBackdrop district={district} />
              <DistrictAmbientVeil district={district} activeEvent={ambientEvent} />

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

              {districtHotspots.map((hotspot) => {
                const nearHotspot =
                  distancePct(position.x, position.y, hotspot.x, hotspot.y) <=
                  hotspot.radius + 4;
                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    onClick={() => triggerHotspot(hotspot)}
                    className="absolute z-[15] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                    style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                  >
                    <motion.span
                      className={`absolute h-16 w-16 rounded-full border ${
                        discoveredHotspots[hotspot.id]
                          ? "border-emerald-300/30"
                          : "border-gold-300/28"
                      }`}
                      animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <span
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold transition ${
                        nearHotspot
                          ? "border-gold-300/70 bg-gold-400/18 text-gold-100"
                          : "border-white/10 bg-night-950/62 text-ivory/65"
                      }`}
                    >
                      {hotspot.glyph}
                    </span>
                    <span className="mt-2 rounded-full border border-white/10 bg-night-950/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory/75">
                      {hotspot.title}
                    </span>
                  </button>
                );
              })}

              {visibleLueurs.map((node) => (
                <motion.button
                  key={node.id}
                  type="button"
                  onClick={() => collectLueur(node, "tap")}
                  className="absolute z-[16] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  animate={{
                    y: [0, -4, 0],
                    scale: node.rarity === "epic" ? [1, 1.08, 1] : [1, 1.04, 1],
                  }}
                  transition={{ duration: node.rarity === "epic" ? 1.8 : 2.4, repeat: Infinity }}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      node.rarity === "epic"
                        ? "border-cyan-200/70 bg-cyan-200/22 shadow-[0_0_24px_rgba(103,232,249,0.42)]"
                        : node.rarity === "rare"
                          ? "border-gold-200/70 bg-gold-200/20 shadow-[0_0_22px_rgba(250,204,21,0.4)]"
                          : "border-gold-100/55 bg-gold-100/18 shadow-[0_0_18px_rgba(253,230,138,0.32)]"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
                  </span>
                </motion.button>
              ))}

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

              {stageMembers.map((member) => (
                <motion.div
                  key={member.id}
                  className={`absolute flex flex-col items-center ${member.aura}`}
                  style={{
                    left: `calc(${member.x}% - 28px)`,
                    top: `calc(${member.y}% - 40px)`,
                  }}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <button
                    type="button"
                    onClick={() => void openMemberCard(member)}
                    className="group flex flex-col items-center"
                  >
                    <div className="rounded-[24px] border border-white/15 bg-night-950/75 p-1.5 backdrop-blur relative transition group-hover:border-gold-300/45">
                      <AvatarImage
                        candidates={[member.avatarImageUrl]}
                        fallbackSeed={member.id}
                        alt={member.username}
                        className="h-10 w-10 md:h-12 md:w-12 rounded-[18px] object-cover"
                      />

                      {/* Other member's active familiar (if available) */}
                      {otherFamiliars[member.id] && (
                        <div
                          className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-night-950/80 text-xs shadow-sm"
                          style={{
                            background: `${otherFamiliars[member.id]?.color ?? "#ffffff"}22`,
                            borderColor: `${otherFamiliars[member.id]?.color ?? "#ffffff"}66`,
                          }}
                          title={otherFamiliars[member.id]?.nickname ?? otherFamiliars[member.id]?.name}
                        >
                          <span className="text-[14px]">{otherFamiliars[member.id]?.icon}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 rounded-full border border-white/10 bg-night-950/80 px-2.5 py-1 text-center text-[10px] uppercase tracking-[0.18em] text-ivory/80 transition group-hover:border-gold-300/35 group-hover:text-gold-100">
                      <div>{member.username}</div>
                      <div className="text-[9px] text-gold-200/80">
                        {member.status}
                        {member.voiceEnabled ? " - vocal" : ""}
                      </div>
                    </div>
                  </button>
                </motion.div>
              ))}

              {stageMembers.length === 0 && (
                <div className="absolute inset-x-0 top-[18%] mx-auto flex max-w-md flex-col items-center px-4 text-center md:top-[22%]">
                  <div className="rounded-3xl border border-royal-500/30 bg-night-950/70 px-6 py-5 backdrop-blur">
                    <div className="font-display text-2xl text-gold-200">
                      {selectedDistrict.name} respire en silence
                    </div>
                    <p className="mt-2 text-sm text-ivory/60">
                      Aucun autre membre n'est connecte pour le moment, mais le decor reste pret a s'animer.
                    </p>
                  </div>
                </div>
              )}

              <motion.div
                className="absolute z-10"
                style={{
                  left: `calc(${position.x}% - 44px)`,
                  top: `calc(${position.y}% - 68px)`,
                }}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative flex flex-col items-center">
                  <div className="rounded-[30px] border border-gold-300/40 bg-night-950/80 p-2 shadow-[0_0_45px_rgba(250,204,21,0.25)] backdrop-blur">
                    <AvatarImage
                      candidates={[profile?.avatarImageUrl, user?.avatar]}
                      fallbackSeed={user?.id ?? "guest-world"}
                      alt={user?.username ?? "Explorateur"}
                      className="h-14 w-14 md:h-20 md:w-20 rounded-[24px] object-cover"
                    />
                  </div>

                  {activeFamiliar && (
                    <motion.div
                      className="absolute -right-7 bottom-2 flex h-14 w-14 items-center justify-center rounded-3xl border border-white/15 bg-night-950/80 text-3xl shadow-[0_0_30px_rgba(255,255,255,0.12)]"
                      style={{
                        boxShadow: `0 0 30px -6px ${activeFamiliar.color}`,
                        borderColor: `${activeFamiliar.color}66`,
                      }}
                      animate={{ x: [0, 6, 0], y: [0, -4, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {activeFamiliar.icon}
                    </motion.div>
                  )}

                  <div className="mt-3 rounded-full border border-gold-300/30 bg-night-950/85 px-3 py-1 text-center text-[10px] uppercase tracking-[0.2em] text-gold-100">
                    <div>{user?.username ?? "Visiteur"}</div>
                    <div className="text-[9px] text-ivory/60">
                      {voiceEnabled
                        ? `micro ouvert · ${worldVoiceConnections} lien${worldVoiceConnections > 1 ? "s" : ""}`
                        : "micro coupe"}
                    </div>
                  </div>
                </div>
              </motion.div>

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

              <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => moveBy(0, -5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/85 px-4 py-3 text-sm text-ivory/90 shadow-lg backdrop-blur"
                >
                  ▲
                </button>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => moveBy(-5, 0)}
                    className="rounded-full border border-royal-500/30 bg-night-950/85 px-4 py-3 text-sm text-ivory/90 shadow-lg backdrop-blur"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(5, 0)}
                    className="rounded-full border border-royal-500/30 bg-night-950/85 px-4 py-3 text-sm text-ivory/90 shadow-lg backdrop-blur"
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => moveBy(0, 5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/85 px-4 py-3 text-sm text-ivory/90 shadow-lg backdrop-blur"
                >
                  ▼
                </button>
              </div>

              <div className="absolute bottom-5 right-5 rounded-2xl border border-white/10 bg-night-950/70 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ivory/60">
                  <Volume2 className="h-3.5 w-3.5 text-gold-300" />
                  Salon vocal
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ivory/45">
                  {voiceEnabled
                    ? `${worldVoiceConnections} presence${worldVoiceConnections > 1 ? "s" : ""} audio reliee${worldVoiceConnections > 1 ? "s" : ""}`
                    : "micro local en veille"}
                </div>
                <div className="mt-3 flex gap-1">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-10 w-2 rounded-full bg-emerald-300/15 transition"
                      style={{
                        background:
                          index < Math.max(1, Math.round(voiceLevel / 10))
                            ? "linear-gradient(180deg, rgba(110,231,183,0.95), rgba(16,185,129,0.35))"
                            : "rgba(148,163,184,0.14)",
                      }}
                    />
                  ))}
                </div>
              </div>
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
              Explore, reveille les zones secretes et laisse les evenements du monde guider ta collecte.
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
                    : "Toutes tes lueurs visibles sont deja scellees."}
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
                      +{ambientEvent.bonusLueurs} lueurs reveillees
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

          <section className="rounded-[26px] border border-royal-500/30 bg-night-900/60 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-300" />
              <h3 className="font-display text-xl text-gold-200">Chat du monde</h3>
            </div>
            <div className="mt-4 space-y-3">
              {chatMessages.slice(0, 6).map((message) => (
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
                      {message.handle && (
                        <Handle handle={message.handle} className="text-[11px]" />
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-ivory/40">
                      {formatRelative(message.createdAt)}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ivory/70">{message.content}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Dire quelque chose dans le hub..."
                className="glass-input flex-1"
              />
              <button
                type="button"
                onClick={sendMessage}
                className="rounded-full border border-gold-400/35 px-4 py-2 text-sm text-gold-100 transition hover:border-gold-300/70"
              >
                Envoyer
              </button>
            </div>
          </section>
        </aside>
      </div>

      {selectedMember && (
        <section className="mt-6 rounded-[28px] border border-royal-500/30 bg-night-900/65 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage
                candidates={[
                  selectedMember.profile?.avatarImageUrl ?? selectedMember.member.avatarImageUrl,
                ]}
                fallbackSeed={selectedMember.member.id}
                alt={selectedMember.member.username}
                className="h-16 w-16 rounded-[22px] object-cover"
              />
              <div>
                <div className="font-display text-2xl text-gold-100">
                  {selectedMember.profile?.username ?? selectedMember.member.username}
                </div>
                <Handle
                  handle={selectedMember.profile?.handle ?? selectedMember.member.handle}
                  className="text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-ivory/65">
                  <span>
                    {selectedMember.profile?.followersCount ?? 0} abonnes
                  </span>
                  <span>
                    {selectedMember.profile?.followingCount ?? 0} liens
                  </span>
                  <span>{selectedMember.member.status}</span>
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

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                Profil rapide
              </div>
              <p className="mt-3 text-sm leading-6 text-ivory/70">
                {selectedMember.loading
                  ? "Chargement du profil..."
                  : selectedMember.profile
                    ? "Ouvre sa fiche, regarde ses abonnes et interagis directement depuis les mondes."
                    : "Le profil detaille n'a pas pu etre charge, mais tu peux deja interagir avec cette presence."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to={`/u/${selectedMember.member.id}`}
                  className="rounded-full border border-gold-400/35 px-4 py-2 text-sm text-gold-100 transition hover:border-gold-300/70"
                >
                  Voir le profil
                </Link>
                {user && user.id !== selectedMember.member.id && (
                  <Link
                    to={`/messages/${encodeURIComponent(selectedMember.member.id)}`}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
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
                                followersCount: current.profile.followersCount + (nowFollowing ? 1 : -1),
                              },
                            }
                          : current,
                      )
                    }
                  />
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-night-950/55 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-gold-200/70">
                Actions mimi
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => sendCuteAction("wave")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                >
                  <Heart className="h-4 w-4 text-rose-300" />
                  Saluer
                </button>
                <button
                  type="button"
                  onClick={() => sendCuteAction("sparkle")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-ivory/80 transition hover:border-gold-300/35 hover:text-gold-100"
                >
                  <Sparkles className="h-4 w-4 text-gold-300" />
                  Envoyer un eclat
                </button>
              </div>
            </div>
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
          copy="Chaque monde revele ses propres eclats, secrets et mini-evenements pour recompenser l'exploration."
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
