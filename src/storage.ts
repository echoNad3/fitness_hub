// localStorage wrappers that never throw. Storage can be blocked (private mode, disabled cookies)
// or full (quota), and a thrown read/write must not crash the app — there is no error boundary.
// On failure the app simply runs without persistence for that operation.

export function getStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable or full — keep running without persisting.
  }
}
