package com.echonad3.fitnesshub;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install the Android 12+ compatible splash before the Activity creates its first frame.
        // The launch theme explicitly prefers the branded icon, including installer relaunches.
        SplashScreen.installSplashScreen(this);
        registerPlugin(RestAlarmPlugin.class);
        registerPlugin(AppHapticsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        // Draw edge-to-edge: let the WebView extend behind the status and navigation bars,
        // and make those bars transparent. The web layer pads its content using the CSS
        // env(safe-area-inset-*) values (viewport-fit=cover) so nothing is hidden underneath.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
