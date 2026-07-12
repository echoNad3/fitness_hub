package com.echonad3.fitnesshub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
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
 * tone through them (350ms silent lead-in + 3s of beeps; the lead-in lets a sleeping Bluetooth
 * link wake before the first beep). Nothing ever plays on the speaker: the tone uses media
 * routing (which follows the headset) and is not started at all without an external device.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    private static final long VIBRATE_MS = 3000L;
    private static final long SOUND_MS = 3350L;

    private static volatile MediaPlayer activePlayer;
    private static volatile Object activeFocusRequest;

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to run the alert if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(SOUND_MS + 3000L);
        }

        // The countdown notification's job ends here.
        RestTimerNotification.cancel(context);

        vibrate(context);

        // Sound playback needs the receiver's process to stay alive; goAsync() grants that window.
        if (playHeadphoneAlarm(context)) {
            PendingResult asyncResult = goAsync();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                stopSound(context);
                asyncResult.finish();
            }, SOUND_MS + 1500L);
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
            vibrator.vibrate(VibrationEffect.createOneShot(VIBRATE_MS, 255), attributes);
        } else {
            vibrator.vibrate(VIBRATE_MS);
        }
        return true;
    }

    /**
     * Plays the bundled alarm tone, but only when an external audio output (wired, USB, or
     * Bluetooth headset) is connected. Media routing follows the headset exclusively, and without
     * one nothing is started, so the speaker stays silent in every case. Plays at media volume.
     * The player holds its own partial wake lock and takes transient audio focus (ducking any
     * music) so playback doesn't stall while the screen is locked.
     */
    public static boolean playHeadphoneAlarm(Context context) {
        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null || !hasExternalAudioOutput(audioManager)) {
            return false;
        }

        stopSound(context);
        MediaPlayer player = new MediaPlayer();
        try {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            // setWakeMode must precede prepare(): the player then keeps the CPU awake itself for
            // the whole playback, independent of the receiver's shorter wake lock.
            player.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK);
            player.setAudioAttributes(attributes);
            try (AssetFileDescriptor source = context.getResources().openRawResourceFd(R.raw.rest_alarm)) {
                player.setDataSource(source.getFileDescriptor(), source.getStartOffset(), source.getLength());
            }
            player.prepare();

            requestFocus(audioManager, attributes);
            activePlayer = player;
            player.setOnCompletionListener(completed -> stopSound(context));
            player.start();
            return true;
        } catch (Exception e) {
            player.release();
            stopSound(context);
            return false;
        }
    }

    public static void stopSound(Context context) {
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

        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        Object focus = activeFocusRequest;
        activeFocusRequest = null;
        if (audioManager != null && focus != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest((AudioFocusRequest) focus);
        }
    }

    public static void cancel(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator != null) {
            vibrator.cancel();
        }
        stopSound(context);
    }

    // Transient may-duck focus: music dips under the beeps and recovers, and some Bluetooth stacks
    // only route new audio promptly once focus is granted.
    private static void requestFocus(AudioManager audioManager, AudioAttributes attributes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .build();
            audioManager.requestAudioFocus(request);
            activeFocusRequest = request;
        }
    }

    private static boolean hasExternalAudioOutput(AudioManager audioManager) {
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
