# Avatar assets audit

This branch does not import copyrighted avatar assets from third-party games or closed platforms.
The goal is to keep Vaelyndra legally safe while moving toward a more premium humanoid look.

The current implementation is still procedural, but it now carries an explicit compatibility contract for a future humanoid GLB/VRM base model. That lets us switch the avatar body without deleting purchased items or rewriting the profile/world avatar flow.

## Verified legal sources

### Quaternius
- Site: https://quaternius.com/
- License: CC0 according to the official FAQ.
- Commercial use: allowed.
- Attribution: not required.
- Modification: allowed.
- Best fit in this project: stylized humanoid bases, modular character parts, and humanoid animation packs.

Reference:
- Quaternius FAQ, which states that the assets can be used in commercial, educational, and personal projects and that all models are under the CC0 License.

### Poly Pizza
- Site: https://poly.pizza/
- Terms: https://poly.pizza/docs/tos
- License posture: downloadable content is governed by the license attached to each model; the platform itself is a free 3D model marketplace and download hub.
- Best fit in this project: lightweight fallback props and low-poly placeholders only after per-item license review.

Reference:
- Poly Pizza home page and Terms of Service.

### Sketchfab / Fab ecosystem
- Site: https://sketchfab.com/
- Current platform note: Sketchfab is now tied to Epic/Fab.
- License posture: downloadable models exist, but each asset must be checked individually before use.
- Best fit in this project: candidate source for downloadable humanoid assets only after item-level license verification.

Reference:
- Sketchfab home page and the public marketplace/downloadable model flow.

### Adobe Mixamo
- Site: https://www.mixamo.com/
- Product terms: https://www.adobe.com/go/fuseterms
- License posture: Adobe grants a license to use the animation data to create an end use; redistribution of the animation data separately is prohibited.
- Best fit in this project: humanoid animation stack for idle, walk, run, jump, and gesture motion.

Reference:
- Adobe Fuse Product Specific Terms of Use.

## Decision for Vaelyndra

- Keep the existing avatar ownership/inventory system intact.
- Use the current procedural humanoid renderer as the primary implementation until a fully licensed premium GLB/VRM pack is approved.
- Treat third-party assets as per-item legal reviews, not as bulk imports.
- Avoid importing any protected game character, skin, or copyrighted avatar.
- Prefer future premium humanoid assets with explicit commercial rights and clear attachment slots for head, face, hair, torso, hands, legs, feet, outfit, accessory, and aura.

## Asset policy

- No scraped assets.
- No Fortnite, Roblox, ZEPETO, anime, or other protected characters.
- No asset with unclear commercial rights.
- No asset without a clear attribution/modification/redistribution answer.
- No migration that silently replaces purchased cosmetics with incompatible placeholders.

## Current compatibility contract

- `procedural-premium` is the current safe runtime fallback.
- `premium-humanoid` is the target slot for the future real 3D base model.
- Existing avatar URLs remain readable during migration.
- Purchased cosmetics must map into compatibility slots instead of being deleted.

## Purchased VRoid source pack installed locally

The following legally purchased assets were imported into the repository as source material for the premium avatar direction:

- `7a04m_SuccuHair_01-WineRuby.vroid`
- `7a_Koakuma-Set_Full_2023-11-14.zip` contents, including `vroidcustomitem` wardrobe pieces and BOOTH preview images

Repository staging:

- `public/avatar-premium/koakuma-01.png`
- `public/avatar-premium/koakuma-02.png`
- `public/avatar-premium/koakuma-03.png`
- `public/avatar-premium/koakuma-04.png`
- `public/avatar-premium/koakuma-05.png`
- `public/avatar-premium/succuhair-01-wineruby.vroid`

Usage notes:

- The browser runtime does not render `.vroid` or `vroidcustomitem` directly.
- These files are kept as the legal source pack for a premium VRoid-style pipeline.
- The studio now exposes the pack as an installed premium reference set, with previews and metadata.
- Next production step remains exporting or converting to a web-compatible `VRM` / `GLB` target before runtime rendering.
