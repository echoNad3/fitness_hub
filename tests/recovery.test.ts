import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  MAX_AUTOMATIC_RECOVERY_COPIES,
  RECOVERY_REASONS,
  addRecoverySnapshot,
  automaticRecoveryDue,
  createRecoverySnapshot,
  deleteRecoverySnapshot,
  emptyRecoveryStore,
  mergeRecoverySnapshots,
  normalizeRecoverySnapshots,
  parseRecoveryStore,
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
})
