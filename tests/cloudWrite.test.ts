import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CloudWriteConflictError,
  saveNewestCloudState,
  type CloudInsertResult,
} from '../src/cloudWrite.ts'

function writer(options: {
  updates: boolean[]
  insert: CloudInsertResult
  remoteUpdatedAt?: number | null
}) {
  let updateCalls = 0
  let insertCalls = 0
  let readCalls = 0
  return {
    adapter: {
      updateIfOlder: async () => options.updates[updateCalls++] ?? false,
      insert: async () => {
        insertCalls += 1
        return options.insert
      },
      readUpdatedAt: async () => {
        readCalls += 1
        return options.remoteUpdatedAt ?? null
      },
    },
    calls: () => ({ updateCalls, insertCalls, readCalls }),
  }
}

test('an older cloud row is replaced through one atomic guarded update', async () => {
  const fake = writer({ updates: [true], insert: 'conflict' })
  await saveNewestCloudState(fake.adapter, 200)
  assert.deepEqual(fake.calls(), { updateCalls: 1, insertCalls: 0, readCalls: 0 })
})

test('the first cloud row is inserted without an unconditional upsert', async () => {
  const fake = writer({ updates: [false], insert: 'inserted' })
  await saveNewestCloudState(fake.adapter, 200)
  assert.deepEqual(fake.calls(), { updateCalls: 1, insertCalls: 1, readCalls: 0 })
})

test('an insert race retries the guarded update so the newer write wins', async () => {
  const fake = writer({ updates: [false, true], insert: 'conflict' })
  await saveNewestCloudState(fake.adapter, 200)
  assert.deepEqual(fake.calls(), { updateCalls: 2, insertCalls: 1, readCalls: 0 })
})

test('a stale device cannot replace a newer cloud row', async () => {
  const fake = writer({ updates: [false, false], insert: 'conflict', remoteUpdatedAt: 300 })
  await assert.rejects(() => saveNewestCloudState(fake.adapter, 200), CloudWriteConflictError)
  assert.deepEqual(fake.calls(), { updateCalls: 2, insertCalls: 1, readCalls: 1 })
})
