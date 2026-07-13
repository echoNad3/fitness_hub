import { getStored, setStored } from './storage.ts'

export const RECOVERY_STORAGE_KEY = 'fitness-hub-recovery-v1'
export const MAX_RECOVERY_COPIES = 3
export const MAX_RECOVERY_COPY_BYTES = 10 * 1024 * 1024
const MAX_RECOVERY_TOMBSTONES = 20

export type RecoveryReason =
  | 'automatic'
  | 'manual'
  | 'before-workout-edit'
  | 'before-workout-delete'
  | 'before-import'
  | 'before-reset'
  | 'before-restore'
  | 'before-cloud-replace'

export type RecoverySnapshot = {
  id: string
  createdAt: number
  reason: RecoveryReason
  hash: string
  data: unknown
}

export type RecoveryStore = {
  copies: RecoverySnapshot[]
  deletedIds: string[]
}

const RECOVERY_REASONS = new Set<RecoveryReason>([
  'automatic',
  'manual',
  'before-workout-edit',
  'before-workout-delete',
  'before-import',
  'before-reset',
  'before-restore',
  'before-cloud-replace',
])

export const emptyRecoveryStore = (): RecoveryStore => ({ copies: [], deletedIds: [] })

export function recoveryReasonLabel(reason: RecoveryReason) {
  const labels: Record<RecoveryReason, string> = {
    automatic: 'Automatic safety copy',
    manual: 'Manual copy',
    'before-workout-edit': 'Before workout edit',
    'before-workout-delete': 'Before workout deletion',
    'before-import': 'Before backup import',
    'before-reset': 'Before data reset',
    'before-restore': 'Before recovery restore',
    'before-cloud-replace': 'Before cloud replacement',
  }
  return labels[reason]
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
  const serialized = JSON.stringify(data)
  if (serialized === undefined) throw new Error('Workout data could not be copied.')
  if (serializedByteLength(serialized) > MAX_RECOVERY_COPY_BYTES) {
    throw new Error('Workout data is too large for a recovery copy.')
  }
  return { hash: fingerprint(serialized), serialized }
}

export function createRecoverySnapshot(
  data: unknown,
  reason: RecoveryReason,
  options: { id: string; now: number },
): RecoverySnapshot {
  const { hash, serialized } = recoveryDataHash(data)

  return {
    id: options.id,
    createdAt: options.now,
    reason,
    hash,
    data: JSON.parse(serialized) as unknown,
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter((id) => id.trim().length > 0))].slice(-MAX_RECOVERY_TOMBSTONES)
}

function keepNewest(copies: RecoverySnapshot[]) {
  const byId = new Map<string, RecoverySnapshot>()
  for (const copy of copies) {
    const current = byId.get(copy.id)
    if (!current || copy.createdAt > current.createdAt) byId.set(copy.id, copy)
  }
  const sorted = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
  return {
    copies: sorted.slice(0, MAX_RECOVERY_COPIES),
    prunedIds: sorted.slice(MAX_RECOVERY_COPIES).map((copy) => copy.id),
  }
}

export function addRecoverySnapshot(store: RecoveryStore, snapshot: RecoverySnapshot) {
  if (store.copies[0]?.hash === snapshot.hash) {
    return { store, created: false }
  }

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
    RECOVERY_REASONS.has(value.reason as RecoveryReason) &&
    typeof value.hash === 'string' &&
    value.hash.length > 0 &&
    isValidData(value.data)
  )
  if (!structurallyValid) return false

  try {
    return recoveryDataHash(value.data).hash === value.hash
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
    const copies = normalizeRecoverySnapshots(parsed.copies, isValidData)
    const deletedIds = Array.isArray(parsed.deletedIds)
      ? uniqueIds(parsed.deletedIds.filter((id): id is string => typeof id === 'string'))
      : []
    return { copies: copies.filter((copy) => !deletedIds.includes(copy.id)), deletedIds }
  } catch {
    return emptyRecoveryStore()
  }
}

export function loadRecoveryStore(isValidData: (data: unknown) => boolean) {
  return parseRecoveryStore(getStored(RECOVERY_STORAGE_KEY), isValidData)
}

export function persistRecoveryStore(store: RecoveryStore) {
  return setStored(RECOVERY_STORAGE_KEY, JSON.stringify(store))
}

export function automaticRecoveryDue(copies: RecoverySnapshot[], now: number) {
  const today = new Date(now).toDateString()
  return !copies.some(
    (copy) => copy.reason === 'automatic' && new Date(copy.createdAt).toDateString() === today,
  )
}
