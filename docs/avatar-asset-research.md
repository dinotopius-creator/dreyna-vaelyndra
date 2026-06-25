# Avatar Asset Research

## Objective
Replace the current Roblox-like / procedural avatar direction with premium 3D avatars closer to VTuber, ZEPETO, Avakin Life, and modern social avatar apps.

## Current Avatar System Audit

### What the project uses today
- The current avatar stack is still procedural in runtime, with a compatibility contract for future humanoid bases.
- Local code already supports these target avatar modes:
  - `procedural-premium`
  - `premium-humanoid`
  - `humanoid-v3`
  - `humanoid-v4`
- Supported data/transport paths already include:
  - `GLB`
  - `GLTF`
  - `VRM`
  - `FBX` as a conversion/import format
- Existing avatar data is used across:
  - profile
  - world
  - live overlay
  - shop/inventory

### Why the current avatars are not at the target level
- The current fallback is still procedural and stylized.
- The geometry is good enough for continuity, but not for a premium social-avatar look.
- The pipeline already expects a humanoid base, but the body/face/hair fidelity is not yet at the level of ZEPETO / Avakin-style avatars.
- The current stack must preserve:
  - equipped items
  - purchased items
  - avatar URLs
  - inventory mappings

### Technical constraints that matter
- Mobile/APK must stay lightweight.
- The avatar body must remain humanoid and rigged.
- Expressions are important:
  - eye shapes
  - mouth shapes
  - facial blendshapes / morph targets
- Hair, accessories, and clothing should ideally be separable.
- The best runtime formats for Vaelyndra remain:
  - `GLB` / `GLTF` for web runtime
  - `VRM` if the rig and expression set fit the pipeline cleanly
- `FBX` is useful as an interchange / animation import format, not as the final runtime target.

## Free Options Found

### 1) VRoid Studio
- Link: https://vroid.com/en/studio
- Type: free character creation software
- License / usage:
  - The site states models created in VRoid Studio can be used freely.
  - You can define your own terms for the data you create.
  - Export is supported as `VRM`.
- Formats:
  - `VRM`
- Quality:
  - Strong fit for stylized VTuber / social-avatar visuals.
  - Better than Roblox-like blocks.
- Hair / face / clothing:
  - Strong for hair, face shaping, outfits, accessories.
- Male / female:
  - Yes.
- Mobile / web compatibility:
  - Good as a source format for web and mobile pipelines once exported and optimized.
- Advantages:
  - Free
  - Premium-styled anime/social-avatar look
  - Built-in expression-friendly workflow
  - Good for human silhouettes
- Limits:
  - More anime / stylized than realistic
  - Requires careful export/optimization for APK/mobile

### 2) VRoid Hub
- Link: https://hub.vroid.com/en
- Type: character platform / avatar hosting ecosystem
- License / usage:
  - Official platform for uploaded characters.
  - Intended to connect characters with apps/platforms through the VRoid ecosystem.
- Formats:
  - VRoid / `VRM` ecosystem
- Quality:
  - Strong for social avatars, especially if the base character is created in VRoid Studio.
- Hair / face / clothing:
  - Depends on the uploaded model.
- Male / female:
  - Yes, depending on the uploaded character.
- Mobile / web compatibility:
  - Good as a discovery and distribution layer.
- Advantages:
  - Native ecosystem for avatar sharing
  - Useful for finding creator-made models
- Limits:
  - It is not a marketplace with consistent item-level legal clarity on every avatar
  - Every model still needs license review

### 3) MakeHuman
- Link: https://static.makehumancommunity.org/
- License:
  - Project code is AGPL.
  - Exported models from official versions are released under a CC0 exception according to the project summary.
- Formats:
  - Common export paths used in the ecosystem include `OBJ`, `FBX`, `DAE`, and Blender-oriented pipelines.
- Quality:
  - Strong humanoid base generator.
  - Better for body correctness than cube-style avatars.
- Hair / face / clothing:
  - Good for base human shape.
  - Clothing/hair quality depends on downstream pipeline.
- Male / female:
  - Yes.
- Mobile / web compatibility:
  - Good as a DCC authoring step; not a direct runtime avatar.
- Advantages:
  - Free
  - Human-proportion base
  - Useful for realistic or semi-realistic humanoid rigs
- Limits:
  - Not a turnkey premium social avatar
  - Needs additional rigging, hair, clothes, and export optimization

### 4) Kenney
- Link: https://www.kenney.nl/
- License / usage:
  - Official site advertises thousands of completely free game assets.
  - Kenney's terms are public on the site.
- Formats:
  - Commonly `PNG`, `SVG`, `GLB` depending on asset type
- Quality:
  - Excellent for fallback props, UI, and lightweight geometry.
  - Not the best source for premium humanoid avatars.
- Hair / face / clothing:
  - More useful for support assets than full avatars.
- Male / female:
  - Not the primary goal of the library.
- Mobile / web compatibility:
  - Very strong for lightweight fallback content.
- Advantages:
  - Free
  - Safe source for fallback geometry and UI assets
  - Strong optimization profile
- Limits:
  - Not a premium VTuber avatar source

### 5) OpenGameArt
- Link: http://opengameart.org/
- License posture:
  - Accepts free/open content only.
  - Common accepted licenses include CC BY, CC BY-SA, GPL/LGPL, and CC0.
- Formats:
  - Varies by asset
- Quality:
  - Mixed. Some strong open assets exist, but quality varies a lot.
- Hair / face / clothing:
  - Depends on the asset.
- Male / female:
  - Depends on the asset.
- Mobile / web compatibility:
  - Depends on the asset size and topology.
- Advantages:
  - Open-license ecosystem
  - Useful for modular accessories, fallback pieces, and experimental parts
- Limits:
  - Quality and consistency are uneven
  - Needs strict per-asset review

### 6) Sketchfab downloadable CC models
- Link: https://sketchfab.com/
- License posture:
  - Downloadable assets exist.
  - Every model must be checked individually before use.
- Formats:
  - Common download formats vary by asset.
  - The platform supports web viewing and downloadable 3D assets.
- Quality:
  - Can be excellent.
- Hair / face / clothing:
  - Depends on the asset.
- Male / female:
  - Depends on the asset.
- Mobile / web compatibility:
  - Good if the model is optimized and the license is compatible.
- Advantages:
  - Huge ecosystem
  - Can find rigged human characters and accessories
- Limits:
  - License must be checked per model
  - Not all assets are downloadable
  - Fab migration means the marketplace surface is changing

### 7) Quaternius
- Link: https://quaternius.com/
- License:
  - Project audit note in the repo states Quaternius assets are CC0.
- Formats:
  - Typically `GLB` / `GLTF` / `FBX` depending on the pack.
- Quality:
  - Better for stylized humanoid bases than Roblox-like shapes.
- Hair / face / clothing:
  - Useful for modular humanoid parts and fallback-friendly stylized characters.
- Male / female:
  - Often available depending on the pack.
- Mobile / web compatibility:
  - Good when kept low poly and optimized.
- Advantages:
  - Very strong legal posture if the specific pack is CC0
  - Good for safe production use
- Limits:
  - Still stylized, not fully premium VTuber realism

## Paid / Marketplace Options

### 1) CGTrader character marketplace
- Link: https://www.cgtrader.com/3d-models/character
- Price:
  - Varies by seller; marketplace has free and premium assets.
- License:
  - Varies by listing; must be checked per product.
- Formats:
  - Marketplace category says models are available in formats including `FBX`, `OBJ`, `MAX`, `3DS`, `C4D`.
- Quality:
  - Very broad.
  - Can include game-ready rigs, stylized humans, and clothing.
- Content:
  - Strong for:
    - man / woman / human / clothing / fantasy character / rigged character
  - Good for building a boutique with separate avatar items.
- Commercial use:
  - Depends on the listing license.
- Advantages:
  - Large catalog
  - Good filter surface for rigged / animated / low-poly / premium
  - Strong for modular human parts, clothing, and accessories
- Limits:
  - Per-item license review required
  - Quality varies per seller

### 2) CGTrader rigged character collections
- Link: https://www.cgtrader.com/3d-models/character
- Example collection surface:
  - `Rigged Character`
  - `Animated Character`
  - `Fashion`
  - `Clothing`
- Price:
  - Varies by asset.
- License:
  - Per listing.
- Formats:
  - Usually marketplace-listed formats, often including `FBX` / `OBJ`.
- Quality:
  - Best CGTrader route if the goal is a game-ready social avatar with clothes and body parts.
- Advantages:
  - Easier to search by `rigged`, `animated`, `man`, `woman`, `clothing`
- Limits:
  - Requires careful curation

### 3) Fab / Sketchfab marketplace transition
- Link: https://www.fab.com/
- Price:
  - Varies by listing.
- License:
  - Per listing.
- Formats:
  - Per asset.
- Quality:
  - Potentially high, especially for premium stylized humans and accessories.
- Advantages:
  - Sketchfab now points buy/sell flows toward Fab
  - Good place to source premium characters and props
- Limits:
  - Item-level license review is mandatory
  - Marketplace surface is still evolving

### 4) Booth.pm
- Link: https://booth.pm/
- Price:
  - Mixed free and paid listings.
- License:
  - Per listing; must be checked carefully.
- Formats:
  - Often `VRM`, `VRoid`, Blender-compatible content, or creator-specific formats.
- Quality:
  - One of the strongest sources for VTuber-style avatars and clothing packs.
- Advantages:
  - Very strong for VTuber/social-avatar aesthetics
  - Often includes hair, outfits, accessories, and full character packs
- Limits:
  - Licensing is seller-specific
  - Some listings may be Japanese-only
  - Some packs require conversion / rig validation

### 5) Gumroad creator packs
- Link: https://gumroad.com/
- Price:
  - Mixed free and paid listings.
- License:
  - Per creator / per listing.
- Formats:
  - Often `VRM`, `FBX`, `BLEND`, `GLB`, or custom pack structures.
- Quality:
  - Can be excellent for indie VTuber packs and fashion/accessory bundles.
- Advantages:
  - Good for creator-owned avatar packs
  - Often includes clothing, hair, accessories, and expressions
- Limits:
  - License quality varies
  - Requires strict seller review

### 6) Itch.io asset packs
- Link: https://itch.io/game-assets
- Price:
  - Free and paid.
- License:
  - Per listing; must be checked.
- Formats:
  - Varies.
- Quality:
  - Mixed, but useful for indie-ready packs and prototypes.
- Advantages:
  - Good discovery surface for inexpensive packs
  - Can find modular clothing/accessories
- Limits:
  - Not always premium enough by default
  - License and rig quality vary

## Compatibility Notes

### Best formats for Vaelyndra
1. `GLB` / `GLTF` for runtime web/mobile usage.
2. `VRM` for avatar-authored humanoids with expressions.
3. `FBX` as an intermediate import / animation format.

### What the avatar must support
- Humanoid rig
- Facial expressions / morph targets
- Hair
- Eyes
- Body proportions
- Outfit layers
- Accessories
- Mobile-friendly polygon budgets

### What should be avoided
- Cubic / Roblox-like proportions
- Unlicensed game rips
- Assets with unclear redistribution rights
- Overly heavy high-poly meshes for APK/mobile

## Top Recommendations

### 1. Best free option
**VRoid Studio + VRoid Hub**
- Why:
  - Closest to the VTuber / social-avatar direction
  - Free
  - Exportable to VRM
  - Good hair, face, outfit, and expression tooling
- Best use:
  - Premium-styled social avatar base

### 2. Best free realistic-base option
**MakeHuman**
- Why:
  - Better human proportions than blocky avatars
  - CC0-export posture for models
  - Strong body-shape flexibility
- Best use:
  - Realistic humanoid base that can be stylized later

### 3. Best paid marketplace option
**CGTrader character marketplace**
- Why:
  - Huge variety
  - Rigged / animated / clothing / human categories
  - Good for finding body parts, outfits, and accessory packs
- Best use:
  - Source premium character base, clothing, and accessory pieces

### 4. Best pack-complete premium source
**Booth.pm**
- Why:
  - Strong VTuber-style ecosystem
  - Many full avatar packs and accessories
  - Often closer to the target aesthetic than generic marketplaces
- Best use:
  - Premium stylized base avatar + wardrobe packs

### 5. Best mobile/APK-safe route
**VRoid Studio / VRM pipeline**
- Why:
  - Easier to keep visually premium while controlling complexity
  - Good balance between style and optimization
- Best use:
  - Main avatar base for mobile and web

### 6. Best boutique/avatar-shop route
**CGTrader + Booth.pm hybrid**
- Why:
  - CGTrader gives broad market coverage
  - Booth gives VTuber-native premium styling
- Best use:
  - Build a real boutique with separate hair / outfit / accessory items

## Final Recommendation

For Vaelyndra, the safest and highest-value strategy is:

1. **Keep the current procedural avatar as fallback only.**
2. **Move to a `VRM`-first or `GLB`-first premium humanoid base.**
3. **Prototype with VRoid Studio for the premium VTuber/social style.**
4. **Use MakeHuman only if a more realistic humanoid body is needed.**
5. **Source paid premium wardrobe/accessories from Booth.pm or CGTrader.**
6. **Treat Sketchfab/Fab as a per-item curated source, not a bulk import source.**
7. **Use Kenney/OpenGameArt only for fallback / lightweight support assets.**

The practical target for Vaelyndra should be:
- stylized premium humanoid base
- clean face and hair
- strong facial expression support
- modular outfits/accessories
- mobile-safe polygon budgets
- legal commercial usage

## Risks

- The biggest risk is license ambiguity.
- The second risk is mobile performance if the avatar is too heavy.
- The third risk is asset fragmentation if the body, clothes, and accessories are sourced from too many incompatible pipelines.

## Source Notes

Validated directly from project code/docs:
- `docs/avatar-assets.md`
- `src/lib/avatarAssets.ts`
- `src/lib/avatar3d.ts`

Verified on the web:
- https://vroid.com/en/studio
- https://hub.vroid.com/en
- https://readyplayer.me/
- https://www.kenney.nl/
- https://www.kenney.nl/terms-of-service
- https://sketchfab.com/
- https://www.cgtrader.com/
- https://www.cgtrader.com/3d-models/character
- https://static.makehumancommunity.org/
- https://opengameart.org/
- https://www.fab.com/
- https://booth.pm/
- https://gumroad.com/
- https://itch.io/game-assets
