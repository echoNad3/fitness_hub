package com.echonad3.fitnesshub;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Semantic interaction haptics for the web UI. View.performHapticFeedback uses device-tuned
 * effects and, unlike raw Vibrator calls, honors Android's system Touch feedback setting.
 */
@CapacitorPlugin(name = "AppHaptics")
public class AppHapticsPlugin extends Plugin {

    @PluginMethod
    public void perform(PluginCall call) {
        String type = call.getString("type");
        if (type == null) {
            call.reject("Missing haptic type");
            return;
        }

        Integer constant = constantFor(type);
        if (constant == null) {
            call.reject("Unknown haptic type");
            return;
        }

        getActivity().runOnUiThread(() -> {
            View webView = getBridge().getWebView();
            boolean performed = webView != null && webView.performHapticFeedback(constant);
            JSObject result = new JSObject();
            result.put("performed", performed);
            call.resolve(result);
        });
    }

    private Integer constantFor(String type) {
        switch (type) {
            case "selection":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                        ? HapticFeedbackConstants.SEGMENT_TICK
                        : HapticFeedbackConstants.CLOCK_TICK;
            case "increment":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                        ? HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
                        : HapticFeedbackConstants.CLOCK_TICK;
            case "toggle-on":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                        ? HapticFeedbackConstants.TOGGLE_ON
                        : HapticFeedbackConstants.CONTEXT_CLICK;
            case "toggle-off":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                        ? HapticFeedbackConstants.TOGGLE_OFF
                        : HapticFeedbackConstants.CONTEXT_CLICK;
            case "drag-start":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                        ? HapticFeedbackConstants.DRAG_START
                        : HapticFeedbackConstants.LONG_PRESS;
            case "drag-end":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.GESTURE_END
                        : HapticFeedbackConstants.CONTEXT_CLICK;
            case "confirm":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.CONFIRM
                        : HapticFeedbackConstants.VIRTUAL_KEY;
            case "error":
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.REJECT
                        : HapticFeedbackConstants.LONG_PRESS;
            case "destructive":
                return HapticFeedbackConstants.LONG_PRESS;
            default:
                return null;
        }
    }
}
