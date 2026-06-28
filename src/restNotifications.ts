import { Capacitor } from '@capacitor/core'
import { RestAlarm } from './restAlarm'

export type RestNotificationStatus = 'scheduled' | 'failed' | 'outdated' | 'web'

export interface RestNotificationResult {
  status: RestNotificationStatus
  // A short, human-readable reason when something goes wrong — surfaced on screen so a real
  // device failure can be reported back instead of guessed at.
  detail?: string
}

// On the native Android app this schedules a heavy ~6s vibration (via an exact alarm) that fires
// even when the phone is locked. On the web/PWA it is a no-op — browsers can't run code while
// locked, so the visible in-app timer is the only alert there.
export async function scheduleRestNotification(endsAt: number): Promise<RestNotificationResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'web' }
  }

  try {
    if (endsAt <= Date.now()) {
      return { status: 'failed', detail: 'rest end time already passed' }
    }
    await RestAlarm.cancel()
    const result = await RestAlarm.schedule({ at: endsAt })
    if (result.scheduled) {
      return { status: 'scheduled' }
    }
    return { status: 'failed', detail: 'alarm not scheduled' }
  } catch (error) {
    // Capacitor throws an UNIMPLEMENTED error when the native RestAlarm plugin isn't in the
    // installed APK. The web layer auto-updates on every deploy, but native code only ships
    // when the APK itself is reinstalled — so this means the user is on an outdated APK.
    if (isUnimplemented(error)) {
      return { status: 'outdated' }
    }
    return { status: 'failed', detail: describeError(error) }
  }
}

function isUnimplemented(error: unknown): boolean {
  const code = readField(error, 'code')
  const message = readField(error, 'message')
  return (
    code === 'UNIMPLEMENTED' ||
    (typeof message === 'string' && message.toLowerCase().includes('not implemented'))
  )
}

function describeError(error: unknown): string {
  const code = readField(error, 'code')
  const message = readField(error, 'message')
  const parts = [code, message].filter((part): part is string => typeof part === 'string' && part.length > 0)
  if (parts.length > 0) {
    return parts.join(': ')
  }
  return String(error)
}

function readField(error: unknown, field: string): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  return (error as Record<string, unknown>)[field]
}

export async function cancelRestNotification() {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  try {
    await RestAlarm.cancel()
  } catch {
    // The visible timer still works if the native cancellation is unavailable.
  }
}
