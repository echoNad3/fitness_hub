import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// Purposeful haptics only — selection ticks and confirmations, never on routine taps. On the web
// the Vibration API is a weaker fallback (and absent on iOS), so failures are swallowed silently.
const native = Capacitor.isNativePlatform()

// Light tick for selection changes (variant swap, preset, muscle pick, reorder drop).
export function hapticTick() {
  if (native) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
  } else {
    navigator.vibrate?.(8)
  }
}

// Firmer confirmation for meaningful state changes (Done/Failed, rest start/cancel).
export function hapticConfirm() {
  if (native) {
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined)
  } else {
    navigator.vibrate?.(18)
  }
}
