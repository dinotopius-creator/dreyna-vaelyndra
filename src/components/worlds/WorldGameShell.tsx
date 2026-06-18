import { Suspense, lazy, type RefObject } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, MessageCircle, Mic, MicOff, MoreHorizontal, Sparkles, X } from "lucide-react";
import type { World3DPlayer, World3DLueur, World3DHotspot, WorldSpeechBubble } from "./World3DStage";
import { formatRelative } from "../../lib/helpers";

const World3DStage = lazy(() => import("./World3DStage"));

export type DistrictId = "place" | "arcades" | "observatory";

export interface WorldGameDistrict {
  id: DistrictId;
  name: string;
  description: string;
  mood: string;
  accent: string;
}

export interface WorldGameChatMessage {
  id: string;
  author: string;
  handle?: string | null;
  content: string;
  tone?: "system" | "member";
  district?: DistrictId;
  createdAt: string;
}

export interface WorldGameShellProps {
  district: DistrictId;
  selectedDistrict: WorldGameDistrict;
  worldBooting: boolean;
  worldBootStep: number;
  worldGameActive: boolean;
  worldLandscapeMode: boolean;
  worldMenuOpen: boolean;
  worldSwitchingTo: DistrictId | null;
  worldChatExpanded: boolean;
  worldChatAttention: number;
  chatMessages: WorldGameChatMessage[];
  chatInput: string;
  chatInputRef: RefObject<HTMLInputElement | null>;
  voiceEnabled: boolean;
  micEnabled: boolean;
  voiceLoading: boolean;
  worldVoiceConnections: number;
  currentChannelId: string;
  privateVoicePartnerId: string | null;
  ambientEvent: { title: string; copy: string } | null;
  nearbyHotspot: { title: string } | null;
  lueurBursts: Array<{ id: string; x: number; y: number; value: number; rarity: "common" | "rare" | "epic" }>;
  world3DPlayers: World3DPlayer[];
  visibleLueurs: World3DLueur[];
  districtHotspots: World3DHotspot[];
  worldSpeechBubbles: WorldSpeechBubble[];
  onMove: (position: { x: number; y: number }) => void;
  onSelectPlayer: (playerId: string, anchor: { x: number; y: number }) => void;
  onCollectLueur: (id: string) => void;
  onTriggerHotspot: (id: string) => void;
  onToggleVoice: () => void | Promise<void>;
  onOpenChat: () => void;
  onCloseChat: () => void;
  onOpenEmotes: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSwitchWorld: (nextDistrict: DistrictId) => void;
  onExitWorld: () => void;
  onSendMessage: () => void;
  onChatInputChange: (value: string) => void;
}

const WORLD_BOOT_STEPS = [
  "Connexion au monde...",
  "Chargement de votre avatar...",
  "Préparation de l'univers...",
  "Synchronisation du vocal...",
  "Entrée dans Vaelyndra...",
];

export function WorldGameShell({
  district,
  selectedDistrict,
  worldBooting,
  worldBootStep,
  worldGameActive,
  worldLandscapeMode,
  worldMenuOpen,
  worldSwitchingTo,
  worldChatExpanded,
  worldChatAttention,
  chatMessages,
  chatInput,
  chatInputRef,
  voiceEnabled,
  micEnabled,
  voiceLoading,
  worldVoiceConnections,
  currentChannelId,
  privateVoicePartnerId,
  ambientEvent,
  nearbyHotspot,
  lueurBursts,
  world3DPlayers,
  visibleLueurs,
  districtHotspots,
  worldSpeechBubbles,
  onMove,
  onSelectPlayer,
  onCollectLueur,
  onTriggerHotspot,
  onToggleVoice,
  onOpenChat,
  onCloseChat,
  onOpenEmotes,
  onToggleMenu,
  onCloseMenu,
  onSwitchWorld,
  onExitWorld,
  onSendMessage,
  onChatInputChange,
}: WorldGameShellProps) {
  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden bg-[#04040b] text-ivory"
      style={{ height: "100dvh", width: "100vw" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(250,204,21,0.14),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(180deg,rgba(3,7,18,0.92),rgba(4,4,11,0.98))]" />

      {worldBooting && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center px-5 text-center">
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
            <h3 className="mt-2 font-display text-3xl text-gold-100">Entrée dans le monde</h3>
            <p className="mt-3 min-h-6 text-sm text-ivory/70">{WORLD_BOOT_STEPS[worldBootStep]}</p>
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
            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">Changement de monde</p>
            <p className="mt-2 font-display text-lg text-gold-100">
              {selectedDistrict.name}
            </p>
            <p className="mt-1 text-sm text-ivory/68">Synchronisation de la room et de l’avatar...</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0">
        <Suspense
          fallback={
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-night-950/45 text-center backdrop-blur-sm">
              <div className="rounded-3xl border border-gold-300/20 bg-night-950/75 px-5 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gold-200">Monde 3D</p>
                <p className="mt-2 text-sm text-ivory/65">Chargement de la scène temps réel...</p>
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
            onMove={onMove}
            onSelectPlayer={onSelectPlayer}
            onCollectLueur={onCollectLueur}
            onTriggerHotspot={onTriggerHotspot}
          />
        </Suspense>
      </div>

      {ambientEvent?.title && (
        <div className="pointer-events-none absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[84] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-[24px] border border-gold-300/30 bg-night-950/72 px-4 py-3 backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Événement vivant</div>
          <div className="mt-1 font-display text-lg text-gold-100">{ambientEvent.title}</div>
          <p className="mt-1 text-sm text-ivory/65">{ambientEvent.copy}</p>
        </div>
      )}

      <div className="pointer-events-none absolute left-[calc(50%-8rem)] top-[calc(0.85rem+env(safe-area-inset-top))] z-[84] hidden min-[520px]:block">
        <div className="rounded-full border border-white/10 bg-night-950/70 px-4 py-2 text-center shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-200/70">{selectedDistrict.name}</div>
          <div className="text-sm text-ivory/80">{selectedDistrict.mood}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onExitWorld}
        className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[86] inline-flex h-11 min-h-11 items-center gap-2 rounded-full border border-white/12 bg-night-950/78 px-3.5 text-sm text-ivory/88 shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-gold-300/45 hover:text-gold-100 active:scale-95"
        aria-label="Quitter le monde"
      >
        <ChevronLeft className="h-4 w-4" />
        Quitter
      </button>

      <div className="absolute right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[86] flex items-start gap-2">
        <div className="rounded-2xl border border-white/10 bg-night-950/58 px-3 py-2 text-right backdrop-blur">
          <p className="text-[9px] uppercase tracking-[0.22em] text-gold-200/70">Mode monde</p>
          <p className="font-display text-sm text-gold-100">{selectedDistrict.name}</p>
          {worldSwitchingTo && (
            <p className="mt-1 text-[10px] text-ivory/55">
              Changement vers{" "}
              {worldSwitchingTo === "place"
                ? "la place"
                : worldSwitchingTo === "arcades"
                  ? "les arcades"
                  : "l'observatoire"}
              ...
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleMenu}
          className="inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-night-950/76 text-ivory/86 shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-xl transition hover:border-gold-300/45 hover:text-gold-100 active:scale-95"
          aria-haspopup="menu"
          aria-expanded={worldMenuOpen}
          aria-label="Ouvrir le menu du monde"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[86] flex items-end gap-2">
        {!worldChatExpanded && (
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex h-11 min-h-11 items-center gap-2 rounded-full border border-sky-300/20 bg-night-950/88 px-4 text-sm text-sky-100 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-sky-300/40 hover:text-sky-50 active:scale-95"
            aria-label="Ouvrir le chat du monde"
          >
            <MessageCircle className="h-4 w-4" />
            Chat
            <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-200/80">
              {chatMessages.length}
            </span>
          </button>
        )}
      </div>

      {worldMenuOpen && (
        <>
          <button
            type="button"
            aria-label="Fermer le menu du monde"
            onClick={onCloseMenu}
            className="absolute inset-0 z-[87] bg-transparent"
          />
          <div className="absolute right-[calc(0.75rem+env(safe-area-inset-right))] top-[calc(4rem+env(safe-area-inset-top))] z-[88] w-[min(20rem,calc(100vw-1.25rem))] overflow-hidden rounded-[24px] border border-white/12 bg-night-950/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
            <div className="px-3 pb-2 pt-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-gold-200/68">Menu du monde</p>
              <p className="mt-1 text-sm text-ivory/62">
                Micro, changement de monde et chat compact.
              </p>
            </div>
            <div className="space-y-1.5 px-1 pb-1">
              <button
                type="button"
                onClick={onToggleVoice}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-ivory/88 transition hover:bg-white/8"
              >
                {micEnabled ? <Mic className="h-4 w-4 text-emerald-300" /> : <MicOff className="h-4 w-4 text-slate-300" />}
                {voiceLoading ? "Activation..." : micEnabled ? "Micro activé" : "Activer le micro"}
              </button>
              <button
                type="button"
                onClick={onOpenChat}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-ivory/88 transition hover:bg-white/8"
              >
                <MessageCircle className="h-4 w-4 text-sky-300" />
                Ouvrir le chat
              </button>
              <div className="mt-2 rounded-2xl border border-white/8 bg-white/4 p-2">
                <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-ivory/48">Changer de monde</p>
                <div className="grid gap-1">
                  {(["place", "arcades", "observatory"] as DistrictId[]).map((entry) => {
                    const active = entry === district;
                    return (
                      <button
                        key={entry}
                        type="button"
                        disabled={active}
                        onClick={() => onSwitchWorld(entry)}
                        className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                          active ? "bg-gold-500/14 text-gold-100" : "text-ivory/84 hover:bg-white/8"
                        } disabled:cursor-default disabled:opacity-70`}
                      >
                        <span>{entry === "place" ? "La place" : entry === "arcades" ? "Les arcades" : "L'observatoire"}</span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-ivory/48">
                          {active ? "Actuel" : "Aller"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={onExitWorld}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-rose-100 transition hover:bg-rose-500/12"
              >
                <X className="h-4 w-4" />
                Quitter le monde
              </button>
            </div>
          </div>
        </>
      )}

      {worldChatExpanded && (
        <div
          className={`absolute z-[85] overflow-hidden rounded-[26px] border border-royal-500/30 bg-night-900/70 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl touch-pan-y overscroll-contain ${
            worldLandscapeMode
              ? "left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(4.4rem+env(safe-area-inset-top))] w-[min(21rem,calc(100vw-1rem))] max-h-[calc(100dvh-5.6rem)]"
              : "left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] bottom-[calc(0.8rem+env(safe-area-inset-bottom))] max-h-[min(30rem,calc(100dvh-6rem))]"
          }`}
        >
          <div className={`flex items-center gap-2 ${worldChatAttention > 0 ? "animate-[socialLikeBurst_900ms_ease-out_1]" : ""}`}>
            <Sparkles className="h-4 w-4 text-gold-300" />
            <h3 className="font-display text-lg text-gold-200">Chat du monde</h3>
            <button
              type="button"
              onClick={onOpenEmotes}
              className="ml-auto rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/55 transition hover:border-gold-300/35 hover:text-gold-100"
            >
              Emotes
            </button>
            <button
              type="button"
              onClick={onCloseChat}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/55 transition hover:border-gold-300/35 hover:text-gold-100"
              aria-label="Réduire le chat du monde"
            >
              Réduire
            </button>
          </div>
          <div
            className={`mt-3 space-y-2 overflow-y-auto pr-1 ${
              worldLandscapeMode ? "max-h-[min(15rem,calc(100dvh-10rem))]" : "max-h-[min(17rem,calc(100dvh-8rem))]"
            }`}
          >
            {chatMessages.slice(0, worldGameActive ? 4 : 6).map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border px-3 py-2 ${
                  message.tone === "system" ? "border-gold-400/20 bg-gold-500/8" : "border-royal-500/25 bg-night-950/55"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold text-ivory/90">{message.author}</div>
                      {message.district && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-ivory/55">
                          {message.district === "place"
                            ? "La place"
                            : message.district === "arcades"
                              ? "Les arcades"
                              : "L'observatoire"}
                        </span>
                      )}
                    </div>
                    {message.handle && <div className="text-[11px] text-ivory/50">{message.handle}</div>}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-ivory/40">
                    {formatRelative(message.createdAt)}
                  </div>
                </div>
                <p className="mt-1 text-sm text-ivory/70">{message.content}</p>
              </div>
            ))}
          </div>
          <div className={`mt-3 flex gap-2 ${worldLandscapeMode ? "flex-col items-stretch" : "items-end"}`}>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSendMessage();
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
              onClick={onSendMessage}
              className={`rounded-full border border-gold-400/35 px-4 py-2 text-sm text-gold-100 transition hover:border-gold-300/70 ${
                worldGameActive ? "min-h-11" : ""
              } ${worldLandscapeMode ? "w-full" : ""}`}
            >
              Envoyer
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-ivory/45">
            <span>
              {voiceEnabled
                ? currentChannelId.startsWith("private:")
                  ? "discussion privée active"
                  : micEnabled
                    ? `${worldVoiceConnections} présence${worldVoiceConnections > 1 ? "s" : ""} audio reliée${worldVoiceConnections > 1 ? "s" : ""}`
                    : `écoute active · micro coupé · ${worldVoiceConnections} lien${worldVoiceConnections > 1 ? "s" : ""}`
                : "vocal non rejoint"}
            </span>
            {privateVoicePartnerId && <span>vocal privé</span>}
          </div>
        </div>
      )}

      {nearbyHotspot && worldGameActive && (
        <div className="absolute left-1/2 top-[calc(50%-5.4rem)] z-[83] -translate-x-1/2 rounded-full border border-gold-300/22 bg-night-950/74 px-4 py-2 text-sm text-gold-100 shadow-[0_18px_48px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          Interagir avec {nearbyHotspot.title}
        </div>
      )}

      {lueurBursts.map((burst) => (
        <motion.div
          key={burst.id}
          className="pointer-events-none absolute z-[82] -translate-x-1/2 -translate-y-1/2"
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
    </div>
  );
}
