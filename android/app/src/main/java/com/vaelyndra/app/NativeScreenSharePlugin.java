package com.vaelyndra.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeScreenShare")
public class NativeScreenSharePlugin extends Plugin {
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", android.os.Build.VERSION.SDK_INT >= 21);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager manager = (MediaProjectionManager) getContext()
            .getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("media_projection_unavailable");
            return;
        }
        startActivityForResult(
            call,
            manager.createScreenCaptureIntent(),
            "screenCaptureResult"
        );
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, NativeScreenShareService.class));
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @ActivityCallback
    private void screenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
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
            NativeScreenShareService.EXTRA_RESULT_CODE,
            result.getResultCode()
        );
        serviceIntent.putExtra(
            NativeScreenShareService.EXTRA_RESULT_DATA,
            result.getData()
        );

        if (android.os.Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        JSObject ret = new JSObject();
        ret.put("granted", true);
        ret.put("status", "native_projection_started");
        call.resolve(ret);
    }
}
