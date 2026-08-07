# Avatar VRM import notes

## Source files

The following VRM assets are now present in the workspace under `unity/PulseForgeWorld/Assets/ThirdParty/AvatarBases`:

- `Vaelyndra Premium Female.vrm`
- `Vaelyndra Premium Female 2.vrm`

These files were copied from the local asset stash provided for the project.

## Intended use

These models are the preferred base for the new stylized avatar line on Vaelyndra.

## Current Unity status

The Unity world project currently does not include UniVRM, so the `.vrm` files are stored as source assets and cannot yet be instantiated directly at runtime.

## Required next step in Unity Editor

1. Import UniVRM matching the Unity version used by the world project.
2. Import the chosen `.vrm` file into the project.
3. Create or generate a prefab from the imported avatar.
4. Assign that prefab to the world avatar spawn pipeline.
5. Remove or keep only a true error fallback when the prefab is missing.

## Recommended base

Use `Vaelyndra Premium Female.vrm` as the default premium base.

## Notes

- Do not publish the source VRM files outside the repository unless the asset license explicitly allows redistribution.
- Keep the avatar pipeline separate from the world scene until the prefab import is validated.
