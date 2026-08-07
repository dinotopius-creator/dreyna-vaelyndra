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
  const [lightMode, setLightMode] = useState(false);
  const reactId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(
      "(max-width: 640px), (pointer: coarse), (prefers-reduced-motion: reduce)",
    );
    const sync = () => setLightMode(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
        fpsLimit: lightMode ? 30 : 60,
        detectRetina: !lightMode,
        interactivity: {
          events: {
            onHover: { enable: !lightMode, mode: "bubble" },
            resize: { enable: true },
          },
          modes: options.interactivity?.modes,
        },
        particles: {
          ...options.particles!,
          number: {
            value: Math.max(12, Math.round(55 * density * (lightMode ? 0.35 : 1))),
            density: { enable: true },
          },
          opacity: {
            value: { min: 0.16, max: lightMode ? 0.4 : 0.8 },
            animation: {
              enable: !lightMode,
              speed: lightMode ? 0 : 0.6,
              sync: false,
            },
          },
          move: {
            enable: true,
            speed: lightMode ? { min: 0.05, max: 0.24 } : { min: 0.1, max: 0.6 },
            direction: "none",
            outModes: { default: "out" },
            random: true,
            straight: false,
          },
        },
      }}
    />
  );
}
