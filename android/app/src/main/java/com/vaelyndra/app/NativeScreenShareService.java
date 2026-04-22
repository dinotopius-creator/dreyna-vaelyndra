package com.vaelyndra.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class NativeScreenShareService extends Service {
    public static final String ACTION_START = "com.vaelyndra.app.NativeScreenShare.START";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";

    private static final String CHANNEL_ID = "vaelyndra_screen_share";
    private static final int NOTIFICATION_ID = 4217;

    private NativeWebRtcScreenStreamer screenStreamer;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
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

        screenStreamer = new NativeWebRtcScreenStreamer(this, resultData);
        screenStreamer.start();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (screenStreamer != null) {
            screenStreamer.stop();
            screenStreamer = null;
        }
        super.onDestroy();
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
