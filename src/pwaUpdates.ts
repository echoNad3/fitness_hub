import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000
const MIN_UPDATE_CHECK_GAP_MS = 30 * 1000

let registration: ServiceWorkerRegistration | undefined
let lastUpdateCheck = 0

// Ask the browser for a fresh service-worker script. A changed worker activates immediately, but
// the visible app keeps running until the next real page load. Reloading the live React tree during
// a workout or foreground resume causes an avoidable full-screen jump and can lose transient UI.
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
    // `autoUpdate` normally reloads as soon as the new worker activates. Keep the current page
    // intact instead: the new worker already controls future loads, so the next cold start/manual
    // reload gets the update without interrupting the user or showing a fake loading screen.
    onNeedReload() {
      // Intentionally deferred until the next real page load.
    },
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
