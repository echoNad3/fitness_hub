import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  MAX_AUTOMATIC_RECOVERY_COPIES,
  MAX_ROLLING_RECOVERY_COPIES,
  MAX_ROLLING_RECOVERY_BYTES,
  RECOVERY_REASONS,
  addRecoverySnapshot,
  automaticRecoveryDue,
  createRecoverySnapshot,
  deleteRecoverySnapshot,
  emptyRecoveryStore,
  mergeRecoverySnapshots,
  normalizeRecoverySnapshots,
  parseRecoveryStore,
  isRecoverySnapshot,
  isProtectedRecoveryCopy,
} from '../src/recovery.ts'

const recoverySql = await readFile('supabase/recovery_snapshots.sql', 'utf8')

const validData = (value: unknown) =>
  Boolean(value) && typeof value === 'object' && Array.isArray((value as { sessions?: unknown }).sessions)

function copy(
  id: string,
  createdAt: number,
  sessions = createdAt,
  reason: Parameters<typeof createRecoverySnapshot>[1] = 'manual',
) {
  return createRecoverySnapshot(
    { sessions: [{ id: sessions }] },
    reason,
    { id, now: createdAt },
  )
}

test('manual copies stay until they are explicitly deleted', () => {
  let store = emptyRecoveryStore()
  for (let index = 1; index <= 4; index += 1) {
    store = addRecoverySnapshot(store, copy(`copy-${index}`, index)).store
  }

  assert.deepEqual(store.copies.map((entry) => entry.id), ['copy-4', 'copy-3', 'copy-2', 'copy-1'])
  assert.deepEqual(store.deletedIds, [])

  const duplicate = createRecoverySnapshot(store.copies[0].data, 'manual', { id: 'duplicate', now: 5 })
  const result = addRecoverySnapshot(store, duplicate)
  assert.equal(result.created, false)
  assert.equal(result.store, store)
})

test('only automatic copies rotate out after the newest three', () => {
  let store = emptyRecoveryStore()
  store = addRecoverySnapshot(store, copy('manual', 1)).store
  for (let index = 2; index <= 5; index += 1) {
    store = addRecoverySnapshot(store, copy(`auto-${index}`, index, index, 'automatic')).store
  }

  assert.equal(MAX_AUTOMATIC_RECOVERY_COPIES, 3)
  assert.deepEqual(store.copies.map((entry) => entry.id), [
    'auto-5',
    'auto-4',
    'auto-3',
    'manual',
  ])
  assert.deepEqual(store.deletedIds, ['auto-2'])
})

test('a manual copy upgrades an identical automatic copy to protected', () => {
  const automatic = copy('automatic', 1, 1, 'automatic')
  const manual = copy('manual', 2, 1, 'manual')
  const result = addRecoverySnapshot({ copies: [automatic], deletedIds: [] }, manual)

  assert.equal(result.created, true)
  assert.deepEqual(result.store.copies.map((entry) => entry.id), ['manual'])
  assert.deepEqual(result.store.deletedIds, ['automatic'])
})

test('offline deletions stay deleted when cloud copies merge later', () => {
  const first = copy('first', 1)
  const second = copy('second', 2)
  const deleted = deleteRecoverySnapshot({ copies: [second, first], deletedIds: [] }, 'second')
  const merged = mergeRecoverySnapshots(deleted.copies, [second], deleted.deletedIds)

  assert.deepEqual(merged.copies.map((entry) => entry.id), ['first'])
})

test('offline deletion records are never truncated', () => {
  let store = emptyRecoveryStore()
  for (let index = 1; index <= 50; index += 1) {
    store = deleteRecoverySnapshot(store, `deleted-${index}`)
  }

  assert.equal(store.deletedIds.length, 50)
  assert.equal(store.deletedIds[0], 'deleted-1')
  assert.equal(store.deletedIds.at(-1), 'deleted-50')
})

test('local and cloud copies merge while only old automatic copies are pruned', () => {
  const merged = mergeRecoverySnapshots(
    [copy('local-new', 4), copy('shared', 2)],
    [
      copy('cloud-new', 6, 6, 'automatic'),
      copy('cloud-auto', 5, 5, 'automatic'),
      copy('cloud-auto-2', 3, 3, 'automatic'),
      copy('shared', 2),
      copy('cloud-old', 1, 1, 'automatic'),
    ],
    [],
  )

  assert.deepEqual(merged.copies.map((entry) => entry.id), [
    'cloud-new',
    'cloud-auto',
    'local-new',
    'cloud-auto-2',
    'shared',
  ])
  assert.deepEqual(merged.prunedIds, ['cloud-old'])
})

test('invalid local or cloud recovery data is ignored', () => {
  const valid = copy('valid', 1)
  const invalid = { ...valid, data: { sessions: 'broken' } }
  const corrupted = { ...valid, hash: 'wrong' }
  assert.deepEqual(normalizeRecoverySnapshots([invalid, corrupted, valid], validData), [valid])
  assert.deepEqual(parseRecoveryStore('{bad json', validData), emptyRecoveryStore())
})

test('only one automatic copy is due each local day', () => {
  const morning = new Date(2026, 6, 13, 8).getTime()
  const evening = new Date(2026, 6, 13, 20).getTime()
  const tomorrow = new Date(2026, 6, 14, 8).getTime()
  const automatic = createRecoverySnapshot({ sessions: [] }, 'automatic', { id: 'daily', now: morning })

  assert.equal(automaticRecoveryDue([], morning), true)
  assert.equal(automaticRecoveryDue([automatic], evening), false)
  assert.equal(automaticRecoveryDue([automatic], tomorrow), true)
})

test('Supabase accepts every client recovery reason', () => {
  for (const reason of RECOVERY_REASONS) {
    assert.equal(recoverySql.includes(`'${reason}'`), true, `Missing SQL recovery reason: ${reason}`)
  }
  assert.equal(recoverySql.includes('offset 20'), false)
  assert.equal(recoverySql.includes('create trigger trim_app_recovery_deletions_after_write'), false)
})

test('years of routine copies stay bounded while manual and legacy protected copies survive', () => {
  const legacy = copy('legacy', 1, 1, 'before-cloud-replace')
  delete legacy.retention
  let store = addRecoverySnapshot(emptyRecoveryStore(), legacy).store
  store = addRecoverySnapshot(store, copy('manual', 2)).store
  for (let index = 3; index < 2003; index++) {
    store = addRecoverySnapshot(store, copy(`routine-${index}`, index, index, 'before-workout-edit')).store
  }
  assert.equal(store.copies.filter(entry => !isProtectedRecoveryCopy(entry)).length, MAX_ROLLING_RECOVERY_COPIES)
  assert.equal(store.copies.some(entry => entry.id === 'legacy'), true)
  assert.equal(store.copies.some(entry => entry.id === 'manual'), true)
  assert.equal(store.deletedIds.length, 2000 - MAX_ROLLING_RECOVERY_COPIES)
})

test('large routine copies obey the byte budget and preserve the newest state', () => {
  let store = emptyRecoveryStore()
  for (let index = 1; index <= 4; index++) {
    store = addRecoverySnapshot(store, createRecoverySnapshot(
      { sessions: [index], padding: 'x'.repeat(7 * 1024 * 1024) },
      'before-cloud-replace', { id: `large-${index}`, now: index },
    )).store
  }
  assert.equal(store.copies.length, 2)
  assert.equal(store.copies[0].id, 'large-4')
  assert.ok(store.copies.reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.data)), 0) <= MAX_ROLLING_RECOVERY_BYTES)
  assert.deepEqual(store.deletedIds, ['large-1', 'large-2'])
})

test('cloud JSON key reordering preserves validation and deduplication', () => {
  const original = createRecoverySnapshot({ sessions: [{ id: 1, weight: 5 }], rest: 90 }, 'before-cloud-replace', { id: 'original', now: 1 })
  const reordered = { ...original, data: { rest: 90, sessions: [{ weight: 5, id: 1 }] } }
  assert.equal(isRecoverySnapshot(reordered, validData), true)
  const second = copy('different-state', 2, 2, 'before-cloud-replace')
  const duplicate = createRecoverySnapshot(reordered.data, 'before-cloud-replace', { id: 'repeat', now: 3 })
  const result = addRecoverySnapshot({ copies: [second, original], deletedIds: [] }, duplicate)
  assert.equal(result.created, false)
})

test('startup rotation retains deletion records instead of allowing old copies to return', () => {
  const copies = Array.from({ length: 25 }, (_, index) => copy(`copy-${index}`, index + 1, index, 'before-cloud-replace'))
  const store = parseRecoveryStore(JSON.stringify({ copies, deletedIds: ['deleted-offline'] }), validData)
  assert.equal(store.copies.length, 20)
  assert.equal(store.deletedIds.length, 6)
  assert.equal(store.deletedIds.includes('copy-0'), true)
})

test('a backwards phone clock cannot rotate away the backup being created', () => {
  let store = emptyRecoveryStore()
  for (let index = 1; index <= 20; index++) store = addRecoverySnapshot(store, copy(`copy-${index}`, index + 100, index, 'before-cloud-replace')).store
  store = addRecoverySnapshot(store, copy('newest-with-old-clock', 1, 999, 'before-cloud-replace')).store
  assert.equal(store.copies[0].id, 'newest-with-old-clock')
  assert.equal(store.copies.length, 20)
  assert.equal(store.deletedIds.includes('copy-1'), true)
})
