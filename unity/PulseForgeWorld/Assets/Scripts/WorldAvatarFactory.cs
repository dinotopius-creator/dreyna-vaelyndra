using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public static class WorldAvatarFactory
    {
        private static readonly Color SkinColor = new Color(0.94f, 0.78f, 0.68f, 1f);
        private static readonly Color HairColor = new Color(0.18f, 0.10f, 0.18f, 1f);
        private static readonly Color OutfitColor = new Color(0.49f, 0.30f, 0.96f, 1f);
        private static readonly Color TrimColor = new Color(0.95f, 0.84f, 0.98f, 1f);
        private static readonly Color EyeColor = new Color(0.16f, 0.10f, 0.30f, 1f);

        public static GameObject CreateAvatar(string avatarId, Transform parent)
        {
            var root = new GameObject($"Avatar-{avatarId}");
            if (parent)
            {
                root.transform.SetParent(parent, false);
            }

            var body = CreatePart("Body", PrimitiveType.Capsule, root.transform, new Vector3(0f, 1.05f, 0f), new Vector3(0.78f, 1.08f, 0.55f), OutfitColor);
            CreatePart("Chest", PrimitiveType.Cube, root.transform, new Vector3(0f, 1.42f, 0.02f), new Vector3(0.90f, 0.52f, 0.56f), OutfitColor);
            CreatePart("Belt", PrimitiveType.Cube, root.transform, new Vector3(0f, 0.79f, 0.03f), new Vector3(0.80f, 0.11f, 0.58f), TrimColor);

            var head = CreatePart("Head", PrimitiveType.Sphere, root.transform, new Vector3(0f, 1.92f, 0f), new Vector3(0.88f, 0.88f, 0.88f), SkinColor);
            CreateHair(root.transform);
            CreateFace(root.transform);
            CreateArms(root.transform);
            CreateLegs(root.transform);

            var glow = root.AddComponent<Light>();
            glow.type = LightType.Point;
            glow.range = 6f;
            glow.intensity = 1.8f;
            glow.color = new Color(1f, 0.76f, 0.95f, 1f);
            glow.shadows = LightShadows.None;
            glow.transform.localPosition = new Vector3(0f, 1.7f, 0.1f);

            root.transform.localPosition = new Vector3(0f, 0.96f, 0f);
            root.transform.localScale = new Vector3(0.92f, 0.92f, 0.92f);

            var animator = root.AddComponent<WorldAvatarIdleBob>();
            animator.Body = body.transform;
            animator.Head = head.transform;
            return root;
        }

        private static GameObject CreatePart(string name, PrimitiveType primitiveType, Transform parent, Vector3 localPosition, Vector3 localScale, Color color)
        {
            var part = GameObject.CreatePrimitive(primitiveType);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localRotation = Quaternion.identity;
            part.transform.localScale = localScale;
            var collider = part.GetComponent<Collider>();
            if (collider)
            {
                Object.Destroy(collider);
            }

            var renderer = part.GetComponent<Renderer>();
            if (renderer)
            {
                renderer.material = CreateMaterial(color);
            }

            return part;
        }

        private static void CreateHair(Transform parent)
        {
            var hair = CreatePart("Hair", PrimitiveType.Sphere, parent, new Vector3(0f, 2.12f, -0.03f), new Vector3(1.02f, 0.70f, 0.92f), HairColor);

            var fringe = CreatePart("Fringe", PrimitiveType.Cube, hair.transform, new Vector3(0f, -0.18f, 0.41f), new Vector3(0.74f, 0.26f, 0.16f), HairColor);
            fringe.transform.localRotation = Quaternion.Euler(18f, 0f, 0f);

            var bunLeft = CreatePart("BunLeft", PrimitiveType.Sphere, hair.transform, new Vector3(-0.34f, 0.08f, -0.28f), new Vector3(0.22f, 0.22f, 0.22f), HairColor);
            var bunRight = CreatePart("BunRight", PrimitiveType.Sphere, hair.transform, new Vector3(0.34f, 0.08f, -0.28f), new Vector3(0.22f, 0.22f, 0.22f), HairColor);

            CreateRibbon(hair.transform, bunLeft.transform.localPosition + new Vector3(-0.04f, -0.04f, 0f));
            CreateRibbon(hair.transform, bunRight.transform.localPosition + new Vector3(0.04f, -0.04f, 0f));
        }

        private static void CreateRibbon(Transform parent, Vector3 localPosition)
        {
            var ribbon = CreatePart("Ribbon", PrimitiveType.Cube, parent, localPosition, new Vector3(0.08f, 0.26f, 0.02f), TrimColor);
            ribbon.transform.localRotation = Quaternion.Euler(0f, 0f, -18f);
        }

        private static void CreateFace(Transform parent)
        {
            CreatePart("EyeLeft", PrimitiveType.Sphere, parent, new Vector3(-0.17f, 1.96f, 0.37f), new Vector3(0.08f, 0.08f, 0.08f), EyeColor);
            CreatePart("EyeRight", PrimitiveType.Sphere, parent, new Vector3(0.17f, 1.96f, 0.37f), new Vector3(0.08f, 0.08f, 0.08f), EyeColor);
            CreatePart("Mouth", PrimitiveType.Cube, parent, new Vector3(0f, 1.80f, 0.38f), new Vector3(0.14f, 0.03f, 0.03f), new Color(0.42f, 0.15f, 0.22f, 1f));
            CreatePart("Nose", PrimitiveType.Cube, parent, new Vector3(0f, 1.88f, 0.38f), new Vector3(0.05f, 0.04f, 0.03f), new Color(0.86f, 0.68f, 0.58f, 1f));
        }

        private static void CreateArms(Transform parent)
        {
            var leftArm = CreatePart("ArmLeft", PrimitiveType.Capsule, parent, new Vector3(-0.68f, 1.37f, 0f), new Vector3(0.18f, 0.58f, 0.18f), SkinColor);
            leftArm.transform.localRotation = Quaternion.Euler(0f, 0f, 8f);
            var rightArm = CreatePart("ArmRight", PrimitiveType.Capsule, parent, new Vector3(0.68f, 1.37f, 0f), new Vector3(0.18f, 0.58f, 0.18f), SkinColor);
            rightArm.transform.localRotation = Quaternion.Euler(0f, 0f, -8f);
            CreatePart("HandLeft", PrimitiveType.Sphere, parent, new Vector3(-0.75f, 0.86f, 0.02f), new Vector3(0.12f, 0.12f, 0.12f), SkinColor);
            CreatePart("HandRight", PrimitiveType.Sphere, parent, new Vector3(0.75f, 0.86f, 0.02f), new Vector3(0.12f, 0.12f, 0.12f), SkinColor);
        }

        private static void CreateLegs(Transform parent)
        {
            var leftLeg = CreatePart("LegLeft", PrimitiveType.Capsule, parent, new Vector3(-0.22f, 0.35f, 0f), new Vector3(0.20f, 0.70f, 0.20f), OutfitColor);
            var rightLeg = CreatePart("LegRight", PrimitiveType.Capsule, parent, new Vector3(0.22f, 0.35f, 0f), new Vector3(0.20f, 0.70f, 0.20f), OutfitColor);
            leftLeg.transform.localRotation = Quaternion.Euler(0f, 0f, 2f);
            rightLeg.transform.localRotation = Quaternion.Euler(0f, 0f, -2f);
            CreatePart("FootLeft", PrimitiveType.Cube, parent, new Vector3(-0.22f, -0.02f, 0.08f), new Vector3(0.20f, 0.10f, 0.34f), TrimColor);
            CreatePart("FootRight", PrimitiveType.Cube, parent, new Vector3(0.22f, -0.02f, 0.08f), new Vector3(0.20f, 0.10f, 0.34f), TrimColor);
        }

        private static Material CreateMaterial(Color color)
        {
            var material = new Material(Shader.Find("Standard"));
            material.color = color;
            material.SetFloat("_Glossiness", 0.2f);
            return material;
        }
    }
}
