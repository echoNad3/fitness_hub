export type SyncDirection = 'pull' | 'push' | 'none'

type ComparableAppData = {
  sessions: unknown[]
  templates: unknown
  baselineResults: unknown
  restSeconds: number
}

export function parseCloudTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function chooseSyncDirection(remoteUpdatedAt: number | null, localUpdatedAt: number): SyncDirection {
  if (remoteUpdatedAt === null) {
    return 'push'
  }
  if (remoteUpdatedAt > localUpdatedAt) {
    return 'pull'
  }
  return remoteUpdatedAt < localUpdatedAt ? 'push' : 'none'
}

export function hasMeaningfulLocalData(current: ComparableAppData, initial: ComparableAppData) {
  return (
    current.sessions.length > 0 ||
    current.restSeconds !== initial.restSeconds ||
    JSON.stringify(current.templates) !== JSON.stringify(initial.templates) ||
    JSON.stringify(current.baselineResults) !== JSON.stringify(initial.baselineResults)
  )
}

// The slices of AppData that matter for cross-device sync. UI bookkeeping (scroll positions,
// which exercise is expanded) deliberately isn't here: it changes constantly while the user just
// reads the screen, and letting it advance the sync timestamp would upload the whole data blob on
// every scroll — and could let a device that merely scrolled win last-write-wins over another
// device's real edits.
type SyncedSlices = {
  sessions: unknown
  templates: unknown
  variantPrefs: unknown
  baselineResults: unknown
  currentSessionByWorkout: unknown
  restSeconds: number
}

// Reference comparison is enough: the app updates state immutably, so an untouched slice keeps its
// identity while a real edit always produces a new object.
export function isMeaningfulChange(previous: SyncedSlices, next: SyncedSlices) {
  return (
    previous.sessions !== next.sessions ||
    previous.templates !== next.templates ||
    previous.variantPrefs !== next.variantPrefs ||
    previous.baselineResults !== next.baselineResults ||
    previous.currentSessionByWorkout !== next.currentSessionByWorkout ||
    previous.restSeconds !== next.restSeconds
  )
}

export function initialLocalTimestamp(storedValue: string | null, hasMeaningfulData: boolean, now: number) {
  const stored = Number(storedValue)
  if (Number.isFinite(stored) && stored > 0) {
    return stored
  }

  return hasMeaningfulData ? now : 0
}

export function nextLocalTimestamp(previous: number, now: number) {
  return Math.max(now, previous + 1)
}
