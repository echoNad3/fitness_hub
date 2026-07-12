import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000
const MIN_UPDATE_CHECK_GAP_MS = 30 * 1000

let registration: ServiceWorkerRegistration | undefined
let lastUpdateCheck = 0

// Ask the browser for a fresh service-worker script. With registerType=autoUpdate, a changed
// worker activates immediately and reloads the page once it controls this client.
export function checkForAppUpdate(force = false) {
  if (!registration || !navigator.onLine) {
    return
  }

  const now = Date.now()
  if (!force && now - lastUpdateCheck < MIN_UPDATE_CHECK_GAP_MS) {
    return
  }

  lastUpdateCheck = now
  void registration.update().catch(() => undefined)
}

export function registerAppUpdates() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_serviceWorkerUrl, activeRegistration) {
      registration = activeRegistration
      checkForAppUpdate(true)
    },
    onRegisterError() {
      // Offline/private-mode failures must never block the app. The next full load tries again.
    },
  })

  const checkWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      checkForAppUpdate()
    }
  }

  window.addEventListener('focus', checkWhenVisible)
  window.addEventListener('online', () => checkForAppUpdate(true))
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.setInterval(checkWhenVisible, UPDATE_CHECK_INTERVAL_MS)
}
