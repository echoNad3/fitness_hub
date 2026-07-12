// localStorage wrappers that never throw. Storage can be blocked (private mode, disabled cookies)
// or full (quota), and a thrown read/write must not crash the app. Writes report whether they
// succeeded so important data can surface a warning instead of silently pretending it was saved.

export function getStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}
