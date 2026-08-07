package com.vaelyndra.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjectionManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class NativeScreenShareService extends Service {
    public static final String ACTION_START = "com.vaelyndra.app.NativeScreenShare.START";
    public static final String ACTION_STOP = "com.vaelyndra.app.NativeScreenShare.STOP";
    public static final String EXTRA_API_BASE = "apiBase";
    public static final String EXTRA_BROADCAST_TOKEN = "broadcastToken";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_CATEGORY = "category";

    private static final String CHANNEL_ID = "vaelyndra_screen_share";
    private static final int NOTIFICATION_ID = 4217;
    private static final int RESTART_REQUEST_CODE = 4218;
    private static final String TAG = "VaelyndraNativeLive";
    private static volatile boolean running = false;
    private static volatile String liveTitle = "";
    private static volatile String liveCategory = "";
    private static volatile long startedAtMs = 0;
    private static volatile String lastStopReason = "";
    private static volatile Intent lastStartIntent = null;
    private static volatile boolean explicitStopRequested = false;

    private NativeWebRtcScreenStreamer screenStreamer;
    private NativeLiveChatOverlay chatOverlay;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private Thread startupThread;
    private final Object sessionLock = new Object();

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent effectiveIntent = intent;
        if (effectiveIntent == null && lastStartIntent != null) {
            effectiveIntent = new Intent(lastStartIntent);
            Log.w(TAG, "Native live service restarted without intent; reusing last session state");
        }

        if (effectiveIntent != null && ACTION_STOP.equals(effectiveIntent.getAction())) {
            Log.i(TAG, "Stopping native live service on explicit request");
            explicitStopRequested = true;
            lastStartIntent = null;
            running = false;
            liveTitle = "";
            liveCategory = "";
            startedAtMs = 0;
            lastStopReason = "explicit_stop";
            stopCurrentSession();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            startAsForegroundService();
        } catch (Exception e) {
            Log.e(TAG, "Unable to promote native live service to foreground", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (effectiveIntent == null || !ACTION_START.equals(effectiveIntent.getAction())) {
            Log.w(TAG, "Native screen share service started without ACTION_START");
            return START_REDELIVER_INTENT;
        }

        explicitStopRequested = false;
        lastStartIntent = new Intent(effectiveIntent);

        int resultCode = effectiveIntent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = effectiveIntent.getParcelableExtra(EXTRA_RESULT_DATA);
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

        String apiBase = effectiveIntent.getStringExtra(EXTRA_API_BASE);
        if (apiBase == null || apiBase.trim().isEmpty()) {
            apiBase = "https://api.vaelyndra.com";
        }
        String broadcastToken = effectiveIntent.getStringExtra(EXTRA_BROADCAST_TOKEN);
        if (broadcastToken == null) broadcastToken = "";
        String title = effectiveIntent.getStringExtra(EXTRA_TITLE);
        String category = effectiveIntent.getStringExtra(EXTRA_CATEGORY);
        liveTitle = title == null ? "" : title;
        liveCategory = category == null ? "" : category;
        startedAtMs = System.currentTimeMillis();
        lastStopReason = "";
        running = true;
        acquireWakeLock();
        acquireWifiLock();
        stopCurrentSession();
        startNativeSession(resultData, apiBase, broadcastToken);
        Log.i(TAG, "Native screen share foreground service running");
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onDestroy() {
        boolean shouldRecover = running && !explicitStopRequested && lastStartIntent != null;
        try {
            stopCurrentSession();
            releaseWakeLock();
            releaseWifiLock();
        } catch (Throwable t) {
            Log.e(TAG, "Native live service cleanup failed", t);
        }
        running = false;
        if (explicitStopRequested) {
            liveTitle = "";
            liveCategory = "";
            startedAtMs = 0;
        } else if (shouldRecover) {
            scheduleServiceRestart();
        }
        super.onDestroy();
    }

    public static boolean isRunning() {
        return running;
    }

    public static String getLiveTitle() {
        return liveTitle;
    }

    public static String getLiveCategory() {
        return liveCategory;
    }

    public static long getStartedAtMs() {
        return startedAtMs;
    }

    public static String getLastStopReason() {
        return lastStopReason;
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
                        broadcastToken,
                        this::handleStreamerStopped
                    );
                    streamer.start();
                    if (!streamer.isRunning()) {
                        Log.e(TAG, "Native screen streamer stopped during startup");
                        stopSelf();
                        return;
                    }
                    if (Thread.currentThread().isInterrupted()) {
                        streamer.stop();
                        return;
                    }
                    synchronized (sessionLock) {
                        screenStreamer = streamer;
                    }
                    Log.i(TAG, "Native chat overlay deferred; screen live stability first");
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

    private void acquireWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) return;
        WifiManager wifiManager = (WifiManager) getApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) return;
        wifiLock = wifiManager.createWifiLock(
            WifiManager.WIFI_MODE_FULL_HIGH_PERF,
            "Vaelyndra::NativeScreenShareWifi"
        );
        wifiLock.setReferenceCounted(false);
        try {
            wifiLock.acquire();
        } catch (Throwable t) {
            Log.w(TAG, "Unable to acquire native live WiFi lock", t);
        }
    }

    private void releaseWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
            } catch (Throwable t) {
                Log.w(TAG, "Unable to release native live WiFi lock", t);
            }
        }
        wifiLock = null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (running && !explicitStopRequested && lastStartIntent != null) {
            Log.w(TAG, "Vaelyndra task removed while native live is active; scheduling recovery");
            scheduleServiceRestart();
        }
        super.onTaskRemoved(rootIntent);
    }

    private void startAsForegroundService() {
        Notification notification = buildNotification();
        int serviceType = resolveForegroundServiceType();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                serviceType
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
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .build();
    }

    private int resolveForegroundServiceType() {
        if (Build.VERSION.SDK_INT < 29) {
            return 0;
        }
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
        if (hasRecordAudioPermission()) {
            type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }
        return type;
    }

    private boolean hasRecordAudioPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED;
    }

    private void handleStreamerStopped(String reason, boolean recoverable) {
        lastStopReason = reason == null ? "unknown" : reason;
        synchronized (sessionLock) {
            screenStreamer = null;
        }
        if (explicitStopRequested) {
            return;
        }
        Log.w(
            TAG,
            "Native streamer stopped unexpectedly (reason=" + lastStopReason +
                ", recoverable=" + recoverable + ")"
        );
        if (recoverable && lastStartIntent != null) {
            stopSelf();
            return;
        }
        running = false;
    }

    private void scheduleServiceRestart() {
        Intent restartIntent = lastStartIntent == null ? null : new Intent(lastStartIntent);
        if (restartIntent == null) return;
        try {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;
            PendingIntent pendingIntent = PendingIntent.getService(
                this,
                RESTART_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 1500,
                pendingIntent
            );
        } catch (Throwable t) {
            Log.w(TAG, "Unable to schedule native live recovery", t);
        }
    }
}
