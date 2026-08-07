import { MagicParticles } from "./MagicParticles";

/** Fond immersif global : brume, aurore et particules. */
export function MagicBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-x-0 top-[-10%] h-[70vh] bg-aurora opacity-55 blur-3xl sm:opacity-70" />
      <div className="absolute inset-x-0 bottom-[-20%] h-[60vh] bg-gradient-to-t from-royal-900/40 via-transparent to-transparent blur-3xl" />
      <div className="absolute inset-0 bg-noise opacity-[0.08] mix-blend-overlay" />
      <MagicParticles className="absolute inset-0" density={0.9} />
      <div className="absolute left-[10%] top-[20%] hidden h-72 w-72 rounded-full bg-gold-500/10 blur-3xl sm:block" />
      <div className="absolute right-[15%] top-[60%] hidden h-96 w-96 rounded-full bg-royal-500/15 blur-3xl sm:block" />
    </div>
  );
}
