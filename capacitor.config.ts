/// <reference types="@capacitor/local-notifications" />
/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.echonad3.fitnesshub',
  appName: 'Fitness Hub',
  webDir: 'dist',
  // Paint the WebView with the app background so the cold-start hand-off (after the splash, before
  // the remote page loads) shows the app's dark colour instead of a black screen with grey bars.
  backgroundColor: '#252730',
  android: {
    backgroundColor: '#252730',
  },
  // Load the live site so the native app auto-updates with every web deploy.
  // The native bridge (Local Notifications) still injects into the remote page.
  // The bundled `dist` stays as the cap-sync target; offline relies on the cached
  // service worker after the first online launch. Rebuild the APK only for native
  // changes (config, plugins, icons).
  server: {
    url: 'https://echonad3.github.io/fitness_hub/',
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_fitness',
      iconColor: '#6074f3',
    },
    // Keep the native splash (logo on the app background) up until the web UI has actually
    // mounted — App calls SplashScreen.hide() on mount — so launch never flashes a blank frame.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#252730',
      androidScaleType: 'CENTER_CROP',
    },
  },
}

export default config
