import { Capacitor, registerPlugin } from '@capacitor/core'

type LaunchScreenPlugin = {
  hide: () => Promise<void>
}

type LegacySplashScreenPlugin = {
  hide: (options?: { fadeOutDuration?: number }) => Promise<void>
}

const launchScreen = registerPlugin<LaunchScreenPlugin>('LaunchScreen')
const legacySplashScreen = registerPlugin<LegacySplashScreenPlugin>('SplashScreen')

// New APKs use the correctly timed native controller. The fallback prevents an auto-updated web
// bundle from trapping someone behind the splash on an older APK that only has Capacitor's plugin.
export async function hideLaunchScreen(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await launchScreen.hide()
  } catch {
    await legacySplashScreen.hide({ fadeOutDuration: 0 }).catch(() => undefined)
  }
}
