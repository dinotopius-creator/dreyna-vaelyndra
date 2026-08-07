using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public sealed class WorldAvatarSocket : MonoBehaviour
    {
        [SerializeField] private Transform socketRoot;

        public void AttachAvatar(GameObject avatar)
        {
            if (!avatar)
            {
                return;
            }

            var root = socketRoot ? socketRoot : transform;
            avatar.transform.SetParent(root, false);
            avatar.transform.localPosition = Vector3.zero;
            avatar.transform.localRotation = Quaternion.identity;
        }
    }
}
