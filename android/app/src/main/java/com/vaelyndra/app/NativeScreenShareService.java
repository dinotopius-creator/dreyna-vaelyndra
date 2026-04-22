package com.vaelyndra.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class NativeScreenShareService extends Service {
    public static final String ACTION_START = "com.vaelyndra.app.NativeScreenShare.START";
    public static final String EXTRA_API_BASE = "apiBase";
    public static final String EXTRA_BROADCAST_TOKEN = "broadcastToken";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";

    private static final String CHANNEL_ID = "vaelyndra_screen_share";
    private static final int NOTIFICATION_ID = 4217;

    private NativeWebRtcScreenStreamer screenStreamer;
    private NativeLiveChatOverlay chatOverlay;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            return START_REDELIVER_INTENT;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        if (resultData == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(
            Context.MEDIA_PROJECTION_SERVICE
        );
        if (manager == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String apiBase = intent.getStringExtra(EXTRA_API_BASE);
        if (apiBase == null || apiBase.trim().isEmpty()) {
            apiBase = "https://api.vaelyndra.com";
        }
        String broadcastToken = intent.getStringExtra(EXTRA_BROADCAST_TOKEN);
        if (broadcastToken == null) broadcastToken = "";
        acquireWakeLock();
        stopCurrentSession();
        screenStreamer = new NativeWebRtcScreenStreamer(
            this,
            resultData,
            apiBase,
            broadcastToken
        );
        screenStreamer.start();
        chatOverlay = new NativeLiveChatOverlay(this, apiBase, broadcastToken);
        chatOverlay.start();
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onDestroy() {
        stopCurrentSession();
        releaseWakeLock();
        super.onDestroy();
    }

    private void stopCurrentSession() {
        if (screenStreamer != null) {
            screenStreamer.stop();
            screenStreamer = null;
        }
        if (chatOverlay != null) {
            chatOverlay.stop();
            chatOverlay = null;
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return;
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Vaelyndra::NativeScreenShare"
        );
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(
            Context.NOTIFICATION_SERVICE
        );
        if (android.os.Build.VERSION.SDK_INT >= 26 && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Partage d'écran Vaelyndra",
                NotificationManager.IMPORTANCE_LOW
            );
            manager.createNotificationChannel(channel);
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Vaelyndra Live")
            .setContentText("Partage d'écran Android actif")
            .setOngoing(true)
            .build();
    }
}
