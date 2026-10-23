import { getRecoveryStoreRaw, initializeRecoveryStorage, persistRecoveryStoreValue } from './recoveryStorage.ts'

export const RECOVERY_STORAGE_KEY = 'fitness-hub-recovery-v1'
export const MAX_AUTOMATIC_RECOVERY_COPIES = 3
export const MAX_RECOVERY_COPY_BYTES = 10 * 1024 * 1024
export const MAX_ROLLING_RECOVERY_COPIES = 20
export const MAX_ROLLING_RECOVERY_BYTES = 20 * 1024 * 1024

export const RECOVERY_REASONS = [
  'automatic',
  'manual',
  'before-workout-edit',
  'before-workout-delete',
  'before-program-change',
  'before-import',
  'before-reset',
  'before-restore',
  'before-cloud-replace',
] as const

export type RecoveryReason = (typeof RECOVERY_REASONS)[number]

export type RecoverySnapshot = {
  id: string
  createdAt: number
  reason: RecoveryReason
  hash: string
  data: unknown
  // Missing on older copies, which keep their original protected-until-deleted promise.
  retention?: 'rolling' | 'protected'
}

export type RecoveryStore = {
  copies: RecoverySnapshot[]
  deletedIds: string[]
}

const RECOVERY_REASON_SET = new Set<RecoveryReason>(RECOVERY_REASONS)
const copyInfo = new WeakMap<RecoverySnapshot, { hash: string; serialized: string; bytes: number }>()

export const emptyRecoveryStore = (): RecoveryStore => ({ copies: [], deletedIds: [] })

export function recoveryReasonLabel(reason: RecoveryReason) {
  const labels: Record<RecoveryReason, string> = {
    automatic: 'Automatic copy',
    manual: 'Manual copy',
    'before-workout-edit': 'Before workout edit',
    'before-workout-delete': 'Before workout deletion',
    'before-program-change': 'Before program change',
    'before-import': 'Before backup import',
    'before-reset': 'Before data reset',
    'before-restore': 'Before recovery restore',
    'before-cloud-replace': 'Before cloud replacement',
  }
  return labels[reason]
}

export function isProtectedRecoveryReason(reason: RecoveryReason) {
  return reason !== 'automatic'
}

export function isProtectedRecoveryCopy(copy: Pick<RecoverySnapshot, 'reason' | 'retention'>) {
  return copy.reason === 'manual' || (copy.retention ?? (copy.reason === 'automatic' ? 'rolling' : 'protected')) === 'protected'
}

export function canonicalRecoveryJson(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
    return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  })
  if (serialized === undefined) throw new Error('Workout data could not be copied.')
  return serialized
}

function serializedByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function fingerprint(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${value.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function recoveryDataHash(data: unknown) {
  const serialized = canonicalRecoveryJson(data)
  const bytes = serializedByteLength(serialized)
  if (bytes > MAX_RECOVERY_COPY_BYTES) {
    throw new Error('Workout data is too large for a recovery copy.')
  }
  return { hash: `v2:${fingerprint(serialized)}`, serialized, bytes }
}

function info(copy: RecoverySnapshot) {
  let value = copyInfo.get(copy)
  if (!value) { value = recoveryDataHash(copy.data); copyInfo.set(copy, value) }
  return value
}

function sameData(first: RecoverySnapshot, second: RecoverySnapshot) {
  const a = info(first)
  const b = info(second)
  return a.hash === b.hash && a.serialized === b.serialized
}

export function createRecoverySnapshot(
  data: unknown,
  reason: RecoveryReason,
  options: { id: string; now: number; retention?: 'rolling' | 'protected' },
): RecoverySnapshot {
  const details = recoveryDataHash(data)
  const { hash, serialized } = details

  const snapshot: RecoverySnapshot = {
    id: options.id,
    createdAt: options.now,
    reason,
    hash,
    data: JSON.parse(serialized) as unknown,
    retention: reason === 'manual' ? 'protected' : options.retention ??
      (['before-import', 'before-reset', 'before-restore'].includes(reason) ? 'protected' : 'rolling'),
  }
  copyInfo.set(snapshot, details)
  return snapshot
}

function uniqueIds(ids: string[]) {
  // A deletion record must outlive every offline device that could still hold the old copy.
  // Truncating this list can resurrect an older cloud copy, so tombstones are intentionally kept.
  return [...new Set(ids.filter((id) => id.trim().length > 0))]
}

function keepNewest(copies: RecoverySnapshot[]) {
  const byId = new Map<string, RecoverySnapshot>()
  for (const copy of copies) {
    const current = byId.get(copy.id)
    if (!current || copy.createdAt > current.createdAt) byId.set(copy.id, copy)
  }
  const sorted = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const automaticIds = new Set(
    sorted
      .filter((copy) => copy.reason === 'automatic' && !isProtectedRecoveryCopy(copy))
      .slice(0, MAX_AUTOMATIC_RECOVERY_COPIES)
      .map((copy) => copy.id),
  )
  let rollingCount = 0
  let rollingBytes = 0
  const kept = sorted.filter((copy) => {
    if (isProtectedRecoveryCopy(copy)) return true
    if (copy.reason === 'automatic' && !automaticIds.has(copy.id)) return false
    const bytes = info(copy).bytes
    if (rollingCount >= MAX_ROLLING_RECOVERY_COPIES || rollingBytes + bytes > MAX_ROLLING_RECOVERY_BYTES) return false
    rollingCount += 1
    rollingBytes += bytes
    return true
  })
  const keptIds = new Set(kept.map((copy) => copy.id))
  return {
    copies: kept,
    prunedIds: sorted.filter((copy) => !keptIds.has(copy.id)).map((copy) => copy.id),
  }
}

export function addRecoverySnapshot(store: RecoveryStore, snapshot: RecoverySnapshot) {
  const latest = store.copies[0]
  // Retention must preserve the backup being created even if the phone clock moved backwards.
  if (latest && snapshot.createdAt <= latest.createdAt) {
    const details = info(snapshot)
    snapshot = { ...snapshot, createdAt: latest.createdAt + 1 }
    copyInfo.set(snapshot, details)
  }
  if (latest && sameData(latest, snapshot)) {
    if (isProtectedRecoveryCopy(snapshot) && !isProtectedRecoveryCopy(latest)) {
      const kept = keepNewest([snapshot, ...store.copies.slice(1)])
      return {
        created: true,
        store: {
          copies: kept.copies,
          deletedIds: uniqueIds([...store.deletedIds, latest.id, ...kept.prunedIds]),
        },
      }
    }
    return { store, created: false }
  }

  // Rechecking an older account state should reuse its durable copy, not create another full backup.
  if (store.copies.some((copy) =>
    (!isProtectedRecoveryCopy(snapshot) || isProtectedRecoveryCopy(copy)) &&
    sameData(copy, snapshot),
  )) return { store, created: false }

  const kept = keepNewest([snapshot, ...store.copies])
  return {
    created: true,
    store: {
      copies: kept.copies,
      deletedIds: uniqueIds([...store.deletedIds, ...kept.prunedIds]),
    },
  }
}

export function deleteRecoverySnapshot(store: RecoveryStore, id: string): RecoveryStore {
  return {
    copies: store.copies.filter((copy) => copy.id !== id),
    deletedIds: uniqueIds([...store.deletedIds, id]),
  }
}

export function mergeRecoverySnapshots(
  localCopies: RecoverySnapshot[],
  remoteCopies: RecoverySnapshot[],
  deletedIds: string[],
) {
  const deleted = new Set(deletedIds)
  const kept = keepNewest([...remoteCopies, ...localCopies].filter((copy) => !deleted.has(copy.id)))
  return {
    copies: kept.copies,
    prunedIds: kept.prunedIds,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isRecoverySnapshot(
  value: unknown,
  isValidData: (data: unknown) => boolean,
): value is RecoverySnapshot {
  if (!isRecord(value)) return false
  const structurallyValid = (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    value.createdAt > 0 &&
    typeof value.reason === 'string' &&
    RECOVERY_REASON_SET.has(value.reason as RecoveryReason) &&
    typeof value.hash === 'string' &&
    value.hash.length > 0 &&
    (value.retention === undefined || value.retention === 'rolling' || value.retention === 'protected') &&
    isValidData(value.data)
  )
  if (!structurallyValid) return false

  try {
    const details = recoveryDataHash(value.data)
    const valid = details.hash === value.hash || fingerprint(JSON.stringify(value.data)) === value.hash
    if (valid) copyInfo.set(value as RecoverySnapshot, details)
    return valid
  } catch {
    return false
  }
}

export function normalizeRecoverySnapshots(
  value: unknown,
  isValidData: (data: unknown) => boolean,
) {
  if (!Array.isArray(value)) return []
  return keepNewest(value.filter((copy) => isRecoverySnapshot(copy, isValidData))).copies
}

export function parseRecoveryStore(
  raw: string | null,
  isValidData: (data: unknown) => boolean,
): RecoveryStore {
  if (!raw) return emptyRecoveryStore()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyRecoveryStore()
    const kept = keepNewest(Array.isArray(parsed.copies)
      ? parsed.copies.filter(copy => isRecoverySnapshot(copy, isValidData)) : [])
    const deletedIds = Array.isArray(parsed.deletedIds)
      ? uniqueIds(parsed.deletedIds.filter((id): id is string => typeof id === 'string'))
      : []
    const allDeletedIds = uniqueIds([...deletedIds, ...kept.prunedIds])
    return { copies: kept.copies.filter((copy) => !allDeletedIds.includes(copy.id)), deletedIds: allDeletedIds }
  } catch {
    return emptyRecoveryStore()
  }
}

export function loadRecoveryStore(isValidData: (data: unknown) => boolean) {
  return parseRecoveryStore(getRecoveryStoreRaw(), isValidData)
}

export function initializeRecoveryStore(isValidData: (data: unknown) => boolean) {
  return initializeRecoveryStorage((currentRaw, legacyRaw) => {
    const current = parseRecoveryStore(currentRaw, isValidData)
    const legacy = parseRecoveryStore(legacyRaw, isValidData)
    const deletedIds = uniqueIds([...current.deletedIds, ...legacy.deletedIds])
    const merged = mergeRecoverySnapshots(current.copies, legacy.copies, deletedIds)
    return JSON.stringify({
      copies: merged.copies,
      deletedIds: uniqueIds([...deletedIds, ...merged.prunedIds]),
    })
  })
}

export function persistRecoveryStore(store: RecoveryStore) {
  return persistRecoveryStoreValue(store)
}

export function automaticRecoveryDue(copies: RecoverySnapshot[], now: number) {
  const today = new Date(now).toDateString()
  return !copies.some(
    (copy) => copy.reason === 'automatic' && new Date(copy.createdAt).toDateString() === today,
  )
}
