# UniVRM unitypackage import

The Unity project is configured to avoid the Git-based UPM clone that was failing on Windows with `EPERM` during `Library/PackageCache` renaming.

## Recommended import flow

1. Download the official UniVRM `.unitypackage` files from the VRM / UniVRM release pages.
2. Import them from Unity Editor:
   - `Assets > Import Package > Custom Package...`
3. Import in this order:
   - `UniGLTF_VRMShaders`
   - `UniVRM`
   - `VRM` only if you need VRM 1.0 specific support in your chosen release line
4. Confirm the `VRM` menu appears in the Unity top bar.
5. Import `Assets/ThirdParty/AvatarBases/Vaelyndra Premium Female.vrm`.
6. Generate the prefab from the VRM import tools.
7. Assign the prefab to the world avatar spawn pipeline.

## Why this route

This avoids the Git clone / package-cache rename failure that was blocking the project on Windows.
