import { getStored, removeStored, setStored } from './storage.ts'

const LEGACY_KEY = 'fitness-hub-v1'
const TIMESTAMP_KEY = 'fitness-hub-v1-updated-at'
const DATABASE = 'fitness-hub-workouts'
type Data = Record<string, unknown> & { sessions: Array<{ id: string }> }
type Snapshot = { data: Omit<Data, 'sessions'>; sessionIds: string[]; updatedAt: number }
let database: IDBDatabase | null = null
let raw: string | null = null
let current: Data | null = null
let sessions = new Map<string, Data['sessions'][number]>()
let legacyOnly = false
let loadedSafely = true
let writeQueue: Promise<unknown> = Promise.resolve()

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch { /* already settled */ }
      reject(new Error('Workout storage timed out.'))
    }, 5_000)
    transaction.oncomplete = () => { clearTimeout(timeout); resolve() }
    transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error ?? new Error('Workout save failed.')) }
  })
}

export async function initializeWorkoutStorage() {
  raw = getStored(LEGACY_KEY)
  legacyOnly = typeof indexedDB === 'undefined'
  if (legacyOnly) return
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1)
      let expired = false
      const timer = setTimeout(() => { expired = true; reject(new Error('Workout storage timed out.')) }, 5_000)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('sessions', { keyPath: 'id' })
        request.result.createObjectStore('state')
      }
      request.onsuccess = () => { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result) }
      request.onerror = request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('Workout storage is unavailable.')) }
    })
    database.onversionchange = () => { database?.close(); database = null }
    const transaction = database.transaction(['sessions', 'state'], 'readonly')
    const committed = complete(transaction)
    const saved = transaction.objectStore('state').get('snapshot')
    const legacy = transaction.objectStore('state').get('legacy')
    const legacyTimestamp = transaction.objectStore('state').get('legacyTimestamp')
    const savedSessions = transaction.objectStore('sessions').getAll()
    await committed
    const snapshot = saved.result as Snapshot | undefined
    const oldRaw = typeof legacy.result === 'string' ? legacy.result : null
    const savedTimestamp = oldRaw !== null ? Number(legacyTimestamp.result) || 0 : snapshot?.updatedAt ?? 0
    const localTimestamp = Math.max(0, Number(getStored(TIMESTAMP_KEY)) || 0)
    sessions = new Map((savedSessions.result as Data['sessions']).map(session => [session.id, session]))
    if (raw !== null && localTimestamp >= savedTimestamp) {
      // First checkpoint the original bytes. App then normalizes them into individual records.
      const migration = database.transaction('state', 'readwrite', { durability: 'strict' })
      const committed = complete(migration)
      migration.objectStore('state').put(raw, 'legacy')
      migration.objectStore('state').put(localTimestamp, 'legacyTimestamp')
      await committed
    } else if (oldRaw !== null) {
      raw = oldRaw
      setStored(TIMESTAMP_KEY, String(savedTimestamp))
    } else if (snapshot) {
      current = { ...snapshot.data, sessions: snapshot.sessionIds.flatMap(id => sessions.has(id) ? [sessions.get(id)!] : []) }
      raw = null
      setStored(TIMESTAMP_KEY, String(savedTimestamp))
    } else {
      // A newly created/cleared database must pull the account even if old sync metadata remains.
      setStored(TIMESTAMP_KEY, '0')
    }
    removeStored(LEGACY_KEY)
  } catch {
    database?.close()
    database = null
    // No account upload may use an empty placeholder when existing device data was unreadable.
    loadedSafely = raw !== null
  }
}

export function getWorkoutDataRaw() {
  return current ? JSON.stringify(current) : raw
}

export function workoutDataLoadedSafely() { return loadedSafely }
export function waitForWorkoutWrites() { return writeQueue }

export function persistWorkoutData(value: unknown, updatedAt: number): Promise<boolean> {
  const operation = writeQueue.then(async () => {
    if (!value || typeof value !== 'object' || !Array.isArray((value as Data).sessions)) return false
    const data = value as Data
    try {
      if (!database) {
        if (!legacyOnly || !setStored(LEGACY_KEY, JSON.stringify(data))) return false
      } else {
        const nextSessions = new Map(data.sessions.map(session => [session.id, session]))
        const transaction = database.transaction(['sessions', 'state'], 'readwrite', { durability: 'strict' })
        const committed = complete(transaction)
        try {
          const store = transaction.objectStore('sessions')
          for (const id of sessions.keys()) if (!nextSessions.has(id)) store.delete(id)
          for (const session of data.sessions) if (sessions.get(session.id) !== session) store.put(session)
          const { sessions: _sessions, ...metadata } = data
          transaction.objectStore('state').put({ data: metadata, sessionIds: data.sessions.map(session => session.id), updatedAt } satisfies Snapshot, 'snapshot')
          transaction.objectStore('state').delete('legacy')
          transaction.objectStore('state').delete('legacyTimestamp')
        } catch (error) {
          transaction.abort()
          await committed.catch(() => undefined)
          throw error
        }
        await committed
        sessions = nextSessions
      }
      current = data
      raw = null
      return true
    } catch { return false }
  })
  writeQueue = operation.catch(() => undefined)
  return operation
}
