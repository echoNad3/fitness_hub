package com.echonad3.fitnesshub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * Fires when the rest timer ends. Plays a strong, ~6-second vibration pattern so it is felt
 * clearly even while the phone is locked — independent of any notification.
 */
public class RestVibrationReceiver extends BroadcastReceiver {

    // Six strong 0.8s buzzes separated by short gaps (~6.3s total). Leading 0 = no initial wait.
    private static final long[] PATTERN = {0, 800, 250, 800, 250, 800, 250, 800, 250, 800, 250, 800};
    private static final int[] AMPLITUDES = {0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255};

    @Override
    public void onReceive(Context context, Intent intent) {
        // Keep the CPU awake long enough to run the vibration if the device was idle.
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock =
                    powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitnesshub:restVibration");
            wakeLock.acquire(8000L);
        }

        Vibrator vibrator = getVibrator(context);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(PATTERN, AMPLITUDES, -1));
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
