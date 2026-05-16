import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { getPeerOptions } from "../lib/peerConfig";
import type { WorldPresenceDto } from "../lib/api";

type DistrictVoiceMember = Pick<
  WorldPresenceDto,
  | "userId"
  | "username"
  | "district"
  | "voiceEnabled"
  | "voiceChannelId"
  | "privateVoicePartnerId"
>;

interface WorldVoiceState {
  voiceEnabled: boolean;
  voiceLoading: boolean;
  voiceLevel: number;
  hasMicPermission: boolean;
  connectionCount: number;
  error: string | null;
  currentChannelId: string;
  privateVoicePartnerId: string | null;
  toggleVoice: () => Promise<void>;
}

function peerIdForWorld(worldId: string, userId: string) {
  return `vaelyndra-world-voice-v1-${worldId}-${userId}`;
}

function shouldInitiateCall(myUserId: string, otherUserId: string) {
  return myUserId < otherUserId;
}

function resolveUserIdFromPeerId(worldId: string, peerId: string): string | null {
  const prefix = `vaelyndra-world-voice-v1-${worldId}-`;
  if (!peerId.startsWith(prefix)) return null;
  return peerId.slice(prefix.length) || null;
}

function worldVoiceLog(scope: string, message: string, extra?: unknown) {
  if (extra === undefined) {
    console.info(`[world-voice:${scope}] ${message}`);
    return;
  }
  console.info(`[world-voice:${scope}] ${message}`, extra);
}

function RemoteAudioSink({
  stream,
}: {
  stream: MediaStream;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
    element.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    const resumePlayback = () => {
      ref.current?.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", resumePlayback, { passive: true });
    return () => window.removeEventListener("pointerdown", resumePlayback);
  }, []);

  return <audio ref={ref} autoPlay playsInline />;
}

export function useWorldVoice(input: {
  worldId: string;
  userId: string | null | undefined;
  district: string;
  members: DistrictVoiceMember[];
}) {
  const { worldId, userId, district, members } = input;
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Array<{ userId: string; stream: MediaStream }>
  >([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connsRef = useRef<Map<string, MediaConnection>>(new Map());
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const connectionCount = remoteStreams.length;
  const currentPresence = useMemo(
    () => members.find((member) => member.userId === userId) ?? null,
    [members, userId],
  );
  const currentChannelId = currentPresence?.voiceChannelId ?? `district:${district}`;

  const activePeers = useMemo(
    () =>
      members
        .filter(
          (member) =>
            member.userId !== userId &&
            member.voiceEnabled &&
            member.voiceChannelId === currentChannelId,
        )
        .map((member) => member.userId),
    [currentChannelId, members, userId],
  );

  const shutdownVoice = useCallback(() => {
    generationRef.current += 1;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const timer of retryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    retryTimersRef.current.clear();
    for (const conn of connsRef.current.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    connsRef.current.clear();
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // ignore
      }
      peerRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setRemoteStreams([]);
    setVoiceLevel(0);
  }, []);

  const registerConnection = useCallback(
    (
      remoteUserId: string,
      conn: MediaConnection,
      generation: number,
    ) => {
      const existing = connsRef.current.get(remoteUserId);
      if (existing && existing !== conn) {
        try {
          existing.close();
        } catch {
          // ignore
        }
      }
      connsRef.current.set(remoteUserId, conn);
      conn.on("stream", (remote) => {
        if (generation !== generationRef.current) return;
        setRemoteStreams((current) => {
          const next = current.filter((entry) => entry.userId !== remoteUserId);
          return [...next, { userId: remoteUserId, stream: remote }];
        });
      });
      const release = () => {
        if (connsRef.current.get(remoteUserId) === conn) {
          connsRef.current.delete(remoteUserId);
        }
        setRemoteStreams((current) =>
          current.filter((entry) => entry.userId !== remoteUserId),
        );
      };
      conn.on("close", release);
      conn.on("error", () => {
        release();
        if (
          generation === generationRef.current &&
          userId &&
          activePeers.includes(remoteUserId) &&
          shouldInitiateCall(userId, remoteUserId)
        ) {
          const retryId = window.setTimeout(() => {
            retryTimersRef.current.delete(remoteUserId);
            const peer = peerRef.current;
            const activeStream = localStreamRef.current;
            if (!peer || !activeStream || peer.destroyed) return;
            const next = peer.call(peerIdForWorld(worldId, remoteUserId), activeStream);
            if (!next) return;
            registerConnection(remoteUserId, next, generation);
          }, 1600);
          retryTimersRef.current.set(remoteUserId, retryId);
        }
      });
      worldVoiceLog("conn", `linked ${remoteUserId}`);
    },
    [activePeers, userId, worldId],
  );

  const startVoice = useCallback(async () => {
    if (!userId || voiceLoading || voiceEnabled) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setError("audio-unsupported");
      return;
    }

    setVoiceLoading(true);
    setError(null);
    const generation = ++generationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!mountedRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      setHasMicPermission(true);
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const sampleLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        const average =
          buffer.reduce((sum, value) => sum + value, 0) / Math.max(1, buffer.length);
        setVoiceLevel(Math.min(100, Math.round((average / 140) * 100)));
        rafRef.current = window.requestAnimationFrame(sampleLevel);
      };
      rafRef.current = window.requestAnimationFrame(sampleLevel);

      const { default: PeerCtor } = await import("peerjs");
      if (!mountedRef.current || generation !== generationRef.current) {
        shutdownVoice();
        return;
      }
      const peer = new PeerCtor(peerIdForWorld(worldId, userId), getPeerOptions());
      peerRef.current = peer;
      peer.on("open", () => {
        if (generation !== generationRef.current) return;
        setVoiceEnabled(true);
        worldVoiceLog("peer", `opened for ${userId}`);
      });
      peer.on("error", (err: Error & { type?: string }) => {
        if (err.type === "peer-unavailable") return;
        if (err.type === "unavailable-id") {
          setError("duplicate-peer");
          worldVoiceLog("peer", "duplicate peer id detected");
          return;
        }
        setError(err.message || "peer-error");
        worldVoiceLog("peer", "peer error", err);
      });
      peer.on("call", (incoming) => {
        const remoteUserId = resolveUserIdFromPeerId(worldId, incoming.peer);
        if (!remoteUserId || !localStreamRef.current) {
          try {
            incoming.close();
          } catch {
            // ignore
          }
          return;
        }
        registerConnection(remoteUserId, incoming, generation);
        incoming.answer(localStreamRef.current);
      });
    } catch (err) {
      shutdownVoice();
      setError(err instanceof Error ? err.message : "micro-error");
      worldVoiceLog("mic", "failed to open microphone", err);
    } finally {
      if (mountedRef.current) setVoiceLoading(false);
    }
  }, [
    registerConnection,
    shutdownVoice,
    currentChannelId,
    userId,
    voiceEnabled,
    voiceLoading,
    worldId,
  ]);

  const toggleVoice = useCallback(async () => {
    if (voiceEnabled) {
      shutdownVoice();
      setVoiceEnabled(false);
      return;
    }
    await startVoice();
  }, [shutdownVoice, startVoice, voiceEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shutdownVoice();
    };
  }, [shutdownVoice]);

  useEffect(() => {
    if (!voiceEnabled || !userId) return;
    const stream = localStreamRef.current;
    const peer = peerRef.current;
    if (!stream || !peer || peer.destroyed) return;
    const generation = generationRef.current;
    const wanted = new Set(activePeers);

    for (const [remoteUserId, conn] of connsRef.current.entries()) {
      if (!wanted.has(remoteUserId)) {
        try {
          conn.close();
        } catch {
          // ignore
        }
        connsRef.current.delete(remoteUserId);
      }
    }
    setRemoteStreams((current) =>
      current.filter((entry) => wanted.has(entry.userId)),
    );

    for (const remoteUserId of activePeers) {
      if (connsRef.current.has(remoteUserId)) continue;
      if (!shouldInitiateCall(userId, remoteUserId)) continue;
      const conn = peer.call(peerIdForWorld(worldId, remoteUserId), stream);
      if (!conn) continue;
      registerConnection(remoteUserId, conn, generation);
    }
  }, [activePeers, registerConnection, userId, voiceEnabled, worldId]);

  const VoiceAudioLayer = useMemo(
    () =>
      function VoiceAudioLayerInner() {
        return (
          <div
            aria-hidden
            style={{ position: "fixed", width: 0, height: 0, overflow: "hidden" }}
          >
            {remoteStreams.map((entry) => (
              <RemoteAudioSink key={entry.userId} stream={entry.stream} />
            ))}
          </div>
        );
      },
    [remoteStreams],
  );

  return {
    voiceEnabled,
    voiceLoading,
    voiceLevel,
    hasMicPermission,
    connectionCount,
    error,
    toggleVoice,
    currentChannelId,
    privateVoicePartnerId: currentPresence?.privateVoicePartnerId ?? null,
    VoiceAudioLayer,
  } as WorldVoiceState & { VoiceAudioLayer: () => ReactElement };
}
