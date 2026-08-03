package com.echonad3.fitnesshub;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Schedules an exact alarm that triggers RestVibrationReceiver at the moment rest ends. The alarm,
 * the countdown notification, and the in-app timer all share that one timestamp, so they can never
 * drift apart (an earlier lead-in design let a web/native version skew put them 3 seconds apart).
 */
@CapacitorPlugin(
        name = "RestAlarm",
        permissions = @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
)
public class RestAlarmPlugin extends Plugin {

    private static final int REQUEST_CODE = 9101;

    /**
     * Reads the epoch-ms "at" value defensively. The Capacitor bridge may deliver a large
     * timestamp as a Long, Integer, Double, or String depending on how it was serialized, so we
     * accept any numeric or numeric-string form rather than relying on getDouble() (which returns
     * null for Long values).
     */
    private Long readTimestamp(PluginCall call) {
        Object raw = call.getData().opt("at");
        if (raw instanceof Number) {
            return ((Number) raw).longValue();
        }
        if (raw instanceof String) {
            try {
                return (long) Double.parseDouble(((String) raw).trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private PendingIntent buildPendingIntent() {
        Context context = getContext();
        Intent intent = new Intent(context, RestVibrationReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Long triggerAtValue = readTimestamp(call);
        if (triggerAtValue == null) {
            call.reject("Missing or invalid 'at' timestamp.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "schedulePermissionCallback");
            return;
        }

        scheduleAlarm(call, triggerAtValue);
    }

    @PermissionCallback
    private void schedulePermissionCallback(PluginCall call) {
        Long triggerAtValue = readTimestamp(call);
        if (triggerAtValue == null) {
            call.reject("Missing or invalid 'at' timestamp.");
            return;
        }
        scheduleAlarm(call, triggerAtValue);
    }

    private void scheduleAlarm(PluginCall call, long triggerAt) {

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("Alarm service unavailable.");
            return;
        }

        PendingIntent pendingIntent = buildPendingIntent();
        boolean exact = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                exact = false;
            }
            if (exact) {
                // Exact + allowWhileIdle wakes the device from doze at the precise time without
                // registering a system alarm clock — setAlarmClock made Android advertise the ring
                // time (an alarm icon and clock on the lock screen), which the user doesn't want.
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            }
        } catch (SecurityException e) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            exact = false;
        }

        JSObject result = new JSObject();
        result.put("scheduled", true);
        result.put("exact", exact);
        result.put("notification", RestTimerNotification.show(context, triggerAt));
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(buildPendingIntent());
        }
        RestVibrationReceiver.cancel(context);
        RestTimerNotification.cancel(context);
        call.resolve();
    }

    @PluginMethod
    public void preview(PluginCall call) {
        // Plays exactly the vibration a real timer plays.
        JSObject result = new JSObject();
        result.put("performed", RestVibrationReceiver.vibrate(getContext()));
        call.resolve(result);
    }
}
