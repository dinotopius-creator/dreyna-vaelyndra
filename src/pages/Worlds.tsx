import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Crown,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";
import { AvatarImage } from "../components/AvatarImage";
import { AvatarViewer } from "../components/AvatarViewer";
import { Handle } from "../components/Handle";
import { useAuth } from "../contexts/AuthContext";
import { useLive } from "../contexts/LiveContext";
import { useProfile } from "../contexts/ProfileContext";
import { useToast } from "../contexts/ToastContext";
import {
  apiHeartbeatWorldPresence,
  apiLeaveWorldPresence,
  apiListWorldPresence,
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

const WORLD_ID = "main";

const DISTRICTS: District[] = [
  {
    id: "place",
    name: "Place publique",
    accent: "from-gold-400/30 via-amber-300/10 to-rose-300/10",
    description: "Le coeur du royaume, entre rencontres spontanées et passages de familiers.",
    center: { x: 49, y: 62 },
    mood: "Agora dorée, fontaine centrale et rondes de familiers.",
  },
  {
    id: "arcades",
    name: "Arcades des créateurs",
    accent: "from-cyan-300/25 via-sky-400/10 to-indigo-400/10",
    description: "Un couloir social pensé pour les vitrines d'avatars, fan arts et mini événements.",
    center: { x: 30, y: 50 },
    mood: "Galeries néon, cadres flottants et stands de créations.",
  },
  {
    id: "observatory",
    name: "Observatoire live",
    accent: "from-fuchsia-400/25 via-purple-400/10 to-rose-300/10",
    description: "Le balcon d'où l'on regarde les streamers en direct et les happenings du soir.",
    center: { x: 72, y: 42 },
    mood: "Dôme céleste, écrans live suspendus et vue sur le royaume.",
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
  const { profile } = useProfile();
  const { liveRegistry } = useLive();
  const { notify } = useToast();
  const [district, setDistrict] = useState<DistrictId>("place");
  const [position, setPosition] = useState({ x: 49, y: 62 });
  const [activeFamiliar, setActiveFamiliar] = useState<OwnedFamiliar | null>(null);
  const [chatMessages, setChatMessages] = useState<WorldChatMessage[]>(BASE_CHAT);
  const [chatInput, setChatInput] = useState("");
  const [worldMembers, setWorldMembers] = useState<WorldPresenceDto[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);

  function setPositionFromClient(clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const newX = clamp(x, 10, 88);
    const newY = clamp(y, 18, 84);
    setPosition({ x: newX, y: newY });
    try {
      window.dispatchEvent(new CustomEvent("vaelyndra:position-change", { detail: { x: newX, y: newY } }));
    } catch {
      // ignore
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerDownRef.current = true;
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    setPositionFromClient(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerDownRef.current) return;
    setPositionFromClient(e.clientX, e.clientY);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointerDownRef.current = false;
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {}
  }

  const selectedDistrict = useMemo(
    () => DISTRICTS.find((entry) => entry.id === district) ?? DISTRICTS[0],
    [district],
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
            (entry) => entry.familiarId === collection.activeFamiliarId,
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
    return () => {
      stopVoicePreview();
    };
  }, []);

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

  async function startVoicePreview() {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify("Le chat vocal n'est pas supporté sur cet appareil.", "error");
      return;
    }
    setVoiceLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg =
          data.reduce((sum, value) => sum + value, 0) / Math.max(data.length, 1);
        setVoiceLevel(Math.min(100, Math.round((avg / 160) * 100)));
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
      setVoiceEnabled(true);
      notify("Micro activé. Le salon vocal du hub est prêt.", "success");
    } catch (error) {
      console.warn(error);
      stopVoicePreview();
      notify("Impossible d'activer le micro pour le chat vocal.", "error");
    } finally {
      setVoiceLoading(false);
    }
  }

  function stopVoicePreview() {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setVoiceEnabled(false);
    setVoiceLevel(0);
  }

  async function toggleVoice() {
    if (voiceLoading) return;
    if (voiceEnabled) {
      stopVoicePreview();
      notify("Micro coupé. Tu restes visible dans le hub.", "info");
      return;
    }
    await startVoicePreview();
  }

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <SectionHeading
        eyebrow="Mondes"
        title={
          <>
            La place <span className="text-mystic">virtuelle</span> de Vaelyndra
          </>
        }
        subtitle="Un hub social vivant où les membres se déplacent avec leur familier, repèrent les lives en direct et rejoignent les événements du royaume."
      />

      <div className="mt-8 grid gap-4 xl:grid-cols-[1.35fr,0.65fr]">
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

          <div className="relative overflow-hidden p-5">
            <div
              ref={mapRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative min-h-[360px] sm:min-h-[520px] md:min-h-[620px] overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br ${selectedDistrict.accent}`}
            >
              <DistrictBackdrop district={district} />

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
                  <div className="rounded-[24px] border border-white/15 bg-night-950/75 p-1.5 backdrop-blur">
                    {member.avatarUrl ? (
                      <div className="w-10 md:w-12 overflow-hidden rounded-[18px]">
                        <AvatarViewer
                          src={member.avatarUrl}
                          fallbackImage={member.avatarImageUrl}
                          alt={member.username}
                          size="square"
                          framing="face"
                          autoRotate={false}
                        />
                      </div>
                    ) : (
                      <AvatarImage
                        candidates={[member.avatarImageUrl]}
                        fallbackSeed={member.id}
                        alt={member.username}
                        className="h-10 w-10 md:h-12 md:w-12 rounded-[18px] object-cover"
                      />
                    )}
                  </div>
                  <div className="mt-2 rounded-full border border-white/10 bg-night-950/80 px-2.5 py-1 text-center text-[10px] uppercase tracking-[0.18em] text-ivory/80">
                    <div>{member.username}</div>
                    <div className="text-[9px] text-gold-200/80">
                      {member.status}
                      {member.voiceEnabled ? " · vocal" : ""}
                    </div>
                  </div>
                </motion.div>
              ))}

              {stageMembers.length === 0 && (
                <div className="absolute inset-x-0 top-[22%] mx-auto flex max-w-md flex-col items-center text-center">
                  <div className="rounded-3xl border border-royal-500/30 bg-night-950/70 px-6 py-5 backdrop-blur">
                    <div className="font-display text-2xl text-gold-200">
                      {selectedDistrict.name} est calme
                    </div>
                    <p className="mt-2 text-sm text-ivory/60">
                      Aucun autre membre n'est connecté à ce monde pour le moment.
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
                    {profile?.avatarUrl ? (
                      <div className="w-14 md:w-20">
                        <AvatarViewer
                          src={profile.avatarUrl}
                          fallbackImage={profile.avatarImageUrl || user?.avatar}
                          alt={user?.username ?? "Explorateur"}
                          size="square"
                          framing="face"
                          autoRotate={false}
                          equippedFrameId={profile.equipped?.frame ?? null}
                          equippedSceneId={profile.equipped?.scene ?? null}
                          equippedOutfit3DId={profile.equipped?.outfit3d ?? null}
                          equippedAccessory3DId={profile.equipped?.accessory3d ?? null}
                        />
                      </div>
                    ) : (
                      <AvatarImage
                        candidates={[profile?.avatarImageUrl, user?.avatar]}
                        fallbackSeed={user?.id ?? "guest-world"}
                        alt={user?.username ?? "Explorateur"}
                        className="h-14 w-14 md:h-20 md:w-20 rounded-[24px] object-cover"
                      />
                    )}
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
                      {voiceEnabled ? "micro ouvert" : "micro coupé"}
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="absolute bottom-5 left-5 flex flex-wrap gap-2">
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

              {/* Mobile-friendly floating pad (hidden on md+) */}
              <div className="md:hidden fixed bottom-6 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveBy(0, -5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/80 px-4 py-3 text-sm text-ivory/90 shadow-lg"
                >
                  ▲
                </button>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => moveBy(-5, 0)}
                    className="rounded-full border border-royal-500/30 bg-night-950/80 px-4 py-3 text-sm text-ivory/90 shadow-lg"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(5, 0)}
                    className="rounded-full border border-royal-500/30 bg-night-950/80 px-4 py-3 text-sm text-ivory/90 shadow-lg"
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => moveBy(0, 5)}
                  className="rounded-full border border-royal-500/30 bg-night-950/80 px-4 py-3 text-sm text-ivory/90 shadow-lg"
                >
                  ▼
                </button>
              </div>

              <div className="absolute bottom-5 right-5 rounded-2xl border border-white/10 bg-night-950/70 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ivory/60">
                  <Volume2 className="h-3.5 w-3.5 text-gold-300" />
                  Salon vocal
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

        <aside className="space-y-4">
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
                className="rounded-2xl border border-gold-400/30 bg-gold-500/10 px-4 py-3 text-sm text-gold-100 transition hover:border-gold-300/70 hover:bg-gold-500/15"
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

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <WorldFact
          icon={<Crown className="h-4 w-4" />}
          title="Hub social persistant"
          copy="Présence des membres, zones distinctes et circulation libre dans la place."
        />
        <WorldFact
          icon={<Mic className="h-4 w-4" />}
          title="Chat vocal activable"
          copy="Le micro peut déjà être ouvert localement depuis le hub pour préparer un vrai salon vocal temps réel."
        />
        <WorldFact
          icon={<Radio className="h-4 w-4" />}
          title="Pont vers les lives"
          copy="L'observatoire relie directement le monde social et les streamers actifs."
        />
      </section>
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
    <div className="rounded-[24px] border border-royal-500/30 bg-night-900/55 p-5">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/10 text-gold-200">
        {icon}
      </div>
      <div className="mt-3 font-display text-xl text-gold-200">{title}</div>
      <p className="mt-2 text-sm text-ivory/65">{copy}</p>
    </div>
  );
}

function DistrictBackdrop({ district }: { district: DistrictId }) {
  if (district === "arcades") {
    return (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.14),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.86))]" />

        {/* Neon display blocks (keep visual, remove text badges) */}
        <div className="absolute left-[6%] top-[14%] h-40 w-28 rounded-[28px] border border-cyan-200/18 bg-cyan-300/8 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur" />
        <div className="absolute left-[24%] top-[18%] h-32 w-20 rounded-[24px] border border-sky-200/18 bg-sky-300/8 backdrop-blur" />
        <div className="absolute right-[8%] top-[16%] h-44 w-32 rounded-[32px] border border-indigo-200/18 bg-indigo-300/8 shadow-[0_0_50px_rgba(129,140,248,0.12)] backdrop-blur" />

        {/* Low decorative ground */}
        <div className="absolute inset-x-[8%] bottom-[6%] h-20 rounded-[24px] border border-cyan-300/12 bg-[linear-gradient(90deg,rgba(34,211,238,0.12),rgba(56,189,248,0.04),rgba(99,102,241,0.12))]" />

        {/* Soft grass foreground to tie visuals together */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-emerald-900/90 via-emerald-800/60 to-transparent opacity-95" />
      </>
    );
  }

  if (district === "observatory") {
    return (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.16),transparent_26%),radial-gradient(circle_at_70%_20%,rgba(196,181,253,0.14),transparent_24%),linear-gradient(180deg,rgba(10,10,35,0.12),rgba(3,7,18,0.88))]" />

        {/* Observatory dome */}
        <div className="absolute left-1/2 top-[8%] h-56 w-[70%] -translate-x-1/2 rounded-t-[180px] border border-fuchsia-200/14 bg-fuchsia-200/4 backdrop-blur-[2px]" />

        {/* Small live cards (no text) */}
        <div className="absolute left-[14%] top-[20%] h-20 w-36 rounded-[24px] border border-rose-200/16 bg-rose-200/8 shadow-[0_0_28px_rgba(244,114,182,0.12)] backdrop-blur" />
        <div className="absolute right-[12%] top-[20%] h-24 w-40 rounded-[26px] border border-purple-200/16 bg-purple-200/8 shadow-[0_0_36px_rgba(192,132,252,0.12)] backdrop-blur" />

        {/* Ring/platform */}
        <div className="absolute left-1/2 top-[46%] h-32 w-[44%] -translate-x-1/2 rounded-[50%] border border-fuchsia-200/18 bg-night-950/64 shadow-[0_0_60px_rgba(192,132,252,0.12)]" />

        {/* Stars */}
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

        {/* Gentle grassy foreground to soften the bottom */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-emerald-900/85 via-emerald-800/50 to-transparent opacity-95" />
      </>
    );
  }

  // Place publique: add greenery and simplify badges
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,247,204,0.14),transparent_30%),linear-gradient(180deg,rgba(4,10,24,0.14),rgba(4,10,24,0.78))]" />

      {/* Decorative central elements simplified */}
      <div className="absolute inset-x-[8%] top-[10%] h-28 rounded-full bg-gold-300/8 blur-3xl" />
      <div className="absolute left-1/2 top-[20%] h-18 w-18 -translate-x-1/2 rounded-full border border-gold-200/22 bg-gold-200/8 shadow-[0_0_28px_rgba(250,204,21,0.12)]" />

      {/* Remove text badges; keep soft shapes */}

      {/* Large soft ground and grass foreground */}
      <div className="absolute inset-x-[6%] bottom-[18%] h-20 rounded-[30px] border border-gold-300/10 bg-gold-300/8 opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-emerald-900/96 via-emerald-800/68 to-transparent" />

      {/* Subtle blurred shadow for depth */}
      <div className="absolute bottom-[-6%] left-[12%] right-[12%] h-44 rounded-[50%] border border-gold-300/10 bg-night-950/44 blur-[2px]" />
    </>
  );
}

function labelForDistrict(district: DistrictId) {
  return DISTRICTS.find((entry) => entry.id === district)?.name ?? "Monde";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
