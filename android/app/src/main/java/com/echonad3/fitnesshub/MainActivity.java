package com.echonad3.fitnesshub;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RestAlarmPlugin.class);
        registerPlugin(AppHapticsPlugin.class);
        super.onCreate(savedInstanceState);

        // Draw edge-to-edge: let the WebView extend behind the status and navigation bars,
        // and make those bars transparent. The web layer pads its content using the CSS
        // env(safe-area-inset-*) values (viewport-fit=cover) so nothing is hidden underneath.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
