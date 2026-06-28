import { Capacitor } from '@capacitor/core'
import { RestAlarm } from './restAlarm'

export type RestNotificationResult = 'scheduled' | 'failed' | 'web'

// On the native Android app this schedules a heavy ~6s vibration (via an exact alarm) that fires
// even when the phone is locked. On the web/PWA it is a no-op — browsers can't run code while
// locked, so the visible in-app timer is the only alert there.
export async function scheduleRestNotification(endsAt: number): Promise<RestNotificationResult> {
  if (!Capacitor.isNativePlatform()) {
    return 'web'
  }

  try {
    if (endsAt <= Date.now()) {
      return 'failed'
    }
    await RestAlarm.cancel()
    const result = await RestAlarm.schedule({ at: endsAt })
    return result.scheduled ? 'scheduled' : 'failed'
  } catch {
    return 'failed'
  }
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
