package com.echonad3.fitnesshub;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Schedules an exact alarm that triggers RestVibrationReceiver at the rest-end time, so the phone
 * vibrates strongly even when locked. This is the native side of the "locked-screen rest alert".
 */
@CapacitorPlugin(name = "RestAlarm")
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

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("Alarm service unavailable.");
            return;
        }

        long triggerAt = triggerAtValue;
        PendingIntent pendingIntent = buildPendingIntent();
        boolean exact = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                exact = false;
            }
            if (exact) {
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
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(buildPendingIntent());
        }
        call.resolve();
    }
}
