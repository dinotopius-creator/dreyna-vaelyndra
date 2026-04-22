package com.vaelyndra.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

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
    private static final String TAG = "VaelyndraNativeLive";

    private NativeWebRtcScreenStreamer screenStreamer;
    private NativeLiveChatOverlay chatOverlay;
    private PowerManager.WakeLock wakeLock;
    private Thread startupThread;
    private final Object sessionLock = new Object();

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            startAsForegroundService();
        } catch (Exception e) {
            Log.e(TAG, "Unable to promote native live service to foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            Log.w(TAG, "Native screen share service started without ACTION_START");
            return START_REDELIVER_INTENT;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        if (resultData == null) {
            Log.e(TAG, "Missing MediaProjection result data, stopping native live service");
            stopSelf();
            return START_NOT_STICKY;
        }

        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(
            Context.MEDIA_PROJECTION_SERVICE
        );
        if (manager == null) {
            Log.e(TAG, "MediaProjectionManager unavailable, stopping native live service");
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
        startNativeSession(resultData, apiBase, broadcastToken);
        Log.i(TAG, "Native screen share foreground service running");
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onDestroy() {
        try {
            stopCurrentSession();
            releaseWakeLock();
        } catch (Throwable t) {
            Log.e(TAG, "Native live service cleanup failed", t);
        }
        super.onDestroy();
    }

    private void stopCurrentSession() {
        synchronized (sessionLock) {
            if (startupThread != null) {
                startupThread.interrupt();
                startupThread = null;
            }
            if (screenStreamer != null) {
                try {
                    screenStreamer.stop();
                } catch (Throwable t) {
                    Log.e(TAG, "Unable to stop native WebRTC streamer", t);
                }
                screenStreamer = null;
            }
            if (chatOverlay != null) {
                try {
                    chatOverlay.stop();
                } catch (Throwable t) {
                    Log.e(TAG, "Unable to stop native chat overlay", t);
                }
                chatOverlay = null;
            }
        }
    }

    private void startNativeSession(Intent resultData, String apiBase, String broadcastToken) {
        startupThread = new Thread(
            () -> {
                try {
                    NativeWebRtcScreenStreamer streamer = new NativeWebRtcScreenStreamer(
                        this,
                        resultData,
                        apiBase,
                        broadcastToken
                    );
                    streamer.start();
                    if (Thread.currentThread().isInterrupted()) {
                        streamer.stop();
                        return;
                    }
                    synchronized (sessionLock) {
                        screenStreamer = streamer;
                    }
                    try {
                        NativeLiveChatOverlay overlay = new NativeLiveChatOverlay(
                            this,
                            apiBase,
                            broadcastToken
                        );
                        overlay.start();
                        synchronized (sessionLock) {
                            chatOverlay = overlay;
                        }
                    } catch (Throwable t) {
                        Log.w(TAG, "Native live chat overlay disabled", t);
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Native screen share startup failed without crashing app", t);
                    stopSelf();
                } finally {
                    synchronized (sessionLock) {
                        if (Thread.currentThread() == startupThread) {
                            startupThread = null;
                        }
                    }
                }
            },
            "VaelyndraNativeLiveStart"
        );
        startupThread.setUncaughtExceptionHandler((thread, throwable) -> {
            Log.e(TAG, "Uncaught native live startup error", throwable);
            stopSelf();
        });
        startupThread.start();
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

    private void startAsForegroundService() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
            return;
        }
        startForeground(NOTIFICATION_ID, notification);
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
                "Partage d'ecran Vaelyndra",
                NotificationManager.IMPORTANCE_LOW
            );
            manager.createNotificationChannel(channel);
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Vaelyndra Live")
            .setContentText("Partage d'ecran Android actif")
            .setOngoing(true)
            .build();
    }
}
