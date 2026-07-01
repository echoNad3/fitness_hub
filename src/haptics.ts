import { Capacitor, registerPlugin } from '@capacitor/core'

// The app has one semantic haptic vocabulary. Callers describe what happened; Android chooses the
// device-tuned effect and respects the system Touch feedback setting through performHapticFeedback.
// Ordinary navigation, opening/closing UI, typing, scrolling, and generic presses never call here.
export type HapticEvent =
  | 'selection'
  | 'increment'
  | 'toggle-on'
  | 'toggle-off'
  | 'drag-start'
  | 'drag-end'
  | 'confirm'
  | 'error'
  | 'destructive'
  | 'timer-finished'

type NativeHapticEvent = Exclude<HapticEvent, 'timer-finished'>

interface AppHapticsPlugin {
  perform(options: { type: NativeHapticEvent }): Promise<{ performed: boolean }>
}

const AppHaptics = registerPlugin<AppHapticsPlugin>('AppHaptics')
const native = Capacitor.isNativePlatform()

const WEB_PATTERNS: Record<HapticEvent, number | number[]> = {
  selection: 10,
  increment: 8,
  'toggle-on': 12,
  'toggle-off': 10,
  'drag-start': 18,
  'drag-end': 12,
  confirm: 28,
  error: [25, 45, 45],
  destructive: 60,
  'timer-finished': 3000,
}

export async function haptic(type: HapticEvent): Promise<boolean> {
  // The native exact alarm owns timer completion so it can fire while the phone is locked. Avoid a
  // second vibration when the foreground countdown notices the same completion.
  if (native && type === 'timer-finished') {
    return true
  }

  if (native) {
    try {
      const result = await AppHaptics.perform({ type: type as NativeHapticEvent })
      return result.performed
    } catch {
      // A web deploy can briefly reach an older installed APK without this native plugin. Silence is
      // preferable to bypassing the user's Android haptic setting with a raw vibrator fallback.
      return false
    }
  }

  return navigator.vibrate?.(WEB_PATTERNS[type]) ?? false
}
