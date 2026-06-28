import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const REST_NOTIFICATION_ID = 9001

export type RestNotificationResult = 'scheduled' | 'denied' | 'failed' | 'web'

export async function scheduleRestNotification(endsAt: number): Promise<RestNotificationResult> {
  if (!Capacitor.isNativePlatform()) {
    return 'web'
  }

  try {
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions()
    }
    if (permission.display !== 'granted') {
      return 'denied'
    }

    await cancelRestNotification()
    if (endsAt <= Date.now()) {
      return 'failed'
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: 'Rest complete',
          body: 'Time for your next set.',
          schedule: {
            at: new Date(endsAt),
            allowWhileIdle: true,
          },
          autoCancel: true,
        },
      ],
    })
    return 'scheduled'
  } catch {
    return 'failed'
  }
}

export async function cancelRestNotification() {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] })
  } catch {
    // The visible timer still works if the native cancellation API is unavailable.
  }
}
