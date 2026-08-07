using UnityEngine;

namespace PulseForgeWorld.Runtime
{
    public sealed class WorldUnityBridgeBootstrap : MonoBehaviour
    {
        [SerializeField] private WorldUnityBridgeManager bridgeManager;

        private void Awake()
        {
            if (!bridgeManager) bridgeManager = GetComponent<WorldUnityBridgeManager>();
        }
    }
}
