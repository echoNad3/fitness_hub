import { Capacitor, registerPlugin } from '@capacitor/core'
import { RestAlarm } from './restAlarm'

// One semantic haptic service for the whole app. Callers report the completed interaction; this
// module owns the platform effect. Navigation, opening/closing UI, typing, scrolling, and generic
// presses never call it.
type InteractionHaptic = 'selection' | 'confirm' | 'reject' | 'drag-start' | 'drag-drop'

interface AppHapticsPlugin {
  perform(options: { type: InteractionHaptic }): Promise<{ performed: boolean }>
}

const AppHaptics = registerPlugin<AppHapticsPlugin>('AppHaptics')
const native = Capacitor.isNativePlatform()

const WEB_PATTERNS: Record<InteractionHaptic, number | number[]> = {
  selection: 10,
  confirm: 28,
  reject: [25, 45, 45],
  'drag-start': 18,
  'drag-drop': 12,
}

// One continuous 5s vibration at the timer's end. Keep this in sync with RestVibrationReceiver so
// the web preview matches the native alert.
const WEB_TIMER_PATTERN = [5000]

async function interaction(type: InteractionHaptic): Promise<boolean> {
  if (native) {
    try {
      const result = await AppHaptics.perform({ type })
      return result.performed
    } catch {
      // A web deploy can briefly reach an older installed APK without this native plugin. Silence is
      // preferable to bypassing the user's Android Touch feedback setting with raw vibration.
      return false
    }
  }

  return navigator.vibrate?.(WEB_PATTERNS[type]) ?? false
}

export const haptics = {
  selection: () => interaction('selection'),
  confirm: () => interaction('confirm'),
  reject: () => interaction('reject'),
  dragStart: () => interaction('drag-start'),
  dragDrop: () => interaction('drag-drop'),
  timerFinished: async (preview = false): Promise<boolean> => {
    // The native exact alarm owns real completion so it can fire once while the phone is locked.
    // Settings explicitly asks the native plugin to play that exact waveform immediately.
    if (native) {
      if (!preview) {
        return true
      }
      try {
        const result = await RestAlarm.preview()
        return result.performed
      } catch {
        return false
      }
    }

    return navigator.vibrate?.(WEB_TIMER_PATTERN) ?? false
  },
  // Cancels an in-progress web waveform. Native cancellation is owned by cancelRestNotification(),
  // which also removes the exact alarm before it fires.
  cancelTimerAlert: () => {
    if (!native) navigator.vibrate?.(0)
  },
}
