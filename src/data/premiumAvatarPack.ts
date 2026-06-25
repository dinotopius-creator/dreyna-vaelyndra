export type PremiumAvatarAsset = {
  name: string;
  kind: "hair" | "outfit" | "texture" | "tool";
  source: string;
  format: string;
  notes: string;
};

export const PREMIUM_AVATAR_PACK = {
  title: "Pack premium VRoid installé",
  subtitle:
    "Sources achetées légalement, conservées en local et référencées dans l'atelier Avatar.",
  assets: [
    {
      name: "SuccuHair 01 WineRuby",
      kind: "hair",
      source: "BOOTH / 7a04m",
      format: ".vroid preset",
      notes:
        "Preset de cheveux VRoid Studio, base premium pour un rendu anime plus travaillé.",
    },
    {
      name: "Koakuma Set Full",
      kind: "outfit",
      source: "BOOTH / 7a04m",
      format: ".vroidcustomitem + textures",
      notes:
        "Set vêtements complet avec variations de couleurs et pièces séparées pour le layering.",
    },
    {
      name: "Koakuma Set Document",
      kind: "tool",
      source: "BOOTH / 7a04m",
      format: "TXT",
      notes:
        "Documentation d'import et d'utilisation conservée dans le dépôt pour audit et intégration.",
    },
  ] as PremiumAvatarAsset[],
  previews: [
    "/avatar-premium/koakuma-01.png",
    "/avatar-premium/koakuma-02.png",
    "/avatar-premium/koakuma-03.png",
    "/avatar-premium/koakuma-04.png",
    "/avatar-premium/koakuma-05.png",
  ],
  vrmModels: [
    {
      name: "Vaelyndra Premium Female",
      path: "/avatar-premium/vrm/vaelyndra-premium-female.vrm",
      note: "Modèle principal exporté depuis VRoid Studio.",
    },
    {
      name: "Vaelyndra Premium Female 2",
      path: "/avatar-premium/vrm/vaelyndra-premium-female-2.vrm",
      note: "Variante premium alternative avec les mêmes sources.",
    },
    {
      name: "Only air",
      path: "/avatar-premium/vrm/only-air.vrm",
      note: "Version de secours / comparaison.",
    },
  ],
  installNote:
    "Le runtime web ne lit pas directement les fichiers .vroid/.vroidcustomitem. Ces sources servent de pack de référence, de base de production et de future exportation VRM/GLB.",
  missingModelNote:
    "Le modèle VRM complet 'succu' n'est pas présent dans le dépôt. Les sources disponibles sont le preset SuccuHair et les exports VRM Vaelyndra Premium. Tant que le modèle complet n'est pas fourni, l'atelier affiche le VRM premium installé plutôt qu'un ancien fallback.",
} as const;
