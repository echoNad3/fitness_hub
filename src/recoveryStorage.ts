import { getStored, removeStored, setStored } from './storage.ts'
import type { RecoverySnapshot, RecoveryStore } from './recovery.ts'

export const RECOVERY_DATABASE = 'fitness-hub-recovery'
export const LEGACY_RECOVERY_KEY = 'fitness-hub-recovery-v1'
const LEGACY_STORE = 'recovery'
const COPIES = 'copies'
const META = 'metadata'
const STORAGE_TIMEOUT_MS = 5_000

type StoredCopy = { id: string; encoding: 'gzip' | 'json'; payload: Blob; signature: string }
let database: IDBDatabase | null = null
let initialRaw: string | null = null
let currentStore: RecoveryStore | null = null
let legacyOnly = false
let records = new Map<string, StoredCopy>()
let lastDeletedIds = ''
let issue: 'full' | 'unavailable' | null = null

function recordIssue(error: unknown) {
  issue = error instanceof DOMException && error.name === 'QuotaExceededError' ? 'full' : 'unavailable'
}

function signature(copy: RecoverySnapshot) {
  return JSON.stringify([copy.id, copy.createdAt, copy.reason, copy.hash, copy.retention])
}

async function encode(copy: RecoverySnapshot): Promise<StoredCopy> {
  const raw = new Blob([JSON.stringify(copy)], { type: 'application/json' })
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    const compressed = await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob()
    if (compressed.size < raw.size) return { id: copy.id, signature: signature(copy), encoding: 'gzip', payload: compressed }
  }
  return { id: copy.id, signature: signature(copy), encoding: 'json', payload: raw }
}

async function decode(record: StoredCopy): Promise<RecoverySnapshot> {
  const raw = record.encoding === 'gzip'
    ? await new Response(record.payload.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : await record.payload.text()
  return JSON.parse(raw) as RecoverySnapshot
}

function commit(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { transaction.abort() } catch { /* already settled */ }
      reject(new Error('Recovery storage timed out.'))
    }, STORAGE_TIMEOUT_MS)
    transaction.oncomplete = () => { clearTimeout(timer); resolve() }
    transaction.onabort = () => { clearTimeout(timer); reject(transaction.error ?? new Error('Recovery save failed.')) }
  })
}

async function writeStore(store: RecoveryStore, clearLegacy = false) {
  const nextRecords = new Map<string, StoredCopy>()
  const changed: StoredCopy[] = []
  // Compress before opening the transaction: awaiting inside it can close it.
  for (const copy of store.copies) {
    const existing = records.get(copy.id)
    const record = existing && existing.signature === signature(copy) ? existing : await encode(copy)
    nextRecords.set(copy.id, record)
    if (record !== existing) changed.push(record)
  }
  const deleted = [...records.keys()].filter(id => !nextRecords.has(id))
  const deletedIds = JSON.stringify(store.deletedIds)
  if (!clearLegacy && !changed.length && !deleted.length && deletedIds === lastDeletedIds) return
  const transaction = database!.transaction(clearLegacy ? [COPIES, META, LEGACY_STORE] : [COPIES, META], 'readwrite', { durability: 'strict' })
  const completed = commit(transaction)
  try {
    const copies = transaction.objectStore(COPIES)
    for (const id of deleted) copies.delete(id)
    for (const record of changed) copies.put(record)
    transaction.objectStore(META).put(store.deletedIds, 'deletedIds')
    if (clearLegacy) transaction.objectStore(LEGACY_STORE).delete('store')
  } catch (error) {
    transaction.abort()
    await completed.catch(() => undefined)
    throw error
  }
  await completed
  records = nextRecords
  lastDeletedIds = deletedIds
}

// Read/migrate before App or auth starts. Old copies survive until the replacement commits.
export async function initializeRecoveryStorage(merge: (current: string, legacy: string) => string) {
  initialRaw = getStored(LEGACY_RECOVERY_KEY)
  legacyOnly = typeof indexedDB === 'undefined'
  if (legacyOnly) return
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(RECOVERY_DATABASE, 2)
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        reject(new Error('Recovery storage timed out.'))
      }, STORAGE_TIMEOUT_MS)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(LEGACY_STORE)) request.result.createObjectStore(LEGACY_STORE)
        if (!request.result.objectStoreNames.contains(COPIES)) request.result.createObjectStore(COPIES, { keyPath: 'id' })
        if (!request.result.objectStoreNames.contains(META)) request.result.createObjectStore(META)
      }
      request.onsuccess = () => {
        clearTimeout(timer)
        if (settled) request.result.close()
        else resolve(request.result)
      }
      request.onerror = request.onblocked = () => {
        clearTimeout(timer)
        settled = true
        reject(request.error ?? new Error('Recovery storage is busy. Close other app tabs and retry.'))
      }
    })
    database.onversionchange = () => { database?.close(); database = null }
    const transaction = database.transaction([COPIES, META, LEGACY_STORE], 'readonly')
    const completed = commit(transaction)
    const copiesRequest = transaction.objectStore(COPIES).getAll()
    const deletedRequest = transaction.objectStore(META).get('deletedIds')
    const legacyRequest = transaction.objectStore(LEGACY_STORE).get('store')
    await completed
    records = new Map((copiesRequest.result as StoredCopy[]).map(record => [record.id, record]))
    const copies = await Promise.all([...records.values()].map(decode))
    const deletedIds = Array.isArray(deletedRequest.result) ? deletedRequest.result as string[] : []
    lastDeletedIds = JSON.stringify(deletedIds)
    let raw = JSON.stringify({ copies, deletedIds })
    if (typeof legacyRequest.result === 'string') raw = merge(raw, legacyRequest.result)
    if (initialRaw !== null) raw = merge(raw, initialRaw)
    // Validate decoded payloads and retain tombstones for rotated copies.
    raw = merge(raw, JSON.stringify({ copies: [], deletedIds: [] }))
    await writeStore(JSON.parse(raw) as RecoveryStore, true)
    currentStore = JSON.parse(raw) as RecoveryStore
    initialRaw = null
    removeStored(LEGACY_RECOVERY_KEY)
  } catch (error) {
    recordIssue(error)
    database?.close()
    database = null
    // Never overwrite an unreadable archive with an empty store.
  }
}

export function getRecoveryStoreRaw() {
  return currentStore ? JSON.stringify(currentStore) : initialRaw ?? getStored(LEGACY_RECOVERY_KEY)
}

export async function persistRecoveryStoreValue(store: RecoveryStore) {
  try {
    if (database) await writeStore(store)
    else if (!legacyOnly || !setStored(LEGACY_RECOVERY_KEY, JSON.stringify(store))) return false
    issue = null
    currentStore = store
    return true
  } catch (error) {
    recordIssue(error)
    return false
  }
}

export function recoveryStorageUsage() {
  return {
    available: database !== null || legacyOnly,
    issue,
    bytes: [...records.values()].reduce((total, record) => total + record.payload.size, 0),
  }
}
