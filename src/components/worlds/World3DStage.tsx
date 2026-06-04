import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import type { AccessoryTheme, OutfitTheme } from "../Avatar3DModel";
import { CATALOG_BY_ID } from "../../lib/avatarShop";

export type World3DDistrictId = "place" | "arcades" | "observatory";

export interface World3DPlayer {
  id: string;
  username: string;
  x: number;
  y: number;
  isSelf?: boolean;
  voiceEnabled: boolean;
  isSpeaking?: boolean;
  interactionKind?: string | null;
  appearance?: World3DAppearance | null;
  familiarIcon?: string | null;
  familiarColor?: string | null;
  familiarName?: string | null;
}

export interface World3DAppearance {
  avatarUrl?: string | null;
  outfit3d?: string | null;
  accessory3d?: string | null;
  frame?: string | null;
}

export interface World3DLueur {
  id: string;
  x: number;
  y: number;
  value: number;
  rarity: "common" | "rare" | "epic";
}

export interface World3DHotspot {
  id: string;
  title: string;
  x: number;
  y: number;
  glyph: string;
}

interface Props {
  district: World3DDistrictId;
  players: World3DPlayer[];
  lueurs: World3DLueur[];
  hotspots: World3DHotspot[];
  onMove: (position: { x: number; y: number }) => void;
  onSelectPlayer: (playerId: string, anchor: { x: number; y: number }) => void;
  onCollectLueur: (id: string) => void;
  onTriggerHotspot: (id: string) => void;
}

interface AvatarEntity {
  group: THREE.Group;
  target: THREE.Vector3;
  current: THREE.Vector3;
  last: THREE.Vector3;
  mic: THREE.Mesh;
  torso: THREE.Mesh;
  hips: THREE.Mesh;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Mesh;
  hair: THREE.Mesh;
  shadow: THREE.Mesh;
  suitMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  accessoryRoot: THREE.Group;
  parureRoot: THREE.Group;
  familiarRoot: THREE.Group | null;
  appearanceKey: string;
  familiarKey: string;
  jumpVelocity: number;
  jumpHeight: number;
  phase: number;
  moving: boolean;
  lastSeenAt: number;
  userId: string;
}

interface LueurEntity {
  group: THREE.Group;
  id: string;
}

interface HotspotEntity {
  group: THREE.Group;
  id: string;
}

const WORLD_WIDTH = 24;
const WORLD_DEPTH = 18;
const SELF_ID = "__self__";
const REMOTE_AVATAR_GRACE_MS = 8000;
const MAX_PIXEL_RATIO = 1.65;

interface AnalogInput {
  active: boolean;
  x: number;
  y: number;
}

interface CameraInput {
  yawDelta: number;
  pitchDelta: number;
}

function pctToWorld(x: number, y: number) {
  return new THREE.Vector3(
    ((x - 50) / 100) * WORLD_WIDTH,
    0,
    ((y - 50) / 100) * WORLD_DEPTH,
  );
}

function worldToPct(position: THREE.Vector3) {
  return {
    x: THREE.MathUtils.clamp((position.x / WORLD_WIDTH) * 100 + 50, 10, 88),
    y: THREE.MathUtils.clamp((position.z / WORLD_DEPTH) * 100 + 50, 18, 84),
  };
}

function hasValidWorldPosition(player: World3DPlayer) {
  return Number.isFinite(player.x) && Number.isFinite(player.y);
}

function colorForPlayer(id: string, isSelf?: boolean) {
  if (isSelf) return 0xfacc15;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  const palette = [0x67e8f9, 0xf9a8d4, 0xa7f3d0, 0xc4b5fd, 0xfde68a];
  return palette[hash % palette.length];
}

const OUTFIT_COLORS: Record<OutfitTheme, { main: number; trim: number; glow: number }> = {
  base: { main: 0x475569, trim: 0xfacc15, glow: 0x38bdf8 },
  royal: { main: 0x7c2d12, trim: 0xfacc15, glow: 0xf59e0b },
  battle: { main: 0x1f2937, trim: 0xef4444, glow: 0xf97316 },
  mystic: { main: 0x4c1d95, trim: 0xc4b5fd, glow: 0xa855f7 },
  shadow: { main: 0x020617, trim: 0x64748b, glow: 0x475569 },
  celestial: { main: 0x1e3a8a, trim: 0x93c5fd, glow: 0x38bdf8 },
  verdant: { main: 0x14532d, trim: 0x86efac, glow: 0x22c55e },
  ember: { main: 0x7f1d1d, trim: 0xfbbf24, glow: 0xf97316 },
  frost: { main: 0x164e63, trim: 0xbae6fd, glow: 0x67e8f9 },
  rose: { main: 0x831843, trim: 0xf9a8d4, glow: 0xec4899 },
  oracle: { main: 0x312e81, trim: 0xfef3c7, glow: 0x8b5cf6 },
  street: { main: 0x111827, trim: 0x22d3ee, glow: 0x06b6d4 },
  ceremony: { main: 0x78350f, trim: 0xfde68a, glow: 0xf59e0b },
  neon: { main: 0x0f172a, trim: 0x22d3ee, glow: 0xec4899 },
};

function themeFromItem<T extends string>(itemId: string | null | undefined): T | null {
  if (!itemId) return null;
  const theme = CATALOG_BY_ID[itemId]?.wearableThemeId;
  return typeof theme === "string" ? (theme as T) : null;
}

function appearanceKey(appearance?: World3DAppearance | null) {
  return [
    appearance?.avatarUrl ?? "",
    appearance?.outfit3d ?? "",
    appearance?.accessory3d ?? "",
    appearance?.frame ?? "",
  ].join("|");
}

function familiarKey(player: World3DPlayer) {
  return [player.familiarIcon ?? "", player.familiarColor ?? "", player.familiarName ?? ""].join("|");
}

function setObjectUserData(object: THREE.Object3D, data: Record<string, string>) {
  object.userData = { ...object.userData, ...data };
  object.children.forEach((child) => setObjectUserData(child, data));
}

function terrainHeightAt(x: number, z: number, district: World3DDistrictId) {
  const ridge = Math.max(0, Math.abs(x) - 6.2) * 0.16 + Math.max(0, Math.abs(z) - 5.1) * 0.14;
  const waves =
    Math.sin(x * 0.62 + z * 0.28) * 0.13 +
    Math.cos(z * 0.54 - x * 0.18) * 0.11;
  const centerFlatten = THREE.MathUtils.clamp(Math.hypot(x / 6.8, z / 4.8), 0, 1);
  const districtLift = district === "observatory" ? 0.18 : district === "arcades" ? 0.08 : 0.12;
  return Math.max(0, (ridge + waves + districtLift) * centerFlatten);
}

function makeLimb(material: THREE.Material, height = 0.72) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, height, 4, 8), material);
  mesh.castShadow = true;
  mesh.position.y = -height / 2;
  group.add(mesh);
  return group;
}

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    group.remove(group.children[0]);
  }
}

function createAccessory(theme: AccessoryTheme) {
  const root = new THREE.Group();
  if (!theme) return root;
  const gold = new THREE.MeshStandardMaterial({
    color: theme === "crystal-mask" || theme === "visor" ? 0x67e8f9 : 0xfacc15,
    emissive: theme === "halo" || theme === "sun-halo" ? 0xf59e0b : 0x000000,
    emissiveIntensity: theme === "halo" || theme === "sun-halo" ? 0.32 : 0.04,
    roughness: 0.35,
    metalness: 0.22,
  });
  if (theme.includes("ears")) {
    [-0.34, 0.34].forEach((x) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 12), gold);
      ear.position.set(x, 2.36, 0);
      ear.rotation.z = x < 0 ? 0.85 : -0.85;
      root.add(ear);
    });
    return root;
  }
  if (theme.includes("horns") || theme === "antlers" || theme === "onyx-horns") {
    [-0.2, 0.2].forEach((x) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 14), gold);
      horn.position.set(x, 2.68, 0.02);
      horn.rotation.z = x < 0 ? 0.32 : -0.32;
      root.add(horn);
    });
    return root;
  }
  if (theme === "halo" || theme === "sun-halo") {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 10, 42), gold);
    halo.position.y = 2.83;
    halo.rotation.x = Math.PI / 2;
    root.add(halo);
    return root;
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.16, 5), gold);
  crown.position.y = 2.65;
  crown.castShadow = true;
  root.add(crown);
  return root;
}

function createOutfitDetails(theme: OutfitTheme, trimColor: number) {
  const root = new THREE.Group();
  const trim = new THREE.MeshStandardMaterial({
    color: trimColor,
    emissive: trimColor,
    emissiveIntensity: theme === "base" ? 0.08 : 0.22,
    roughness: 0.38,
    metalness: 0.18,
  });
  const chest = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.018, 6, 32), trim);
  chest.position.set(0, 1.78, 0.325);
  chest.rotation.x = Math.PI / 2;
  root.add(chest);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.018, 6, 32), trim);
  belt.position.set(0, 1.2, 0);
  belt.scale.z = 0.72;
  belt.rotation.x = Math.PI / 2;
  root.add(belt);
  if (theme === "royal" || theme === "ceremony" || theme === "oracle") {
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.12, 1, 1),
      new THREE.MeshStandardMaterial({ color: trimColor, transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
    );
    cape.position.set(0, 1.34, -0.36);
    cape.rotation.x = -0.12;
    root.add(cape);
  }
  if (theme === "neon" || theme === "street" || theme === "frost") {
    [-0.43, 0.43].forEach((x) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.74, 0.035), trim);
      strip.position.set(x, 1.62, 0.33);
      root.add(strip);
    });
  }
  return root;
}

function createParure(frameId: string | null | undefined) {
  const root = new THREE.Group();
  if (!frameId) return root;
  const color = frameId.includes("heart")
    ? 0xf9a8d4
    : frameId.includes("moon")
      ? 0xc4b5fd
      : frameId.includes("leaf") || frameId.includes("lily")
        ? 0x86efac
        : frameId.includes("flame")
          ? 0xfb923c
          : 0xfacc15;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.018, 8, 56), material);
  ring.position.y = 1.62;
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.014, 8, 44), material);
  aura.position.y = 2.38;
  root.add(aura);
  return root;
}

function createFamiliar(player: World3DPlayer) {
  if (!player.familiarIcon) return null;
  const color = new THREE.Color(player.familiarColor || "#facc15").getHex();
  const root = new THREE.Group();
  root.position.set(0.72, 0, 0.72);
  const familiarName = `${player.familiarName ?? ""} ${player.familiarIcon ?? ""}`.toLowerCase();
  const isFox = familiarName.includes("renard") || familiarName.includes("fox") || player.familiarIcon.includes("🦊");
  const isCat = familiarName.includes("chat") || familiarName.includes("cat") || player.familiarIcon.includes("🐱") || player.familiarIcon.includes("🐈");
  const isDragon = familiarName.includes("dragon") || player.familiarIcon.includes("🐉") || player.familiarIcon.includes("🐲");
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: isDragon ? 0.2 : 0.14,
    roughness: 0.68,
  });
  const bellyMaterial = new THREE.MeshStandardMaterial({ color: 0xfff7d6, roughness: 0.74 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.72 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(isDragon ? 0.25 : 0.23, 18, 14), bodyMaterial);
  body.scale.set(isFox ? 1.28 : 1.08, isDragon ? 0.82 : 0.72, isFox ? 0.82 : 0.92);
  body.position.y = 0.3;
  body.castShadow = true;
  root.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), bellyMaterial);
  belly.scale.set(0.85, 0.6, 0.34);
  belly.position.set(0, 0.31, 0.2);
  root.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(isDragon ? 0.18 : 0.16, 16, 12), bodyMaterial);
  head.position.set(0, 0.53, 0.24);
  head.castShadow = true;
  root.add(head);
  [-0.12, 0.12].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(isFox ? 0.07 : 0.055, isDragon ? 0.18 : 0.17, 10), bodyMaterial);
    ear.position.set(x, 0.7, 0.18);
    ear.rotation.z = x < 0 ? 0.18 : -0.18;
    root.add(ear);
  });
  const snout = new THREE.Mesh(new THREE.ConeGeometry(isFox ? 0.075 : 0.055, isDragon ? 0.14 : 0.12, 12), bellyMaterial);
  snout.position.set(0, 0.52, 0.41);
  snout.rotation.x = Math.PI / 2;
  root.add(snout);
  const tail = new THREE.Mesh(
    isFox
      ? new THREE.ConeGeometry(0.12, 0.58, 14)
      : new THREE.CapsuleGeometry(0.055, isDragon ? 0.5 : 0.34, 5, 10),
    isFox ? bodyMaterial : darkMaterial,
  );
  tail.position.set(0, 0.33, -0.43);
  tail.rotation.x = isFox ? -1.15 : -0.75;
  tail.castShadow = true;
  root.add(tail);
  if (isFox) {
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), bellyMaterial);
    tailTip.position.set(0, 0.58, -0.68);
    root.add(tailTip);
  }
  if (isDragon) {
    [-0.18, 0.18].forEach((x) => {
      const wing = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.38, 3),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
      );
      wing.position.set(x, 0.48, -0.08);
      wing.rotation.set(0.6, 0, x < 0 ? -0.85 : 0.85);
      root.add(wing);
    });
  }
  [-0.16, 0.16].forEach((x) => {
    [-0.12, 0.18].forEach((z) => {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), isCat ? darkMaterial : bodyMaterial);
      paw.scale.y = 0.55;
      paw.position.set(x, 0.08, z);
      root.add(paw);
    });
  });
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);
  setObjectUserData(root, { kind: "familiar", id: player.id });
  return root;
}

function applyAppearance(entity: AvatarEntity, player: World3DPlayer) {
  const nextKey = appearanceKey(player.appearance);
  if (entity.appearanceKey === nextKey) return;
  entity.appearanceKey = nextKey;
  const outfit = themeFromItem<OutfitTheme>(player.appearance?.outfit3d) ?? "base";
  const accessory = themeFromItem<NonNullable<AccessoryTheme>>(player.appearance?.accessory3d);
  const colors = OUTFIT_COLORS[outfit] ?? OUTFIT_COLORS.base;
  entity.suitMaterial.color.setHex(player.isSelf && outfit === "base" ? colorForPlayer(player.id, true) : colors.main);
  entity.suitMaterial.emissive.setHex(colors.glow);
  entity.suitMaterial.emissiveIntensity = outfit === "base" ? 0.08 : 0.18;
  entity.trimMaterial.color.setHex(colors.trim);
  entity.trimMaterial.emissive.setHex(colors.glow);
  entity.trimMaterial.emissiveIntensity = outfit === "base" ? 0.06 : 0.22;
  clearGroup(entity.accessoryRoot);
  clearGroup(entity.parureRoot);
  entity.accessoryRoot.add(createOutfitDetails(outfit, colors.trim));
  entity.accessoryRoot.add(createAccessory(accessory));
  entity.parureRoot.add(createParure(player.appearance?.frame));
}

function syncFamiliar(entity: AvatarEntity, player: World3DPlayer) {
  const nextKey = familiarKey(player);
  if (entity.familiarKey === nextKey) return;
  entity.familiarKey = nextKey;
  if (entity.familiarRoot) {
    entity.group.remove(entity.familiarRoot);
    entity.familiarRoot = null;
  }
  const familiar = createFamiliar(player);
  if (familiar) {
    entity.familiarRoot = familiar;
    entity.group.add(familiar);
  }
}

function createAvatar(player: World3DPlayer) {
  const accent = colorForPlayer(player.id, player.isSelf);
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c7a1, roughness: 0.82 });
  const suit = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.58,
    metalness: 0.08,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.25,
    roughness: 0.45,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.12,
    roughness: 0.42,
    metalness: 0.14,
  });

  const group = new THREE.Group();
  group.position.copy(pctToWorld(player.x, player.y));

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.58), suit);
  hips.position.y = 1.05;
  hips.castShadow = true;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.9, 0.62), suit);
  torso.position.y = 1.58;
  torso.castShadow = true;
  group.add(torso);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.045), trim);
  chestPlate.position.set(0, 1.72, 0.335);
  chestPlate.castShadow = true;
  group.add(chestPlate);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), skin);
  head.position.y = 2.26;
  head.castShadow = true;
  group.add(head);
  [-0.11, 0.11].forEach((x) => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 8),
      new THREE.MeshBasicMaterial({ color: player.isSelf ? 0xfef3c7 : 0xe0f2fe }),
    );
    eye.position.set(x, 2.3, 0.31);
    group.add(eye);
  });

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  hair.position.y = 2.42;
  hair.castShadow = true;
  group.add(hair);

  const leftLeg = makeLimb(suit, 0.76);
  leftLeg.position.set(-0.22, 0.95, 0);
  group.add(leftLeg);
  const rightLeg = makeLimb(suit, 0.76);
  rightLeg.position.set(0.22, 0.95, 0);
  group.add(rightLeg);

  const leftArm = makeLimb(skin, 0.72);
  leftArm.position.set(-0.55, 1.86, 0);
  group.add(leftArm);
  const rightArm = makeLimb(skin, 0.72);
  rightArm.position.set(0.55, 1.86, 0);
  group.add(rightArm);

  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.42), dark);
  leftFoot.position.set(-0.22, 0.05, 0.12);
  leftFoot.castShadow = true;
  group.add(leftFoot);
  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.22;
  group.add(rightFoot);

  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), glow);
  mic.position.y = 2.9;
  group.add(mic);

  const micRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.018, 8, 24),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5 }),
  );
  micRing.position.y = 2.9;
  micRing.rotation.x = Math.PI / 2;
  group.add(micRing);

  const accessoryRoot = new THREE.Group();
  group.add(accessoryRoot);
  const parureRoot = new THREE.Group();
  group.add(parureRoot);

  setObjectUserData(group, { kind: "player", id: player.id });

  const entity = {
    group,
    target: group.position.clone(),
    current: group.position.clone(),
    last: group.position.clone(),
    mic,
    torso,
    hips,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    head,
    hair,
    shadow,
    suitMaterial: suit,
    trimMaterial: trim,
    accessoryRoot,
    parureRoot,
    familiarRoot: null,
    appearanceKey: "",
    familiarKey: "",
    jumpVelocity: 0,
    jumpHeight: 0,
    phase: 0,
    moving: false,
    lastSeenAt: performance.now(),
    userId: player.id,
  } satisfies AvatarEntity;
  applyAppearance(entity, player);
  syncFamiliar(entity, player);
  return entity;
}

function createGround(district: World3DDistrictId) {
  const group = new THREE.Group();
  const color = district === "observatory" ? 0x1e1b4b : district === "arcades" ? 0x064e5f : 0x14532d;
  const groundGeometry = new THREE.PlaneGeometry(WORLD_WIDTH + 8, WORLD_DEPTH + 8, 48, 40);
  const positions = groundGeometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(index, terrainHeightAt(x, y, district));
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.02,
      vertexColors: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const socialPlate = new THREE.Mesh(
    new THREE.CircleGeometry(5.15, 72),
    new THREE.MeshStandardMaterial({
      color: district === "observatory" ? 0x312e81 : district === "arcades" ? 0x0e7490 : 0x3f2b16,
      roughness: 0.64,
      metalness: 0.04,
      transparent: true,
      opacity: 0.84,
    }),
  );
  socialPlate.rotation.x = -Math.PI / 2;
  socialPlate.position.y = 0.035;
  socialPlate.receiveShadow = true;
  group.add(socialPlate);

  const path = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 4.7, 88),
    new THREE.MeshStandardMaterial({
      color: district === "observatory" ? 0x7c3aed : district === "arcades" ? 0x0891b2 : 0xb45309,
      roughness: 0.72,
      transparent: true,
      opacity: 0.62,
    }),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.018;
  group.add(path);

  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0x312e81 : district === "arcades" ? 0x155e75 : 0x365314,
    roughness: 0.86,
  });
  [
    [-10.8, -7.2, 2.6, 1.1],
    [-9.6, 6.4, 2.1, 0.9],
    [9.8, -6.6, 2.4, 1.0],
    [10.7, 6.2, 2.8, 1.2],
    [0, -8.2, 3.2, 0.8],
  ].forEach(([x, z, radius, height], index) => {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 28), ridgeMaterial);
    hill.position.set(x, height / 2 - 0.02, z);
    hill.rotation.y = index * 0.7;
    hill.castShadow = true;
    hill.receiveShadow = true;
    group.add(hill);
  });

  return group;
}

function createWorldProps(district: World3DDistrictId) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0x8b5cf6 : district === "arcades" ? 0x22d3ee : 0xfacc15,
    roughness: 0.55,
    metalness: 0.12,
  });

  const positions = [
    [-8.4, -5.6],
    [-6.8, 3.8],
    [7.2, 4.2],
    [8.8, -4.5],
  ];
  positions.forEach(([x, z], index) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, 2.1 + (index % 2) * 0.6, 12),
      material,
    );
    pillar.position.set(x, pillar.geometry.parameters.height / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
  });

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0x64748b : district === "arcades" ? 0x0f766e : 0x57534e,
    roughness: 0.82,
    metalness: 0.04,
  });
  const flowerMaterial = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0xf0abfc : district === "arcades" ? 0x67e8f9 : 0xf9a8d4,
    emissive: district === "observatory" ? 0x86198f : 0x0e7490,
    emissiveIntensity: 0.16,
    roughness: 0.48,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0xa7f3d0 : district === "arcades" ? 0x22d3ee : 0x86efac,
    roughness: 0.72,
  });

  [
    [-7.2, -2.8],
    [-5.5, 6.5],
    [5.6, -5.8],
    [6.9, 2.4],
    [1.8, 7.1],
  ].forEach(([x, z], index) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + (index % 3) * 0.1, 0), rockMaterial);
    rock.position.set(x, 0.22, z);
    rock.scale.set(1.3, 0.62, 0.88);
    rock.rotation.set(0.2, index * 0.8, -0.08);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  });

  Array.from({ length: 22 }).forEach((_, index) => {
    const angle = index * 1.71;
    const radius = 5.7 + (index % 5) * 0.72;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * (radius * 0.68);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.24, 5), leafMaterial);
    stem.position.set(x, 0.13, z);
    group.add(stem);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.055 + (index % 3) * 0.012, 8, 6), flowerMaterial);
    bloom.position.set(x, 0.28, z);
    bloom.castShadow = true;
    group.add(bloom);
  });

  const treeTrunk = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78 });
  const treeLeaf = new THREE.MeshStandardMaterial({
    color: district === "observatory" ? 0x7c3aed : district === "arcades" ? 0x06b6d4 : 0x22c55e,
    emissive: district === "arcades" ? 0x0e7490 : 0x064e3b,
    emissiveIntensity: district === "arcades" ? 0.18 : 0.06,
    roughness: 0.65,
  });
  [
    [-10.2, 0.5],
    [-8.4, 7.0],
    [9.2, 5.4],
    [10.4, -1.5],
  ].forEach(([x, z], index) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.05, 8), treeTrunk);
    trunk.position.set(x, 0.52, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.55 + (index % 2) * 0.16, 1.05, 10), treeLeaf);
    crown.position.set(x, 1.38, z);
    crown.castShadow = true;
    group.add(crown);
  });

  const swingMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.52, metalness: 0.1 });
  const swing = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), swingMaterial);
  top.position.y = 1.7;
  swing.add(top);
  [-0.76, 0.76].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.65, 8), swingMaterial);
    post.position.set(x, 0.85, 0);
    post.rotation.z = x < 0 ? -0.15 : 0.15;
    swing.add(post);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6), swingMaterial);
    rope.position.set(x * 0.4, 1.22, 0);
    swing.add(rope);
  });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.26), swingMaterial);
  seat.position.y = 0.82;
  swing.add(seat);
  swing.position.set(district === "observatory" ? -5.8 : 5.8, 0, district === "arcades" ? 5.8 : -3.8);
  swing.rotation.y = district === "arcades" ? -0.35 : 0.25;
  group.add(swing);

  if (district === "place") {
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.35, 0.38, 32),
      new THREE.MeshStandardMaterial({ color: 0xd6b16f, roughness: 0.52 }),
    );
    fountain.position.y = 0.19;
    fountain.castShadow = true;
    group.add(fountain);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0e7490, emissiveIntensity: 0.2 }),
    );
    water.position.y = 0.45;
    group.add(water);
  }

  if (district === "arcades") {
    [-3.5, 0, 3.5].forEach((x) => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.4, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x164e63, emissive: 0x0891b2, emissiveIntensity: 0.18 }),
      );
      panel.position.set(x, 1.25, -6.2);
      panel.castShadow = true;
      group.add(panel);
    });
  }

  if (district === "observatory") {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x312e81, transparent: true, opacity: 0.55, roughness: 0.3 }),
    );
    dome.position.set(0, 0.7, -4.5);
    group.add(dome);
  }

  return group;
}

function createLueur(node: World3DLueur) {
  const group = new THREE.Group();
  group.position.copy(pctToWorld(node.x, node.y));
  group.position.y = 0.7;
  const color = node.rarity === "epic" ? 0x67e8f9 : node.rarity === "rare" ? 0xfde68a : 0xfacc15;
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(node.rarity === "epic" ? 0.18 : 0.14, 18, 18),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85 }),
  );
  group.add(orb);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  setObjectUserData(group, { kind: "lueur", id: node.id });
  return { group, id: node.id } satisfies LueurEntity;
}

function createHotspot(node: World3DHotspot) {
  const group = new THREE.Group();
  group.position.copy(pctToWorld(node.x, node.y));
  group.position.y = 0.08;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.52, 0.18, 18),
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.55 }),
  );
  group.add(base);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, emissiveIntensity: 0.28 }),
  );
  crystal.position.y = 0.62;
  crystal.castShadow = true;
  group.add(crystal);
  setObjectUserData(group, { kind: "hotspot", id: node.id });
  return { group, id: node.id } satisfies HotspotEntity;
}

export function World3DStage({
  district,
  players,
  lueurs,
  hotspots,
  onMove,
  onSelectPlayer,
  onCollectLueur,
  onTriggerHotspot,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const joystickPadRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const joystickInputRef = useRef<AnalogInput>({ active: false, x: 0, y: 0 });
  const cameraInputRef = useRef<CameraInput>({ yawDelta: 0, pitchDelta: 0 });
  const playersRef = useRef(players);
  const lueursRef = useRef(lueurs);
  const hotspotsRef = useRef(hotspots);
  const onMoveRef = useRef(onMove);
  const onSelectPlayerRef = useRef(onSelectPlayer);
  const onCollectLueurRef = useRef(onCollectLueur);
  const onTriggerHotspotRef = useRef(onTriggerHotspot);

  playersRef.current = players;
  lueursRef.current = lueurs;
  hotspotsRef.current = hotspots;
  onMoveRef.current = onMove;
  onSelectPlayerRef.current = onSelectPlayer;
  onCollectLueurRef.current = onCollectLueur;
  onTriggerHotspotRef.current = onTriggerHotspot;

  const self = useMemo(() => players.find((player) => player.isSelf), [players]);
  const [joystickUi, setJoystickUi] = useState({ active: false, x: 0, y: 0 });
  const [cameraTouchActive, setCameraTouchActive] = useState(false);

  const updateJoystickFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pad = joystickPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = Math.max(1, rect.width / 2);
    const rawX = event.clientX - (rect.left + radius);
    const rawY = event.clientY - (rect.top + radius);
    const distance = Math.min(radius, Math.hypot(rawX, rawY));
    const angle = Math.atan2(rawY, rawX);
    const x = (Math.cos(angle) * distance) / radius;
    const y = (Math.sin(angle) * distance) / radius;
    joystickInputRef.current = { active: true, x, y };
    setJoystickUi({ active: true, x, y });
  };

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    joystickInputRef.current = { active: false, x: 0, y: 0 };
    setJoystickUi({ active: false, x: 0, y: 0 });
  };

  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystickFromPointer(event);
  };

  const handleJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    updateJoystickFromPointer(event);
  };

  const handleJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    resetJoystick();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(district === "observatory" ? 0x050116 : 0x08111f, 16, 42);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
    camera.position.set(0, 8.4, 13.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xfff7d6, 0x0f172a, 1.9);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(district === "observatory" ? 0xc4b5fd : 0xffe7a3, 3.2);
    sun.position.set(-7, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    scene.add(createGround(district));
    scene.add(createWorldProps(district));

    const entities = new Map<string, AvatarEntity>();
    const lueurEntities = new Map<string, LueurEntity>();
    const hotspotEntities = new Map<string, HotspotEntity>();
    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const keyState = new Set<string>();
    let localPosition = pctToWorld(self?.x ?? 49, self?.y ?? 62);
    let yaw = 0;
    let cameraPitch = 0.12;
    let cameraPointerId: number | null = null;
    let cameraLastX = 0;
    let cameraLastY = 0;
    let cameraDragDistance = 0;
    let lastMoveSent = 0;
    let animationId = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const onKeyDown = (event: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(event.code)) {
        keyState.add(event.code);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keyState.delete(event.code);
    };
    const clearPressedKeys = () => {
      keyState.clear();
      joystickInputRef.current = { active: false, x: 0, y: 0 };
      setJoystickUi({ active: false, x: 0, y: 0 });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPressedKeys);
    document.addEventListener("visibilitychange", clearPressedKeys);

    const raycastAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const hit = hits.find((entry) => entry.object.userData.kind);
      if (!hit) return;
      const kind = hit.object.userData.kind as string;
      const id = hit.object.userData.id as string;
      if (kind === "player" && id !== SELF_ID) {
        onSelectPlayerRef.current(id, { x: event.clientX, y: event.clientY });
      } else if (kind === "lueur") {
        onCollectLueurRef.current(id);
      } else if (kind === "hotspot") {
        onTriggerHotspotRef.current(id);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const isTouchLike =
        event.pointerType === "touch" ||
        event.pointerType === "pen" ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches;
      const isLeftCameraZone = event.clientX <= rect.left + rect.width * 0.56;
      if (isTouchLike && isLeftCameraZone) {
        cameraPointerId = event.pointerId;
        cameraLastX = event.clientX;
        cameraLastY = event.clientY;
        cameraDragDistance = 0;
        setCameraTouchActive(true);
        renderer.domElement.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }
      raycastAt(event);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (cameraPointerId !== event.pointerId) return;
      const dx = event.clientX - cameraLastX;
      const dy = event.clientY - cameraLastY;
      cameraLastX = event.clientX;
      cameraLastY = event.clientY;
      cameraDragDistance += Math.abs(dx) + Math.abs(dy);
      cameraInputRef.current.yawDelta -= dx * 0.006;
      cameraInputRef.current.pitchDelta += dy * 0.0035;
      event.preventDefault();
    };

    const finishCameraPointer = (event: PointerEvent) => {
      if (cameraPointerId !== event.pointerId) return;
      if (cameraDragDistance < 8) {
        raycastAt(event);
      }
      cameraPointerId = null;
      cameraDragDistance = 0;
      setCameraTouchActive(false);
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", finishCameraPointer);
    renderer.domElement.addEventListener("pointercancel", finishCameraPointer);

    const syncCollections = () => {
      const currentLueurs = new Set(lueursRef.current.map((entry) => entry.id));
      lueurEntities.forEach((entity, id) => {
        if (!currentLueurs.has(id)) {
          scene.remove(entity.group);
          lueurEntities.delete(id);
        }
      });
      lueursRef.current.forEach((node) => {
        let entity = lueurEntities.get(node.id);
        if (!entity) {
          entity = createLueur(node);
          lueurEntities.set(node.id, entity);
          scene.add(entity.group);
        }
        entity.group.position.copy(pctToWorld(node.x, node.y));
        entity.group.position.y = 0.7;
      });

      const currentHotspots = new Set(hotspotsRef.current.map((entry) => entry.id));
      hotspotEntities.forEach((entity, id) => {
        if (!currentHotspots.has(id)) {
          scene.remove(entity.group);
          hotspotEntities.delete(id);
        }
      });
      hotspotsRef.current.forEach((node) => {
        let entity = hotspotEntities.get(node.id);
        if (!entity) {
          entity = createHotspot(node);
          hotspotEntities.set(node.id, entity);
          scene.add(entity.group);
        }
        entity.group.position.copy(pctToWorld(node.x, node.y));
        entity.group.position.y = 0.08;
      });
    };

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      syncCollections();

      const playersById = new Map(playersRef.current.map((player) => [player.id, player]));
      const now = performance.now();
      entities.forEach((entity, id) => {
        if (!playersById.has(id) && now - entity.lastSeenAt > REMOTE_AVATAR_GRACE_MS) {
          scene.remove(entity.group);
          entities.delete(id);
        }
      });

      playersRef.current.forEach((player) => {
        let entity = entities.get(player.id);
        if (!entity) {
          entity = createAvatar(player);
          entities.set(player.id, entity);
          scene.add(entity.group);
        }
        entity.lastSeenAt = now;
        if (player.isSelf) {
          entity.target.copy(localPosition);
        } else if (hasValidWorldPosition(player)) {
          entity.target.copy(pctToWorld(player.x, player.y));
        } else {
          entity.target.copy(entity.current);
        }
        const micMaterial = entity.mic.material as THREE.MeshStandardMaterial;
        micMaterial.color.set(player.voiceEnabled ? (player.isSpeaking ? 0x22c55e : 0xfacc15) : 0x475569);
        micMaterial.emissive.set(player.voiceEnabled ? (player.isSpeaking ? 0x16a34a : 0x854d0e) : 0x020617);
        micMaterial.emissiveIntensity = player.voiceEnabled ? (player.isSpeaking ? 0.9 : 0.28) : 0.08;
        applyAppearance(entity, player);
        syncFamiliar(entity, player);
      });

      const currentSelf = self;
      const selfEntity = currentSelf ? entities.get(currentSelf.id) : null;
      if (selfEntity && currentSelf) {
        const cameraInput = cameraInputRef.current;
        if (cameraInput.yawDelta !== 0 || cameraInput.pitchDelta !== 0) {
          yaw += cameraInput.yawDelta;
          cameraPitch = THREE.MathUtils.clamp(cameraPitch + cameraInput.pitchDelta, -0.32, 0.58);
          cameraInput.yawDelta = 0;
          cameraInput.pitchDelta = 0;
        }
        const run = keyState.has("ShiftLeft") || keyState.has("ShiftRight");
        const joystick = joystickInputRef.current;
        const joystickPower = joystick.active
          ? THREE.MathUtils.clamp(Math.hypot(joystick.x, joystick.y), 0, 1)
          : 0;
        const speed = (run || joystickPower > 0.86 ? 7.2 : 4.2) * delta;
        const turnSpeed = 2.8 * delta;
        if (keyState.has("KeyA") || keyState.has("ArrowLeft")) yaw += turnSpeed;
        if (keyState.has("KeyD") || keyState.has("ArrowRight")) yaw -= turnSpeed;
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const movement = new THREE.Vector3();
        if (keyState.has("KeyW") || keyState.has("ArrowUp")) movement.add(forward);
        if (keyState.has("KeyS") || keyState.has("ArrowDown")) movement.sub(forward);
        if (keyState.has("KeyQ")) movement.sub(right);
        if (keyState.has("KeyE")) movement.add(right);
        if (joystick.active) {
          movement.addScaledVector(forward, -joystick.y);
          movement.addScaledVector(right, joystick.x);
        }
        if (movement.lengthSq() > 0) {
          if (movement.lengthSq() > 1) {
            movement.normalize();
          }
          movement.multiplyScalar(speed);
          localPosition.add(movement);
          localPosition.x = THREE.MathUtils.clamp(localPosition.x, -10.8, 10.8);
          localPosition.z = THREE.MathUtils.clamp(localPosition.z, -7.4, 7.4);
          selfEntity.moving = true;
          if (now - lastMoveSent > 90) {
            lastMoveSent = now;
            onMoveRef.current(worldToPct(localPosition));
          }
        } else {
          selfEntity.moving = false;
        }
        selfEntity.target.copy(localPosition);
        if (keyState.has("Space") && selfEntity.jumpHeight <= 0.01) {
          selfEntity.jumpVelocity = 5.5;
        }
        selfEntity.group.rotation.y = yaw;
      }

      entities.forEach((entity) => {
        entity.last.copy(entity.current);
        entity.current.lerp(entity.target, entity.userId === currentSelf?.id ? 0.42 : 0.16);
        const velocity = entity.current.clone().sub(entity.last);
        const speed = velocity.length();
        entity.moving = entity.moving || speed > 0.005;
        if (speed > 0.008 && entity.userId !== currentSelf?.id) {
          entity.group.rotation.y = Math.atan2(velocity.x, velocity.z);
        }
        entity.jumpVelocity -= 11.5 * delta;
        entity.jumpHeight = Math.max(0, entity.jumpHeight + entity.jumpVelocity * delta);
        if (entity.jumpHeight === 0) entity.jumpVelocity = 0;
        entity.phase += delta * (entity.moving ? 8 : 2);
        const walk = entity.moving ? Math.sin(entity.phase) : Math.sin(entity.phase) * 0.08;
        entity.leftLeg.rotation.x = walk * 0.45;
        entity.rightLeg.rotation.x = -walk * 0.45;
        entity.leftArm.rotation.x = -walk * 0.35;
        entity.rightArm.rotation.x = walk * 0.35;
        entity.torso.rotation.z = entity.moving ? Math.sin(entity.phase * 0.5) * 0.035 : 0;
        entity.head.position.y = 2.26 + Math.sin(entity.phase * 0.7) * 0.02;
        if (entity.familiarRoot) {
          const side = entity.userId === currentSelf?.id ? 1 : -1;
          entity.familiarRoot.position.x = THREE.MathUtils.lerp(entity.familiarRoot.position.x, side * 0.72, 0.08);
          entity.familiarRoot.position.z = THREE.MathUtils.lerp(entity.familiarRoot.position.z, entity.moving ? 0.92 : 0.62, 0.08);
          entity.familiarRoot.position.y = Math.sin(entity.phase * 1.4) * (entity.moving ? 0.035 : 0.012);
        }
        entity.group.position.set(entity.current.x, entity.jumpHeight, entity.current.z);
        entity.shadow.scale.setScalar(Math.max(0.55, 1 - entity.jumpHeight * 0.18));
        (entity.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0.12,
          0.28 - entity.jumpHeight * 0.06,
        );
      });

      if (selfEntity) {
        const cameraTarget = selfEntity.group.position.clone();
        cameraTarget.y = 1.2;
        const flatDistance = 7.5 * Math.cos(cameraPitch);
        const cameraHeight = 5.2 + Math.sin(cameraPitch) * 4.2;
        const offset = new THREE.Vector3(
          -Math.sin(yaw) * flatDistance,
          cameraHeight,
          -Math.cos(yaw) * flatDistance,
        );
        camera.position.lerp(cameraTarget.clone().add(offset), 0.08);
        camera.lookAt(cameraTarget);
      } else {
        camera.lookAt(0, 0.8, 0);
      }

      lueurEntities.forEach((entity) => {
        entity.group.rotation.y += delta * 1.6;
        entity.group.position.y = 0.72 + Math.sin(performance.now() / 500 + entity.group.position.x) * 0.08;
      });
      hotspotEntities.forEach((entity) => {
        entity.group.rotation.y += delta * 0.55;
      });

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPressedKeys);
      document.removeEventListener("visibilitychange", clearPressedKeys);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", finishCameraPointer);
      renderer.domElement.removeEventListener("pointercancel", finishCameraPointer);
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [district, self?.id]);

  useEffect(() => {
    if (self) {
      // The renderer effect owns the actual local vector. Remounting by district
      // recenters from the latest React state while keeping the world deterministic.
    }
  }, [self]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="h-full w-full touch-none" />
      <div className="pointer-events-none absolute left-4 top-4 hidden rounded-2xl border border-white/10 bg-night-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-ivory/60 backdrop-blur md:block">
        ZQSD/WASD pour marcher, A/D pour tourner, Q/E strafe, Shift courir, Espace sauter
      </div>
      <div className="pointer-events-none absolute left-[calc(1rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-20 hidden rounded-full border border-cyan-200/20 bg-night-950/55 px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] text-cyan-100/70 backdrop-blur landscape:block md:hidden">
        Tourne la camera a gauche
      </div>
      <div className="pointer-events-none absolute inset-x-4 top-1/2 z-30 -translate-y-1/2 rounded-[28px] border border-gold-200/20 bg-night-950/78 px-5 py-4 text-center shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl landscape:hidden md:hidden">
        <p className="text-[10px] uppercase tracking-[0.24em] text-gold-200/75">
          Mode monde 3D
        </p>
        <p className="mt-2 font-display text-xl text-gold-100">
          Tourne ton telephone
        </p>
        <p className="mt-2 text-sm leading-6 text-ivory/65">
          L'experience APK est optimisee en horizontal : camera a gauche, joystick a droite.
        </p>
      </div>
      <div
        className={`pointer-events-none absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] top-[calc(3.6rem+env(safe-area-inset-top))] w-[48%] rounded-[28px] border border-white/10 bg-night-950/10 backdrop-blur-[1px] transition md:hidden ${
          cameraTouchActive ? "border-cyan-200/30 bg-cyan-200/8" : "opacity-55"
        }`}
        aria-hidden
      >
        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-night-950/60 px-3 py-1 text-[9px] uppercase tracking-[0.18em] text-ivory/55">
          Camera
        </div>
      </div>
      <div
        ref={joystickPadRef}
        className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-20 h-32 w-32 touch-none select-none rounded-full border border-white/15 bg-night-950/35 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden landscape:h-36 landscape:w-36"
        onPointerDown={handleJoystickPointerDown}
        onPointerMove={handleJoystickPointerMove}
        onPointerUp={handleJoystickPointerUp}
        onPointerCancel={handleJoystickPointerUp}
        aria-label="Joystick de deplacement"
        role="application"
      >
        <div className="absolute inset-3 rounded-full border border-gold-200/12 bg-[radial-gradient(circle,rgba(250,204,21,0.10),rgba(15,23,42,0.26)_58%,rgba(15,23,42,0.58))]" />
        <div className="absolute left-1/2 top-1/2 h-px w-20 -translate-x-1/2 bg-white/10" />
        <div className="absolute left-1/2 top-1/2 h-20 w-px -translate-y-1/2 bg-white/10" />
        <div
          className={`absolute left-1/2 top-1/2 flex h-14 w-14 items-center justify-center rounded-full border transition ${
            joystickUi.active
              ? "border-gold-200/70 bg-gold-300/25 shadow-[0_0_28px_rgba(250,204,21,0.28)]"
              : "border-white/18 bg-white/10"
          }`}
          style={{
            transform: `translate(calc(-50% + ${joystickUi.x * 48}px), calc(-50% + ${
              joystickUi.y * 48
            }px))`,
          }}
        >
          <span className="h-3 w-3 rounded-full bg-gold-100/90" />
        </div>
      </div>
    </div>
  );
}

export default World3DStage;
