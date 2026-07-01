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
 * Fires when the rest timer ends. Plays a maximum-amplitude 3-second vibration so it is felt
 * clearly even while the phone is locked — independent of any notification.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    // Leading 0 = no initial wait; amplitude 255 is the strongest supported waveform level.
    private static final long[] PATTERN = {0, 3000};
    private static final int[] AMPLITUDES = {0, 255};

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to run the vibration if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(5000L);
        }

        Vibrator vibrator = getVibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Mark this as an ALARM vibration. Without a usage, Android suppresses background
            // vibrations while the screen is locked/off; USAGE_ALARM is allowed to play through a
            // locked screen and through Do Not Disturb — which is exactly the rest-end alert we want.
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            vibrator.vibrate(VibrationEffect.createWaveform(PATTERN, AMPLITUDES, -1), attributes);
        } else {
            vibrator.vibrate(PATTERN, -1);
        }
    }

    private Vibrator getVibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
