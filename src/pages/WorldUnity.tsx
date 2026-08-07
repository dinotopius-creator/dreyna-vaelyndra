import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, Mic, MicOff, RefreshCcw, Volume2, Wand2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { SectionHeading } from "../components/SectionHeading";

const UNITY_BUILD_URL = "/world/index.html";

type BridgeState = {
  ready: boolean;
  avatarId: string;
  userId: string;
  language: string;
  muted: boolean;
};

export function WorldUnity() {
  const { user, backendMe } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [bridgeReady, setBridgeReady] = useState(false);

  const bridgeState = useMemo<BridgeState>(() => ({
    ready: bridgeReady,
    avatarId: user?.id ?? "guest",
    userId: user?.id ?? "guest",
    language: navigator.language || "fr-FR",
    muted,
  }), [bridgeReady, muted, user?.id]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const raw = event.data;
      let data: { type?: string; muted?: boolean } | undefined;
      if (typeof raw === "string") {
        try {
          data = JSON.parse(raw) as { type?: string; muted?: boolean };
        } catch {
          data = undefined;
        }
      } else if (raw && typeof raw === "object") {
        data = raw as { type?: string; muted?: boolean };
      }
      if (!data?.type) return;
      if (data.type === "pulseforge-world-ready") {
        setBridgeReady(true);
      }
      if (data.type === "pulseforge-world-muted") {
        setMuted(Boolean(data.muted));
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: "pulseforge-world-init",
        payload: bridgeState,
      },
      window.location.origin,
    );
  }, [bridgeState, loaded]);

  function sendControl(type: string, extra?: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(
      { type, payload: { ...bridgeState, ...(extra ?? {}) } },
      window.location.origin,
    );
  }

  return (
    <div className="mx-auto min-h-[calc(100dvh-4rem)] max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-regal text-[10px] uppercase tracking-[0.22em] text-gold-300">
            Monde Unity
          </p>
          <h1 className="mt-1 font-display text-3xl text-gold-100">
            Salle du monde en 3D
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ivory/65">
            Le runtime Unity WebGL est branché en page dédiée. Le site envoie l'identité utilisateur et les états d'interface; Unity peut ensuite synchroniser avatar, spawn et présence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/mondes" className="btn-gold inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour aux mondes
          </Link>
          <button
            type="button"
            onClick={() => sendControl("pulseforge-world-refresh")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/30 hover:text-gold-100"
          >
            <RefreshCcw className="h-4 w-4" /> Rafraîchir le monde
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_320px]">
        <section className="card-royal overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-300/80">Session active</p>
              <p className="text-sm text-ivory/70">
                {user ? `${user.username} · ${backendMe?.role ?? "membre"}` : "Invité"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  sendControl("pulseforge-world-audio", { muted: next });
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/30 hover:text-gold-100"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? "Micro coupé" : "Audio activé"}
              </button>
              <button
                type="button"
                onClick={() => sendControl("pulseforge-world-camera")}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/30 hover:text-gold-100"
              >
                <Camera className="h-4 w-4" /> Caméra
              </button>
            </div>
          </div>

          <div className="relative aspect-[16/10] min-h-[28rem] bg-night-950">
            {!loaded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-night-950/95">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-pulse rounded-full border border-gold-400/40 bg-gold-500/10" />
                  <p className="mt-4 font-display text-2xl text-gold-200">Chargement du monde…</p>
                  <p className="mt-2 text-sm text-ivory/60">Unity WebGL prépare les ressources.</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="PulseForge Unity World"
              src={UNITY_BUILD_URL}
              className="h-full w-full border-0"
              allow="autoplay; fullscreen; microphone; camera; clipboard-read; clipboard-write"
              onLoad={() => {
                setLoaded(true);
                sendControl("pulseforge-world-init");
              }}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="card-royal p-4">
            <SectionHeading eyebrow="Pont" title="État de synchronisation" align="left" />
            <ul className="mt-4 space-y-3 text-sm text-ivory/70">
              <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Connexion iframe</span>
                <span className={loaded ? "text-emerald-300" : "text-amber-300"}>
                  {loaded ? "chargée" : "en attente"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Pont Unity ↔ site</span>
                <span className={bridgeReady ? "text-emerald-300" : "text-amber-300"}>
                  {bridgeReady ? "prêt" : "handshake"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Utilisateur</span>
                <span className="text-gold-200">{bridgeState.userId}</span>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <span>Langue</span>
                <span className="text-gold-200">{bridgeState.language}</span>
              </li>
            </ul>
          </section>

          <section className="card-royal p-4">
            <SectionHeading eyebrow="Contrôles" title="Actions côté site" align="left" />
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => sendControl("pulseforge-world-spawn-avatar", { avatarId: bridgeState.avatarId })}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/30 hover:text-gold-100"
              >
                <Wand2 className="h-4 w-4" /> Brancher l'avatar
              </button>
              <button
                type="button"
                onClick={() => sendControl("pulseforge-world-toggle-voice")}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold-300/30 hover:text-gold-100"
              >
                <Mic className="h-4 w-4" /> Basculer le micro
              </button>
              <button
                type="button"
                onClick={() => sendControl("pulseforge-world-exit")}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 transition hover:border-rose-300/50 hover:bg-rose-500/15"
              >
                Quitter le monde
              </button>
            </div>
            <p className="mt-3 text-xs leading-6 text-ivory/55">
              Les commandes sont prêtes côté app. Unity peut les consommer via `postMessage`/JS bridge dès que le runtime expose les handlers.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
