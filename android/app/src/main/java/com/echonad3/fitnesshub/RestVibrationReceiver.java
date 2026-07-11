package com.echonad3.fitnesshub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Fires when the rest timer ends. Plays the strong one-shot rest pattern so it is felt clearly
 * while the phone is locked, using Android's alarm vibration policy.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    // Three unmistakable pulses, played once. This custom waveform is reserved for rest completion.
    private static final long[] PATTERN = {0, 400, 150, 400, 150, 1000, 200, 1000};
    private static final int[] AMPLITUDES = {0, 255, 0, 255, 0, 255, 0, 255};

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to run the vibration if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(5000L);
        }

        vibrate(context);
    }

    public static boolean vibrate(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Mark this as an alarm so Android applies the device's alarm vibration policy and can
            // deliver the user-started rest alert while the screen is locked.
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            vibrator.vibrate(VibrationEffect.createWaveform(PATTERN, AMPLITUDES, -1), attributes);
        } else {
            vibrator.vibrate(PATTERN, -1);
        }
        return true;
    }

    private static Vibrator getVibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
