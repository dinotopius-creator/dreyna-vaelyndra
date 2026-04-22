package com.vaelyndra.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeScreenShare")
public class NativeScreenSharePlugin extends Plugin {
    private static final String TAG = "VaelyndraNativeLive";

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", android.os.Build.VERSION.SDK_INT >= 21);
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", NativeScreenShareService.isRunning());
        ret.put("title", NativeScreenShareService.getLiveTitle());
        ret.put("category", NativeScreenShareService.getLiveCategory());
        ret.put("startedAtMs", NativeScreenShareService.getStartedAtMs());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBatteryOptimizationBypass(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) {
            JSObject ret = new JSObject();
            ret.put("requested", false);
            ret.put("alreadyAllowed", true);
            call.resolve(ret);
            return;
        }
        Context context = getContext();
        PowerManager powerManager = (PowerManager) context.getSystemService(
            Context.POWER_SERVICE
        );
        String packageName = context.getPackageName();
        if (
            powerManager != null &&
            powerManager.isIgnoringBatteryOptimizations(packageName)
        ) {
            JSObject ret = new JSObject();
            ret.put("requested", false);
            ret.put("alreadyAllowed", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("requested", true);
            ret.put("alreadyAllowed", false);
            call.resolve(ret);
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception ignored) {
                // Best effort only.
            }
            JSObject ret = new JSObject();
            ret.put("requested", false);
            ret.put("alreadyAllowed", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager manager = (MediaProjectionManager) getContext()
            .getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            Log.e(TAG, "MediaProjectionManager unavailable");
            call.reject("media_projection_unavailable");
            return;
        }
        Log.i(TAG, "Requesting Android screen capture permission");
        startActivityForResult(
            call,
            manager.createScreenCaptureIntent(),
            "screenCaptureResult"
        );
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Log.i(TAG, "Stopping native screen share service from plugin");
        context.stopService(new Intent(context, NativeScreenShareService.class));
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @ActivityCallback
    private void screenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            Log.w(TAG, "Android screen capture permission denied");
            call.reject("screen_capture_denied");
            return;
        }

        Context context = getContext();
        Intent serviceIntent = new Intent(context, NativeScreenShareService.class);
        serviceIntent.setAction(NativeScreenShareService.ACTION_START);
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_API_BASE,
            call.getString("apiBase", "https://api.vaelyndra.com")
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_BROADCAST_TOKEN,
            call.getString("broadcastToken", "")
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_TITLE,
            call.getString("title", "")
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_CATEGORY,
            call.getString("category", "")
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_RESULT_CODE,
            result.getResultCode()
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_RESULT_DATA,
            result.getData()
        );

        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Unable to start native screen share service", e);
            call.reject("native_service_start_failed", e);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("granted", true);
        ret.put("status", "native_projection_started");
        Log.i(TAG, "Native screen share service start requested");
        call.resolve(ret);
    }
}
