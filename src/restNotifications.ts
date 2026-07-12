import { Capacitor } from '@capacitor/core'
import { RestAlarm } from './restAlarm'

export type RestNotificationStatus = 'scheduled' | 'failed' | 'outdated' | 'web'

export interface RestNotificationResult {
  status: RestNotificationStatus
  // A short, human-readable reason when something goes wrong — surfaced on screen so a real
  // device failure can be reported back instead of guessed at.
  detail?: string
}

// On the native Android app this schedules the rest alert (via an exact alarm) that fires even
// when the phone is locked: a continuous 3s maximum vibration, plus an alarm tone through
// headphones when connected. The alarm, the countdown notification, and the in-app timer all use
// this one end timestamp, so they cannot drift apart. On the web/PWA it is a no-op — browsers
// can't run code while locked, so the visible in-app timer is the only alert there.
export async function scheduleRestNotification(endsAt: number): Promise<RestNotificationResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'web' }
  }

  try {
    if (endsAt <= Date.now()) {
      return { status: 'failed', detail: 'Rest time already ended.' }
    }
    await RestAlarm.cancel()
    // Capacitor's Android getDouble() reads Double/Integer/Float but NOT Long, and an epoch-ms
    // timestamp is too large for an int — so a whole number arrives as a Long and reads back as
    // null ("Missing 'at' timestamp"). Adding a fractional part forces the bridge to serialize it
    // as a Double; the native side truncates the fraction with longValue(), so the time is exact.
    const result = await RestAlarm.schedule({ at: endsAt + 0.5 })
    if (!result.exact) {
      return { status: 'failed', detail: 'Allow Alarms and reminders for Fitness Hub.' }
    }
    if (!result.notification) {
      return { status: 'failed', detail: 'Allow notifications to see the rest countdown.' }
    }
    if (result.scheduled) {
      return { status: 'scheduled' }
    }
    return { status: 'failed', detail: 'Rest alert was not scheduled.' }
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
