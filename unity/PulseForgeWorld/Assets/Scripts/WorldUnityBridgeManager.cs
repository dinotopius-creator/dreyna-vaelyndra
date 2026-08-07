using System;
using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    [Serializable]
    public sealed class WorldBridgePayload
    {
        public string avatarId;
        public string userId;
        public string language;
        public bool muted;
        public bool ready;
    }

    [Serializable]
    public sealed class WorldBridgeEnvelope
    {
        public string type;
        public WorldBridgePayload payload;
        public bool muted;
        public string avatarId;
        public string userId;
        public string language;
    }

    public sealed class WorldUnityBridgeManager : MonoBehaviour
    {
        [SerializeField] private WorldAvatarBridge avatarBridge;
        [SerializeField] private WorldAvatarSocket avatarSocket;
        [SerializeField] private WorldPlayerController playerController;
        [SerializeField] private Camera worldCamera;
        [SerializeField] private GameObject avatarPrefab;

        private WorldBridgePayload currentPayload = new WorldBridgePayload
        {
            avatarId = "guest",
            userId = "guest",
            language = "fr-FR",
            muted = true,
            ready = false,
        };

        private GameObject spawnedAvatar;

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void PulseForgeWorld_Init(string gameObjectName);

        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void PulseForgeWorld_PostMuted(bool muted);
#else
        private static void PulseForgeWorld_Init(string gameObjectName) { }
        private static void PulseForgeWorld_PostMuted(bool muted) { }
#endif

        private void Awake()
        {
            if (!avatarBridge) avatarBridge = GetComponentInChildren<WorldAvatarBridge>(true);
            if (!avatarSocket) avatarSocket = GetComponentInChildren<WorldAvatarSocket>(true);
            if (!playerController) playerController = GetComponentInChildren<WorldPlayerController>(true);
            if (!worldCamera) worldCamera = Camera.main;
            if (!avatarPrefab)
            {
                avatarPrefab = Resources.Load<GameObject>("AvatarBases/Prefabs/VaelyndraPremiumFemale");
            }
        }

        private void Start()
        {
            PulseForgeWorld_Init(gameObject.name);
            ApplyPayload(currentPayload, true);
            PostReady();
        }

        public void ReceiveBridgeMessage(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            var envelope = JsonUtility.FromJson<WorldBridgeEnvelope>(json);
            if (envelope == null || string.IsNullOrWhiteSpace(envelope.type)) return;

            switch (envelope.type)
            {
                case "pulseforge-world-init":
                    if (envelope.payload != null)
                    {
                        ApplyPayload(envelope.payload, true);
                    }
                    else
                    {
                        ApplyPayload(new WorldBridgePayload
                        {
                            avatarId = envelope.avatarId ?? currentPayload.avatarId,
                            userId = envelope.userId ?? currentPayload.userId,
                            language = envelope.language ?? currentPayload.language,
                            muted = envelope.muted || currentPayload.muted,
                            ready = true,
                        }, true);
                    }
                    PostReady();
                    break;
                case "pulseforge-world-spawn-avatar":
                    ApplyAvatar(envelope.payload?.avatarId ?? envelope.avatarId);
                    break;
                case "pulseforge-world-audio":
                    ApplyMuted(envelope.payload?.muted ?? envelope.muted);
                    break;
                case "pulseforge-world-toggle-voice":
                    ApplyMuted(!currentPayload.muted);
                    break;
                case "pulseforge-world-camera":
                    FocusCamera();
                    break;
                case "pulseforge-world-refresh":
                    ApplyPayload(currentPayload, true);
                    break;
                case "pulseforge-world-exit":
                    Debug.Log("[PulseForgeWorld] Exit requested from site bridge.");
                    Application.Quit();
                    break;
            }
        }

        private void ApplyPayload(WorldBridgePayload payload, bool spawnAvatar)
        {
            currentPayload.avatarId = string.IsNullOrWhiteSpace(payload.avatarId) ? currentPayload.avatarId : payload.avatarId;
            currentPayload.userId = string.IsNullOrWhiteSpace(payload.userId) ? currentPayload.userId : payload.userId;
            currentPayload.language = string.IsNullOrWhiteSpace(payload.language) ? currentPayload.language : payload.language;
            currentPayload.muted = payload.muted;
            currentPayload.ready = true;

            avatarBridge?.SetAvatar(currentPayload.avatarId, currentPayload.userId);
            ApplyMuted(currentPayload.muted);
            if (spawnAvatar)
            {
                ApplyAvatar(currentPayload.avatarId);
            }
        }

        private void ApplyAvatar(string avatarId)
        {
            if (string.IsNullOrWhiteSpace(avatarId)) avatarId = currentPayload.avatarId;

            if (spawnedAvatar)
            {
                Destroy(spawnedAvatar);
                spawnedAvatar = null;
            }

            var root = avatarSocket ? avatarSocket.transform : transform;
            if (avatarPrefab)
            {
                spawnedAvatar = Instantiate(avatarPrefab, root, false);
                spawnedAvatar.name = $"Avatar-{avatarId}";
                spawnedAvatar.transform.localPosition = new Vector3(0f, 0.95f, 0f);
                spawnedAvatar.transform.localRotation = Quaternion.identity;
                Debug.Log($"[PulseForgeWorld] Spawned imported avatar prefab for {avatarId}.");
                return;
            }

            spawnedAvatar = WorldAvatarFactory.CreateAvatar(avatarId, root);
            Debug.Log($"[PulseForgeWorld] Spawned runtime avatar fallback for {avatarId}.");
        }

        private void ApplyMuted(bool muted)
        {
            currentPayload.muted = muted;
            PulseForgeWorld_PostMuted(muted);
            Debug.Log($"[PulseForgeWorld] Audio muted state is now {muted}.");
        }

        private void FocusCamera()
        {
            if (!worldCamera) return;
            var target = avatarSocket ? avatarSocket.transform.position : Vector3.zero;
            worldCamera.transform.position = target + new Vector3(0f, 1.8f, -4f);
            worldCamera.transform.LookAt(target + new Vector3(0f, 1.2f, 0f));
        }

        private void PostReady()
        {
            Debug.Log("[PulseForgeWorld] Bridge ready.");
        }
    }
}
