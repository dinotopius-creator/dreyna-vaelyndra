using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public sealed class WorldAvatarBridge : MonoBehaviour
    {
        [SerializeField] private string avatarId = "default-avatar";
        [SerializeField] private string userId = "local-user";

        public void SetAvatar(string nextAvatarId, string nextUserId)
        {
            avatarId = nextAvatarId;
            userId = nextUserId;
            Debug.Log($"[PulseForgeWorld] Avatar switched to {avatarId} for {userId}.");
        }
    }
}
