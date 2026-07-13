import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_RECOVERY_COPIES,
  addRecoverySnapshot,
  automaticRecoveryDue,
  createRecoverySnapshot,
  deleteRecoverySnapshot,
  emptyRecoveryStore,
  mergeRecoverySnapshots,
  normalizeRecoverySnapshots,
  parseRecoveryStore,
} from '../src/recovery.ts'

const validData = (value: unknown) =>
  Boolean(value) && typeof value === 'object' && Array.isArray((value as { sessions?: unknown }).sessions)

function copy(id: string, createdAt: number, sessions = createdAt) {
  return createRecoverySnapshot(
    { sessions: [{ id: sessions }] },
    'manual',
    { id, now: createdAt },
  )
}

test('recovery keeps only the three newest non-duplicate copies', () => {
  let store = emptyRecoveryStore()
  for (let index = 1; index <= 4; index += 1) {
    store = addRecoverySnapshot(store, copy(`copy-${index}`, index)).store
  }

  assert.equal(MAX_RECOVERY_COPIES, 3)
  assert.deepEqual(store.copies.map((entry) => entry.id), ['copy-4', 'copy-3', 'copy-2'])
  assert.deepEqual(store.deletedIds, ['copy-1'])

  const duplicate = createRecoverySnapshot(store.copies[0].data, 'manual', { id: 'duplicate', now: 5 })
  const result = addRecoverySnapshot(store, duplicate)
  assert.equal(result.created, false)
  assert.equal(result.store, store)
})

test('offline deletions stay deleted when cloud copies merge later', () => {
  const first = copy('first', 1)
  const second = copy('second', 2)
  const deleted = deleteRecoverySnapshot({ copies: [second, first], deletedIds: [] }, 'second')
  const merged = mergeRecoverySnapshots(deleted.copies, [second], deleted.deletedIds)

  assert.deepEqual(merged.copies.map((entry) => entry.id), ['first'])
})

test('newest local and cloud copies merge into one bounded list', () => {
  const merged = mergeRecoverySnapshots(
    [copy('local-new', 4), copy('shared', 2)],
    [copy('cloud-new', 5), copy('shared', 2), copy('cloud-old', 1)],
    [],
  )

  assert.deepEqual(merged.copies.map((entry) => entry.id), ['cloud-new', 'local-new', 'shared'])
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
