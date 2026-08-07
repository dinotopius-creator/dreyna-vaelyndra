using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public sealed class WorldAvatarIdleBob : MonoBehaviour
    {
        public Transform Body;
        public Transform Head;

        private Vector3 bodyBaseLocalPosition;
        private Vector3 headBaseLocalPosition;

        private void Awake()
        {
            if (Body)
            {
                bodyBaseLocalPosition = Body.localPosition;
            }

            if (Head)
            {
                headBaseLocalPosition = Head.localPosition;
            }
        }

        private void Update()
        {
            var t = Time.time;
            var bob = Mathf.Sin(t * 1.7f) * 0.02f;
            var sway = Mathf.Sin(t * 1.25f) * 2.5f;

            if (Body)
            {
                Body.localPosition = bodyBaseLocalPosition + new Vector3(0f, bob, 0f);
                Body.localRotation = Quaternion.Euler(0f, sway, 0f);
            }

            if (Head)
            {
                Head.localPosition = headBaseLocalPosition + new Vector3(0f, bob * 0.6f, 0f);
                Head.localRotation = Quaternion.Euler(0f, -sway * 0.65f, 0f);
            }
        }
    }
}
