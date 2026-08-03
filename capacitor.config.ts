/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli'
import { readThemeTokens, requireHexThemeToken } from './scripts/theme-tokens.mjs'

const themeTokens = readThemeTokens()
const themeBackground = requireHexThemeToken(themeTokens, '--bg')
const themeAccent = requireHexThemeToken(themeTokens, '--accent')

const config: CapacitorConfig = {
  appId: 'com.echonad3.fitnesshub',
  appName: 'Fitness Hub',
  webDir: 'dist',
  // Paint the WebView with the app background so the cold-start hand-off (after the splash, before
  // the remote page loads) shows the app's dark colour instead of a black screen with grey bars.
  backgroundColor: themeBackground,
  android: {
    backgroundColor: themeBackground,
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
      iconColor: themeAccent,
    },
  },
}

export default config
