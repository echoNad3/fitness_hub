package com.echonad3.fitnesshub;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private volatile boolean keepLaunchSplash = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install exactly once, before the Activity creates its first frame. Installing again from
        // a late-loading plugin can make Android rebuild/composite the icon during launch.
        SplashScreen launchSplash = SplashScreen.installSplashScreen(this);
        registerPlugin(RestAlarmPlugin.class);
        registerPlugin(AppHapticsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(LaunchScreenPlugin.class);
        super.onCreate(savedInstanceState);

        launchSplash.setKeepOnScreenCondition(() -> keepLaunchSplash);
        // The UI uses the same background, so remove the launch window directly instead of fading a
        // rasterized copy of it for the final 150 ms.
        launchSplash.setOnExitAnimationListener(splashScreenView -> splashScreenView.remove());

        // Draw edge-to-edge: let the WebView extend behind the status and navigation bars,
        // and make those bars transparent. The web layer pads its content using the CSS
        // env(safe-area-inset-*) values (viewport-fit=cover) so nothing is hidden underneath.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }

    void hideLaunchSplash() {
        keepLaunchSplash = false;
    }
}
