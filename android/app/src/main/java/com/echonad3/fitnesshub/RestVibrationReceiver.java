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
 * Fires exactly when the rest timer ends: one continuous five-second vibration at the hardware's
 * maximum amplitude. Vibration only — the alert is always silent to everyone around.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    private static final long VIBRATE_MS = 5000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to start the vibration if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(VIBRATE_MS + 2000L);
        }

        // The countdown notification's job ends here.
        RestTimerNotification.cancel(context);

        vibrate(context);
    }

    /** One continuous five-second vibration at the hardware's maximum amplitude. */
    public static boolean vibrate(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Alarm usage lets the vibration play while the screen is locked and through
            // Do Not Disturb.
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

    public static void cancel(Context context) {
        Vibrator vibrator = getVibrator(context);
        if (vibrator != null) {
            vibrator.cancel();
        }
    }

    private static Vibrator getVibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
