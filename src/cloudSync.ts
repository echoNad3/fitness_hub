export type SyncDirection = 'pull' | 'push'

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
  return remoteUpdatedAt !== null && remoteUpdatedAt > localUpdatedAt ? 'pull' : 'push'
}

export function hasMeaningfulLocalData(current: ComparableAppData, initial: ComparableAppData) {
  return (
    current.sessions.length > 0 ||
    current.restSeconds !== initial.restSeconds ||
    JSON.stringify(current.templates) !== JSON.stringify(initial.templates) ||
    JSON.stringify(current.baselineResults) !== JSON.stringify(initial.baselineResults)
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
