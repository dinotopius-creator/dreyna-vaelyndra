using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class WorldPlayerController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 4.5f;
        [SerializeField] private float gravity = -18f;
        [SerializeField] private Transform cameraRig;

        private CharacterController controller;
        private Vector3 velocity;

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
        }

        private void Update()
        {
            var horizontal = Input.GetAxisRaw("Horizontal");
            var vertical = Input.GetAxisRaw("Vertical");
            var move = new Vector3(horizontal, 0f, vertical).normalized;

            if (move.sqrMagnitude > 0.001f)
            {
                var forward = cameraRig ? Vector3.Scale(cameraRig.forward, new Vector3(1f, 0f, 1f)).normalized : Vector3.forward;
                var right = cameraRig ? cameraRig.right : Vector3.right;
                var direction = forward * move.z + right * move.x;
                controller.Move(direction * moveSpeed * Time.deltaTime);
            }

            if (controller.isGrounded && velocity.y < 0f)
            {
                velocity.y = -2f;
            }

            velocity.y += gravity * Time.deltaTime;
            controller.Move(velocity * Time.deltaTime);
        }

        public void AttachCameraRig(Transform rig)
        {
            cameraRig = rig;
        }
    }
}
