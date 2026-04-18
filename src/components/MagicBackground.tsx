import { MagicParticles } from "./MagicParticles";

/** Fond immersif global — brume, aurore, particules */
export function MagicBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Aurore haut */}
      <div className="absolute inset-x-0 top-[-10%] h-[70vh] bg-aurora opacity-70 blur-3xl" />
      {/* Brume bas */}
      <div className="absolute inset-x-0 bottom-[-20%] h-[60vh] bg-gradient-to-t from-royal-900/40 via-transparent to-transparent blur-3xl" />
      {/* Texture bruit */}
      <div className="absolute inset-0 bg-noise opacity-[0.08] mix-blend-overlay" />
      {/* Particules magiques */}
      <MagicParticles className="absolute inset-0" density={0.9} />
      {/* Halos dorés */}
      <div className="absolute left-[10%] top-[20%] h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
      <div className="absolute right-[15%] top-[60%] h-96 w-96 rounded-full bg-royal-500/15 blur-3xl" />
    </div>
  );
}
