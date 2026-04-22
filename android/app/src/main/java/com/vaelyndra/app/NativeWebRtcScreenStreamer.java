package com.vaelyndra.app;

import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;

import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.MediaConstraints;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

public class NativeWebRtcScreenStreamer {
    private static boolean factoryInitialized = false;

    private final Context context;
    private final Intent mediaProjectionData;
    private final EglBase eglBase;
    private final PeerConnectionFactory peerConnectionFactory;

    private ScreenCapturerAndroid screenCapturer;
    private SurfaceTextureHelper surfaceTextureHelper;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private AudioSource audioSource;
    private AudioTrack audioTrack;

    public NativeWebRtcScreenStreamer(Context context, Intent mediaProjectionData) {
        this.context = context.getApplicationContext();
        this.mediaProjectionData = mediaProjectionData;

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
    }

    public VideoTrack getVideoTrack() {
        return videoTrack;
    }

    public AudioTrack getAudioTrack() {
        return audioTrack;
    }

    public void stop() {
        if (screenCapturer != null) {
            try {
                screenCapturer.stopCapture();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
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
}
