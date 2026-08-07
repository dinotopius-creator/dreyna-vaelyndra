using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public sealed class WorldSceneBootstrapper : MonoBehaviour
    {
        [SerializeField] private GameObject playerPrefab;
        [SerializeField] private Transform cameraRig;

        private void Start()
        {
            if (playerPrefab)
            {
                var player = Instantiate(playerPrefab, Vector3.zero, Quaternion.identity);
                var controller = player.GetComponent<WorldPlayerController>();
                if (controller && cameraRig)
                {
                    controller.AttachCameraRig(cameraRig);
                }
            }
        }
    }
}
