import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000
const MIN_UPDATE_CHECK_GAP_MS = 30 * 1000
const MANUAL_UPDATE_TIMEOUT_MS = 15 * 1000

let registration: ServiceWorkerRegistration | undefined
let lastUpdateCheck = 0
// Keep the worker that supplied this page, even after a background update takes control.
let pageController = navigator.serviceWorker?.controller

// A manual pull must wait for precaching AND activation before reloading. update() alone only
// checks the worker script; reloading immediately can serve the same old cached HTML again.
export async function prepareAppUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return false

  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), MANUAL_UPDATE_TIMEOUT_MS)
  const expired = new Promise<false>((resolve) => {
    abort.signal.addEventListener('abort', () => resolve(false), { once: true })
  })
  try {
    return await Promise.race([
      (async () => {
        const current = registration ?? await navigator.serviceWorker.getRegistration()
        if (!current || abort.signal.aborted) return false

        lastUpdateCheck = Date.now()
        await current.update()
        if (abort.signal.aborted) return false

        const worker = current.installing ?? current.waiting ?? current.active
        if (!worker) return false
        const activated = await new Promise<boolean>((resolve) => {
          const finish = (ready: boolean) => {
            worker.removeEventListener('statechange', changed)
            abort.signal.removeEventListener('abort', cancelled)
            resolve(ready)
          }
          const changed = () => {
            if (worker.state === 'activated') finish(true)
            else if (worker.state === 'redundant') finish(false)
          }
          const cancelled = () => finish(false)
          worker.addEventListener('statechange', changed)
          abort.signal.addEventListener('abort', cancelled, { once: true })
          changed()
        })
        return activated && Boolean(pageController && worker !== pageController)
      })(),
      expired,
    ])
  } catch {
    // A failed/offline update leaves the working page and its saved data intact.
    return false
  } finally {
    window.clearTimeout(timeout)
    abort.abort()
  }
}

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

  // The first visit has no controller yet. Treat its initial installation as this page's version.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pageController ??= navigator.serviceWorker.controller
  })

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
