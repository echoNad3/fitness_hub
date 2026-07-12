package com.echonad3.fitnesshub;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Owns the single ongoing Android notification shown while a rest timer is running. */
public final class RestTimerNotification {

    // v2: default importance. The original low-importance channel kept the countdown off the lock
    // screen on phones that hide silent notifications there; a channel's importance can't be
    // raised in place, so this is a new id and the old channel is deleted.
    private static final String CHANNEL_ID = "rest_timer_v2";
    private static final String LEGACY_CHANNEL_ID = "rest_timer";
    private static final int NOTIFICATION_ID = 9102;

    // The in-app timer rounds remaining time UP (0.4s left reads "1"); Android's Chronometer
    // truncates DOWN (0.4s left reads "0"), which made the notification sit one second behind the
    // app and dip to -0:01. Biasing the chronometer target by just under a second makes both
    // clocks show the same digit all the way to zero.
    private static final long CHRONOMETER_ROUNDING_MS = 999L;

    private RestTimerNotification() {}

    public static PendingIntent buildContentIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, 0, intent, flags);
    }

    public static boolean show(Context context, long endsAt) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        createChannel(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return false;
        }
        long remaining = Math.max(0L, endsAt - System.currentTimeMillis());
        long timeoutAfter = Math.max(1000L, remaining + 1000L);

        // Standard template on purpose: custom notification layouts are unreliable on lock screens
        // (several OEMs silently drop them there). The system chronometer renders the live
        // countdown, which the standard template shows in the header time slot.
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_fitness)
                .setContentTitle("Rest timer")
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(true)
                .setWhen(endsAt + CHRONOMETER_ROUNDING_MS)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setTimeoutAfter(timeoutAfter)
                .setContentIntent(buildContentIntent(context));

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        return true;
    }

    public static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        manager.deleteNotificationChannel(LEGACY_CHANNEL_ID);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        // Default importance so lock screens show the countdown; the notification itself is
        // silent (setSilent above) and the channel carries no sound or vibration.
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rest timer",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Shows the time left on an active rest timer.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }
}
