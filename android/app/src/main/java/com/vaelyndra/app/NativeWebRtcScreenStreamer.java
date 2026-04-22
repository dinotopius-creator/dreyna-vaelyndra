package com.vaelyndra.app;

import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.webkit.CookieManager;

import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.SdpObserver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class NativeWebRtcScreenStreamer {
    private static boolean factoryInitialized = false;

    private final Context context;
    private final Intent mediaProjectionData;
    private final String apiBase;
    private final String broadcastToken;
    private final EglBase eglBase;
    private final PeerConnectionFactory peerConnectionFactory;
    private final Map<String, PeerConnection> peerConnections = new HashMap<>();
    private final Map<String, Set<String>> appliedViewerIce = new HashMap<>();

    private ScreenCapturerAndroid screenCapturer;
    private SurfaceTextureHelper surfaceTextureHelper;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private AudioSource audioSource;
    private AudioTrack audioTrack;
    private Thread signalingThread;
    private long lastHeartbeatAtMs = 0;
    private volatile boolean running = false;

    public NativeWebRtcScreenStreamer(
        Context context,
        Intent mediaProjectionData,
        String apiBase,
        String broadcastToken
    ) {
        this.context = context.getApplicationContext();
        this.mediaProjectionData = mediaProjectionData;
        this.apiBase = apiBase.replaceAll("/+$", "");
        this.broadcastToken = broadcastToken;

        if (!factoryInitialized) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(this.context)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions()
            );
            factoryInitialized = true;
        }

        eglBase = EglBase.create();
        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(
                new DefaultVideoEncoderFactory(
                    eglBase.getEglBaseContext(),
                    true,
                    true
                )
            )
            .setVideoDecoderFactory(
                new DefaultVideoDecoderFactory(eglBase.getEglBaseContext())
            )
            .createPeerConnectionFactory();
    }

    public void start() {
        screenCapturer = new ScreenCapturerAndroid(
            mediaProjectionData,
            new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stop();
                }
            }
        );

        surfaceTextureHelper = SurfaceTextureHelper.create(
            "VaelyndraScreenCapture",
            eglBase.getEglBaseContext()
        );
        videoSource = peerConnectionFactory.createVideoSource(true);
        screenCapturer.initialize(
            surfaceTextureHelper,
            context,
            videoSource.getCapturerObserver()
        );
        screenCapturer.startCapture(720, 1280, 30);
        videoTrack = peerConnectionFactory.createVideoTrack(
            "vaelyndra-screen-video",
            videoSource
        );
        videoTrack.setEnabled(true);

        // Micro Android natif. Le son interne du jeu demandera une étape
        // séparée AudioPlaybackCapture (Android 10+) et des contraintes par app.
        audioSource = peerConnectionFactory.createAudioSource(new MediaConstraints());
        audioTrack = peerConnectionFactory.createAudioTrack(
            "vaelyndra-mic-audio",
            audioSource
        );
        audioTrack.setEnabled(true);

        running = true;
        signalingThread = new Thread(this::pollSignalingLoop, "VaelyndraNativeWebRtc");
        signalingThread.start();
    }

    public VideoTrack getVideoTrack() {
        return videoTrack;
    }

    public AudioTrack getAudioTrack() {
        return audioTrack;
    }

    public void stop() {
        running = false;
        if (signalingThread != null) {
            signalingThread.interrupt();
            signalingThread = null;
        }
        for (PeerConnection peerConnection : peerConnections.values()) {
            peerConnection.close();
            peerConnection.dispose();
        }
        peerConnections.clear();
        appliedViewerIce.clear();
        if (screenCapturer != null) {
            screenCapturer.stopCapture();
            screenCapturer.dispose();
            screenCapturer = null;
        }
        if (videoTrack != null) {
            videoTrack.dispose();
            videoTrack = null;
        }
        if (videoSource != null) {
            videoSource.dispose();
            videoSource = null;
        }
        if (audioTrack != null) {
            audioTrack.dispose();
            audioTrack = null;
        }
        if (audioSource != null) {
            audioSource.dispose();
            audioSource = null;
        }
        if (surfaceTextureHelper != null) {
            surfaceTextureHelper.dispose();
            surfaceTextureHelper = null;
        }
        peerConnectionFactory.dispose();
        eglBase.release();
    }

    private void pollSignalingLoop() {
        while (running) {
            try {
                sendHeartbeatIfNeeded();
                JSONObject payload = httpJson("GET", "/live/native/offers", null);
                JSONArray offers = payload.optJSONArray("offers");
                if (offers != null) {
                    for (int i = 0; i < offers.length(); i++) {
                        JSONObject offer = offers.optJSONObject(i);
                        if (offer != null) handleOffer(offer);
                    }
                }
                Thread.sleep(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                try {
                    Thread.sleep(2500);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void sendHeartbeatIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - lastHeartbeatAtMs < 25_000) return;
        lastHeartbeatAtMs = now;
        try {
            httpJson("POST", "/live/native/heartbeat", new JSONObject());
        } catch (Exception ignored) {
            // Le prochain tour réessaiera ; ne coupe jamais la capture pour un ping raté.
        }
    }

    private void handleOffer(JSONObject offer) throws JSONException {
        String sessionId = offer.optString("session_id", "");
        String offerSdp = offer.optString("offer_sdp", "");
        if (sessionId.isEmpty() || offerSdp.isEmpty()) return;

        PeerConnection pc = peerConnections.get(sessionId);
        if (pc == null) {
            pc = createPeerConnection(sessionId);
            peerConnections.put(sessionId, pc);
            pc.addTrack(videoTrack, Collections.singletonList("vaelyndra-native"));
            pc.addTrack(audioTrack, Collections.singletonList("vaelyndra-native"));
            PeerConnection finalPc = pc;
            pc.setRemoteDescription(
                new SimpleSdpObserver() {
                    @Override
                    public void onSetSuccess() {
                        finalPc.createAnswer(
                            new SimpleSdpObserver() {
                                @Override
                                public void onCreateSuccess(SessionDescription sdp) {
                                    finalPc.setLocalDescription(
                                        new SimpleSdpObserver() {
                                            @Override
                                            public void onSetSuccess() {
                                                try {
                                                    JSONObject body = new JSONObject();
                                                    body.put("answer_sdp", sdp.description);
                                                    httpJson(
                                                        "POST",
                                                        "/live/native/offers/" + sessionId + "/answer",
                                                        body
                                                    );
                                                } catch (Exception ignored) {
                                                    // Le prochain viewer retry ouvrira une nouvelle offre.
                                                }
                                            }
                                        },
                                        sdp
                                    );
                                }
                            },
                            new MediaConstraints()
                        );
                    }
                },
                new SessionDescription(SessionDescription.Type.OFFER, offerSdp)
            );
        }

        JSONArray viewerIce = offer.optJSONArray("viewer_ice");
        if (viewerIce == null) return;
        Set<String> seen = appliedViewerIce.computeIfAbsent(
            sessionId,
            key -> new HashSet<>()
        );
        for (int i = 0; i < viewerIce.length(); i++) {
            JSONObject c = viewerIce.optJSONObject(i);
            if (c == null) continue;
            String candidate = c.optString("candidate", "");
            if (candidate.isEmpty()) continue;
            String sdpMid = c.optString("sdpMid", null);
            int sdpMLineIndex = c.optInt("sdpMLineIndex", 0);
            String key = sdpMid + ":" + sdpMLineIndex + ":" + candidate;
            if (seen.contains(key)) continue;
            seen.add(key);
            pc.addIceCandidate(new IceCandidate(sdpMid, sdpMLineIndex, candidate));
        }
    }

    private PeerConnection createPeerConnection(String sessionId) {
        List<PeerConnection.IceServer> iceServers = new ArrayList<>();
        iceServers.add(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer());
        iceServers.add(PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer());
        iceServers.add(
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:80")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer()
        );
        iceServers.add(
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer()
        );
        iceServers.add(
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443?transport=tcp")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer()
        );
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(iceServers);
        config.iceTransportsType = PeerConnection.IceTransportsType.ALL;
        return peerConnectionFactory.createPeerConnection(
            config,
            new PeerConnection.Observer() {
                @Override
                public void onIceCandidate(IceCandidate candidate) {
                    try {
                        JSONObject body = new JSONObject();
                        JSONObject c = new JSONObject();
                        c.put("candidate", candidate.sdp);
                        c.put("sdpMid", candidate.sdpMid);
                        c.put("sdpMLineIndex", candidate.sdpMLineIndex);
                        body.put("candidate", c);
                        httpJson(
                            "POST",
                            "/live/native/offers/" + sessionId + "/broadcaster-ice",
                            body
                        );
                    } catch (Exception ignored) {
                        // ICE trickle best-effort ; TURN/STUN réessaient côté stack.
                    }
                }

                @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
                @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {}
                @Override public void onIceConnectionReceivingChange(boolean receiving) {}
                @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) {}
                @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
                @Override public void onAddStream(org.webrtc.MediaStream stream) {}
                @Override public void onRemoveStream(org.webrtc.MediaStream stream) {}
                @Override public void onDataChannel(org.webrtc.DataChannel channel) {}
                @Override public void onRenegotiationNeeded() {}
                @Override public void onAddTrack(org.webrtc.RtpReceiver receiver, org.webrtc.MediaStream[] streams) {}
            }
        );
    }

    private JSONObject httpJson(String method, String path, JSONObject body)
        throws IOException, JSONException {
        URL url = new URL(apiBase + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Content-Type", "application/json");
        String cookie = CookieManager.getInstance().getCookie(apiBase);
        if (cookie != null && !cookie.isEmpty()) {
            conn.setRequestProperty("Cookie", cookie);
        }
        if (broadcastToken != null && !broadcastToken.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + broadcastToken);
        }
        if (body != null) {
            conn.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
        }
        int code = conn.getResponseCode();
        InputStream stream = code >= 200 && code < 300
            ? conn.getInputStream()
            : conn.getErrorStream();
        String text = readAll(stream);
        if (code < 200 || code >= 300) {
            throw new IOException("HTTP " + code + " " + text);
        }
        if (text == null || text.isEmpty()) return new JSONObject();
        return new JSONObject(text);
    }

    private String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static class SimpleSdpObserver implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sdp) {}
        @Override public void onSetSuccess() {}
        @Override public void onCreateFailure(String error) {}
        @Override public void onSetFailure(String error) {}
    }
}
