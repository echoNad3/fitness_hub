import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// One universal haptic ruleset so feedback feels the same everywhere in the app. There are exactly
// two tiers, and nothing picks its own strength/length outside of them:
//   • 'select'  — light tap. Every button/press: navigation, expand, steppers, chips, swaps, dialogs.
//   • 'confirm' — firmer tap. Meaningful state changes only: Done/Failed, rest start/cancel, saving or
//                 discarding edits, and destructive confirms (remove/delete/reset).
// On native these map to Light/Medium impacts; on the web the Vibration API is a weaker fallback
// (and absent on iOS), so failures are swallowed silently.
const native = Capacitor.isNativePlatform()

export type HapticTier = 'select' | 'confirm'

// Web fallback durations, deliberately short and distinct so the two tiers feel consistent.
const WEB_MS: Record<HapticTier, number> = { select: 10, confirm: 22 }

export function haptic(tier: HapticTier = 'select') {
  if (native) {
    const style = tier === 'confirm' ? ImpactStyle.Medium : ImpactStyle.Light
    void Haptics.impact({ style }).catch(() => undefined)
  } else {
    navigator.vibrate?.(WEB_MS[tier])
  }
}

// Named aliases kept for the few non-button call sites (drag start/drop, which are gesture events,
// not clicks, so the global button listener never sees them).
export function hapticTick() {
  haptic('select')
}

export function hapticConfirm() {
  haptic('confirm')
}

// Universal button feedback: one delegated listener gives every button the same light tap on press,
// so we don't have to remember to wire haptics into each onClick (that scattering is exactly what felt
// inconsistent). A button opts up to the firmer tier with data-haptic="confirm", or opts out entirely
// with data-haptic="none" (e.g. the drag handle, which fires its own tick when a drag actually starts).
// Fires on pointerdown for immediate, responsive feedback. Returns a cleanup function.
export function installGlobalHaptics(): () => void {
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null
    const el = target?.closest?.('button, [role="button"]') as HTMLElement | null
    if (!el) {
      return
    }
    if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) {
      return
    }
    const mode = el.getAttribute('data-haptic')
    if (mode === 'none') {
      return
    }
    haptic(mode === 'confirm' ? 'confirm' : 'select')
  }

  document.addEventListener('pointerdown', onPointerDown, { passive: true })
  return () => document.removeEventListener('pointerdown', onPointerDown)
}
