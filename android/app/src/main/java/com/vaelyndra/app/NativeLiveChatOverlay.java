package com.vaelyndra.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class NativeLiveChatOverlay {
    private final Context context;
    private final String apiBase;
    private final String broadcastToken;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private WindowManager windowManager;
    private WindowManager.LayoutParams params;
    private LinearLayout messageList;
    private LinearLayout viewerPanel;
    private ScrollView scrollView;
    private TextView viewerToggle;
    private Thread pollThread;
    private volatile boolean running = false;
    private boolean viewersOpen = false;
    private String lastCreatedAt = "";

    public NativeLiveChatOverlay(Context context, String apiBase, String broadcastToken) {
        this.context = context.getApplicationContext();
        this.apiBase = apiBase.replaceAll("/+$", "");
        this.broadcastToken = broadcastToken;
    }

    public void start() {
        if (android.os.Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(context)) {
            return;
        }
        running = true;
        mainHandler.post(this::showWindow);
        pollThread = new Thread(this::pollLoop, "VaelyndraLiveChatOverlay");
        pollThread.start();
    }

    public void stop() {
        running = false;
        if (pollThread != null) {
            pollThread.interrupt();
            pollThread = null;
        }
        mainHandler.post(this::detachWindow);
    }

    private void showWindow() {
        if (!running || scrollView != null) return;
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) return;

        try {
            messageList = new LinearLayout(context);
            messageList.setOrientation(LinearLayout.VERTICAL);
            messageList.setPadding(18, 14, 18, 14);

            LinearLayout titleRow = new LinearLayout(context);
            titleRow.setOrientation(LinearLayout.HORIZONTAL);
            titleRow.setGravity(Gravity.CENTER_VERTICAL);

            TextView title = new TextView(context);
            title.setText("Vaelyndra chat");
            title.setTextColor(Color.rgb(255, 226, 160));
            title.setTextSize(12);
            title.setGravity(Gravity.CENTER_VERTICAL);
            titleRow.addView(
                title,
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            );

            viewerToggle = new TextView(context);
            viewerToggle.setText("Viewers 0");
            viewerToggle.setTextColor(Color.WHITE);
            viewerToggle.setTextSize(12);
            viewerToggle.setGravity(Gravity.CENTER);
            viewerToggle.setPadding(dp(10), dp(5), dp(10), dp(5));
            viewerToggle.setBackgroundColor(Color.argb(92, 255, 226, 160));
            viewerToggle.setOnClickListener(v -> {
                viewersOpen = !viewersOpen;
                if (viewerPanel != null) {
                    viewerPanel.setVisibility(viewersOpen ? View.VISIBLE : View.GONE);
                }
            });
            titleRow.addView(viewerToggle);
            messageList.addView(titleRow);

            viewerPanel = new LinearLayout(context);
            viewerPanel.setOrientation(LinearLayout.VERTICAL);
            viewerPanel.setPadding(0, dp(10), 0, dp(8));
            viewerPanel.setVisibility(View.GONE);
            messageList.addView(viewerPanel);

            scrollView = new ScrollView(context);
            scrollView.setBackgroundColor(Color.argb(176, 15, 10, 30));
            scrollView.addView(messageList);
            scrollView.setOnTouchListener(new DragListener());

            int type = android.os.Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
            params = new WindowManager.LayoutParams(
                dp(280),
                dp(360),
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP | Gravity.START;
            params.x = dp(24);
            params.y = dp(120);
            windowManager.addView(scrollView, params);
        } catch (Exception e) {
            disableOverlayOnly();
        }
    }

    private void pollLoop() {
        while (running) {
            try {
                String query = lastCreatedAt.isEmpty()
                    ? "?limit=80"
                    : "?limit=80&after=" + java.net.URLEncoder.encode(lastCreatedAt, "UTF-8");
                JSONObject payload = httpJson("/live/native/chat" + query);
                JSONArray messages = payload.optJSONArray("messages");
                if (messages != null && messages.length() > 0) {
                    JSONObject last = messages.optJSONObject(messages.length() - 1);
                    if (last != null) lastCreatedAt = last.optString("created_at", lastCreatedAt);
                    mainHandler.post(() -> appendMessages(messages));
                }
                JSONObject viewerPayload = httpJson("/live/native/viewers");
                JSONArray viewers = viewerPayload.optJSONArray("viewers");
                if (viewers != null) {
                    mainHandler.post(() -> updateViewers(viewers));
                }
                Thread.sleep(2200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                try {
                    Thread.sleep(3500);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void appendMessages(JSONArray messages) {
        if (messageList == null || scrollView == null) return;
        try {
            for (int i = 0; i < messages.length(); i++) {
                JSONObject msg = messages.optJSONObject(i);
                if (msg == null) continue;
                TextView line = new TextView(context);
                String author = msg.optString("author_name", "Membre");
                String content = msg.optString("content", "");
                line.setText(author + " : " + content);
                line.setTextColor(Color.WHITE);
                line.setTextSize(12);
                line.setPadding(0, 8, 0, 0);
                messageList.addView(line);
            }
            while (messageList.getChildCount() > 90) {
                messageList.removeViewAt(2);
            }
            scrollView.post(() -> {
                try {
                    scrollView.fullScroll(View.FOCUS_DOWN);
                } catch (Exception ignored) {
                    // Overlay detached while the UI update was queued.
                }
            });
        } catch (Exception e) {
            disableOverlayOnly();
        }
    }

    private void updateViewers(JSONArray viewers) {
        if (viewerToggle == null || viewerPanel == null) return;
        try {
            viewerToggle.setText("Viewers " + viewers.length());
            viewerPanel.removeAllViews();
            TextView heading = new TextView(context);
            heading.setText("Spectateurs en direct");
            heading.setTextColor(Color.rgb(255, 226, 160));
            heading.setTextSize(11);
            heading.setPadding(0, 0, 0, dp(6));
            viewerPanel.addView(heading);
            if (viewers.length() == 0) {
                TextView empty = new TextView(context);
                empty.setText("Aucun spectateur connecte.");
                empty.setTextColor(Color.argb(190, 255, 255, 255));
                empty.setTextSize(11);
                viewerPanel.addView(empty);
                return;
            }
            for (int i = 0; i < viewers.length(); i++) {
                JSONObject viewer = viewers.optJSONObject(i);
                if (viewer == null) continue;
                String name = viewer.optString("username", "Membre");
                TextView line = new TextView(context);
                line.setText("- " + name);
                line.setTextColor(Color.WHITE);
                line.setTextSize(12);
                line.setPadding(0, dp(3), 0, dp(3));
                viewerPanel.addView(line);
            }
        } catch (Exception e) {
            disableOverlayOnly();
        }
    }

    private JSONObject httpJson(String path) throws Exception {
        URL url = new URL(apiBase + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("Accept", "application/json");
        if (broadcastToken != null && !broadcastToken.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + broadcastToken);
        }
        int code = conn.getResponseCode();
        InputStream stream = code >= 200 && code < 300
            ? conn.getInputStream()
            : conn.getErrorStream();
        String text = readAll(stream);
        if (code < 200 || code >= 300) throw new RuntimeException("HTTP " + code);
        return text.isEmpty() ? new JSONObject() : new JSONObject(text);
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private void disableOverlayOnly() {
        running = false;
        if (pollThread != null) {
            pollThread.interrupt();
            pollThread = null;
        }
        detachWindow();
    }

    private void detachWindow() {
        if (windowManager != null && scrollView != null) {
            try {
                windowManager.removeView(scrollView);
            } catch (Exception ignored) {
                // Already detached or overlay permission revoked.
            }
        }
        scrollView = null;
        messageList = null;
        viewerPanel = null;
        viewerToggle = null;
        params = null;
    }

    private class DragListener implements View.OnTouchListener {
        private int startX;
        private int startY;
        private float touchX;
        private float touchY;

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            if (params == null || windowManager == null || scrollView == null) return false;
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    startX = params.x;
                    startY = params.y;
                    touchX = event.getRawX();
                    touchY = event.getRawY();
                    return false;
                case MotionEvent.ACTION_MOVE:
                    params.x = startX + Math.round(event.getRawX() - touchX);
                    params.y = startY + Math.round(event.getRawY() - touchY);
                    try {
                        windowManager.updateViewLayout(scrollView, params);
                    } catch (Exception e) {
                        disableOverlayOnly();
                    }
                    return false;
                default:
                    return false;
            }
        }
    }
}
