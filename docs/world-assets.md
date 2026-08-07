# World Assets

## Current World Scene

- Source: local procedural Three.js world implementation in `src/components/worlds/World3DStage.tsx`
- License: project-owned source code
- Usage: primary in-app 3D world scene
- Notes: the world is built from procedural meshes, terrain, props, fog, lights, and interactive hotspots so it remains mobile-friendly and legally safe.

## Asset Strategy

- Keep the world fully integrated in-app with no browser-like chrome.
- Prefer GLB/GLTF or other legally licensed environment packs if a future asset migration is approved.
- Any external asset added later must include:
  - source link,
  - author,
  - license,
  - commercial use status,
  - attribution requirement,
  - file location,
  - optimization notes.

## Replacement Policy

- The legacy world stays only as a fallback internal implementation.
- The primary experience remains the premium mobile-first world scene in the app.
- No protected assets from Fortnite, ZEPETO, Avakin Life, Roblox, or similar products are used.
