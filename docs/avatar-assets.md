# Avatar assets audit

This branch does not import copyrighted avatar assets from third-party games or closed platforms.
The goal is to keep Vaelyndra legally safe while moving toward a more premium humanoid look.

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

## Asset policy

- No scraped assets.
- No Fortnite, Roblox, ZEPETO, anime, or other protected characters.
- No asset with unclear commercial rights.
- No asset without a clear attribution/modification/redistribution answer.

