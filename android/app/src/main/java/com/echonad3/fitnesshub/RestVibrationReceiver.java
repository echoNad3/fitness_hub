package com.echonad3.fitnesshub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Fires exactly when the rest timer ends. Plays one continuous maximum-amplitude vibration for
 * three seconds, and — only when headphones or a Bluetooth audio device are connected — an alarm
 * tone through them for the same three seconds. Nothing ever plays on the speaker: the tone uses
 * media routing (which follows the headset) and is not started at all without an external device.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    private static final long ALERT_MS = 3000L;

    private static volatile MediaPlayer activePlayer;

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to run the alert if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(ALERT_MS + 2000L);
        }

        // The countdown notification's job ends here.
        RestTimerNotification.cancel(context);

        vibrate(context);

        // Sound playback needs the receiver's process to stay alive; goAsync() grants that window.
        if (playHeadphoneAlarm(context)) {
            PendingResult asyncResult = goAsync();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                stopSound();
                asyncResult.finish();
            }, ALERT_MS + 500L);
        }
    }

    /** One continuous three-second vibration at the hardware's maximum amplitude. */
    public static boolean vibrate(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Alarm usage lets the vibration play while the screen is locked and through
            // Do Not Disturb. (Vibration only — the tone below uses media routing.)
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            vibrator.vibrate(VibrationEffect.createOneShot(ALERT_MS, 255), attributes);
        } else {
            vibrator.vibrate(ALERT_MS);
        }
        return true;
    }

    /**
     * Plays the bundled alarm tone, but only when an external audio output (wired, USB, or
     * Bluetooth headset) is connected. Media routing follows the headset exclusively, and without
     * one nothing is started, so the speaker stays silent in every case. Plays at media volume.
     */
    public static boolean playHeadphoneAlarm(Context context) {
        if (!hasExternalAudioOutput(context)) {
            return false;
        }

        stopSound();
        try {
            MediaPlayer player = MediaPlayer.create(context, R.raw.rest_alarm);
            if (player == null) {
                return false;
            }
            activePlayer = player;
            player.setOnCompletionListener(completed -> stopSound());
            player.start();
            return true;
        } catch (Exception e) {
            stopSound();
            return false;
        }
    }

    public static void stopSound() {
        MediaPlayer player = activePlayer;
        activePlayer = null;
        if (player != null) {
            try {
                player.stop();
            } catch (IllegalStateException ignored) {
                // Already stopped or released.
            }
            player.release();
        }
    }

    public static void cancel(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator != null) {
            vibrator.cancel();
        }
        stopSound();
    }

    private static boolean hasExternalAudioOutput(Context context) {
        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            return false;
        }
        for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            switch (device.getType()) {
                case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                case AudioDeviceInfo.TYPE_USB_HEADSET:
                case AudioDeviceInfo.TYPE_HEARING_AID:
                case AudioDeviceInfo.TYPE_BLE_HEADSET:
                    return true;
                default:
                    break;
            }
        }
        return false;
    }

    private static Vibrator getVibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
