import { CATALOG_BY_ID, type ShopItem } from "./avatarShop";

export type HumanoidAttachmentSlot =
  | "head"
  | "face"
  | "neck"
  | "torso"
  | "arms"
  | "hands"
  | "legs"
  | "feet"
  | "back"
  | "aura"
  | "full-outfit"
  | "classic";

export type HumanoidCompatibilityStatus =
  | "compatible"
  | "adapted"
  | "classic-fallback";

export interface HumanoidCompatibility {
  status: HumanoidCompatibilityStatus;
  slot: HumanoidAttachmentSlot;
  label: string;
}

const ACCESSORY_SLOT_BY_THEME: Record<string, HumanoidAttachmentSlot> = {
  crown: "head",
  halo: "head",
  horns: "head",
  "elf-ears": "head",
  "fae-ears": "head",
  antlers: "head",
  circlet: "head",
  gem: "face",
  laurel: "head",
  "moon-crown": "head",
  butterfly: "back",
  visor: "face",
  "rose-circlet": "head",
  "crystal-mask": "face",
  "sun-halo": "head",
  ribbon: "head",
  "star-tiara": "head",
  "onyx-horns": "head",
};

export function resolveHumanoidCompatibility(
  itemId: string | null | undefined,
): HumanoidCompatibility | null {
  if (!itemId) return null;
  const item = CATALOG_BY_ID[itemId];
  if (!item) {
    return {
      status: "classic-fallback",
      slot: "classic",
      label: "Conservé dans l'inventaire",
    };
  }
  return compatibilityForItem(item);
}

export function compatibilityForItem(item: ShopItem): HumanoidCompatibility | null {
  if (item.category === "outfit3d") {
    return {
      status: "adapted",
      slot: "full-outfit",
      label: "Adapté à l'avatar humanoïde",
    };
  }
  if (item.category === "accessory3d") {
    return {
      status: item.wearableThemeId ? "compatible" : "classic-fallback",
      slot: item.wearableThemeId ? ACCESSORY_SLOT_BY_THEME[item.wearableThemeId] ?? "head" : "classic",
      label: item.wearableThemeId
        ? "Compatible avatar humanoïde"
        : "Conservé dans l'inventaire",
    };
  }
  if (item.category === "frame") {
    return {
      status: "compatible",
      slot: "aura",
      label: "Compatible portrait humanoïde",
    };
  }
  return null;
}
