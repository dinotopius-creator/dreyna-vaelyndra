export type AvatarAssetLicense =
  | "CC0"
  | "CC-BY"
  | "CC-BY-SA"
  | "Royalty-Free"
  | "Custom-Commercial"
  | "Unknown";

export type AvatarAssetFormat = "glb" | "gltf" | "vrm" | "fbx" | "png" | "svg";

export interface AvatarAssetSource {
  id: string;
  name: string;
  category:
    | "base-avatar"
    | "face"
    | "hair"
    | "outfit"
    | "accessory"
    | "animation"
    | "fallback";
  format: AvatarAssetFormat[];
  license: AvatarAssetLicense;
  commercialUse: boolean;
  attributionRequired: boolean;
  redistributable: boolean;
  modifiable: boolean;
  url: string;
  notes: string;
}

export const AVATAR_ASSET_SOURCES: AvatarAssetSource[] = [
  {
    id: "sketchfab-cc-downloadable",
    name: "Sketchfab downloadable CC models",
    category: "base-avatar",
    format: ["glb", "gltf", "fbx"],
    license: "CC-BY",
    commercialUse: true,
    attributionRequired: true,
    redistributable: false,
    modifiable: true,
    url: "https://sketchfab.com/terms",
    notes:
      "Only downloadable models with a clearly stated Creative Commons or explicit license should be used. Respect the model license on download.",
  },
  {
    id: "mixamo-animations",
    name: "Mixamo animation library",
    category: "animation",
    format: ["fbx"],
    license: "Royalty-Free",
    commercialUse: true,
    attributionRequired: false,
    redistributable: false,
    modifiable: true,
    url: "https://www.mixamo.com/",
    notes:
      "Use as an animation source or rigging helper only; export and convert to the engine's runtime format before shipping.",
  },
  {
    id: "kenney-fallbacks",
    name: "Kenney fallback primitives",
    category: "fallback",
    format: ["png", "svg", "glb"],
    license: "CC0",
    commercialUse: true,
    attributionRequired: false,
    redistributable: true,
    modifiable: true,
    url: "https://www.kenney.nl/",
    notes:
      "Use as a non-blocking fallback kit for icons, placeholders and lightweight avatar fallback geometry.",
  },
];

export interface AvatarCompatibilitySlot {
  slot:
    | "head"
    | "face"
    | "hair"
    | "torso"
    | "arms"
    | "hands"
    | "legs"
    | "feet"
    | "outfit"
    | "accessory"
    | "aura";
  allowedFormats: AvatarAssetFormat[];
  notes: string;
}

export const AVATAR_COMPATIBILITY_SLOTS: AvatarCompatibilitySlot[] = [
  { slot: "head", allowedFormats: ["glb", "gltf", "vrm"], notes: "Humanoid base head mesh or rig bone attachment." },
  { slot: "face", allowedFormats: ["png", "svg"], notes: "Face decal, expression overlay or texture layer." },
  { slot: "hair", allowedFormats: ["glb", "gltf", "vrm"], notes: "Hair meshes or cards with separate attachment point." },
  { slot: "torso", allowedFormats: ["glb", "gltf", "vrm"], notes: "Clothed torso mesh or skinned body section." },
  { slot: "arms", allowedFormats: ["glb", "gltf", "vrm"], notes: "Separate arm mesh or accessory attachment to upper-arm bones." },
  { slot: "hands", allowedFormats: ["glb", "gltf", "vrm"], notes: "Hands should remain visible and non-cubic where possible." },
  { slot: "legs", allowedFormats: ["glb", "gltf", "vrm"], notes: "Skinned lower-body mesh compatible with walking animation." },
  { slot: "feet", allowedFormats: ["glb", "gltf", "vrm"], notes: "Footwear or foot mesh with ground-contact preserved." },
  { slot: "outfit", allowedFormats: ["glb", "gltf", "vrm"], notes: "One-piece full outfit that overrides base clothing layers." },
  { slot: "accessory", allowedFormats: ["glb", "gltf", "vrm"], notes: "Hat, crown, visor, glasses or face attachment." },
  { slot: "aura", allowedFormats: ["png", "svg", "glb"], notes: "Back or aura effect, rendered lightly for premium users." },
];

export function getPremiumAvatarFallbackNotes() {
  return [
    "Prefer GLB/GLTF humanoid bases, then VRM if the rig fits the pipeline.",
    "Use Mixamo or equivalent motion data only for legally usable characters.",
    "Keep existing purchases mapped into compatibility slots rather than deleting them.",
    "Never replace the avatar with cubes or placeholders when a model fails to load.",
  ];
}
