mergeInto(LibraryManager.library, {
  PulseForgeWorld_Init: function (gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    if (!window.__pulseForgeWorldBridge) {
      window.__pulseForgeWorldBridge = {
        gameObjectName: gameObjectName,
        handler: null,
      };
      window.__pulseForgeWorldBridge.handler = function (event) {
        var target = window.__pulseForgeWorldBridge && window.__pulseForgeWorldBridge.gameObjectName;
        if (!target) return;
        var data = event && event.data;
        if (!data) return;
        var payload = typeof data === 'string' ? data : JSON.stringify(data);
        if (typeof SendMessage === 'function') {
          SendMessage(target, 'ReceiveBridgeMessage', payload);
        }
      };
      window.addEventListener('message', window.__pulseForgeWorldBridge.handler);
    } else {
      window.__pulseForgeWorldBridge.gameObjectName = gameObjectName;
    }

    try {
      window.parent.postMessage(JSON.stringify({ type: 'pulseforge-world-ready' }), '*');
    } catch (err) {
      console.warn('PulseForgeWorld ready bridge failed', err);
    }
  },
  PulseForgeWorld_PostMuted: function (muted) {
    try {
      window.parent.postMessage(JSON.stringify({ type: 'pulseforge-world-muted', muted: !!muted }), '*');
    } catch (err) {
      console.warn('PulseForgeWorld muted bridge failed', err);
    }
  }
});
