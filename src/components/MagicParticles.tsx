import { useEffect, useId, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

const options: ISourceOptions = {
  fullScreen: { enable: false },
  background: { color: "transparent" },
  fpsLimit: 60,
  detectRetina: true,
  particles: {
    number: { value: 55, density: { enable: true } },
    color: { value: ["#e6c274", "#a97aff", "#7fd8ff", "#fbeecb"] },
    shape: { type: "circle" },
    opacity: {
      value: { min: 0.2, max: 0.8 },
      animation: { enable: true, speed: 0.6, sync: false },
    },
    size: { value: { min: 0.5, max: 2.4 } },
    move: {
      enable: true,
      speed: { min: 0.1, max: 0.6 },
      direction: "none",
      outModes: { default: "out" },
      random: true,
      straight: false,
    },
    twinkle: {
      particles: { enable: true, frequency: 0.05, opacity: 1 },
    },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: "bubble" },
      resize: { enable: true },
    },
    modes: {
      bubble: {
        distance: 120,
        size: 3.2,
        duration: 2,
        opacity: 0.9,
      },
    },
  },
};

export function MagicParticles({
  className = "",
  density = 1,
}: {
  className?: string;
  density?: number;
}) {
  const [ready, setReady] = useState(false);
  const reactId = useId();

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Particles
      id={`tsparticles-${reactId.replace(/[^a-z0-9]/gi, "")}`}
      className={className}
      options={{
        ...options,
        particles: {
          ...options.particles!,
          number: {
            value: Math.round(55 * density),
            density: { enable: true },
          },
        },
      }}
    />
  );
}
