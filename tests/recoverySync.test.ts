import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecoverySnapshot, isRecoverySnapshot } from '../src/recovery.ts'
import { missingRecoveryIds, pendingRecoveryUploads, preserveBeforeCloudReplacement } from '../src/recoverySync.ts'
import { timedCloudFetch } from '../src/cloudRequests.ts'

const snapshot = createRecoverySnapshot({ sessions: [{ id: 'workout' }] }, 'before-cloud-replace', { id: 'backup', now: 1 })
const isValidSnapshot = (value: unknown) => isRecoverySnapshot(value, () => true)

test('unchanged backup payloads do not download or upload again; pins still propagate', () => {
  assert.deepEqual(missingRecoveryIds([snapshot], [snapshot], []), [])
  assert.deepEqual(pendingRecoveryUploads([snapshot], [snapshot]), [])
  assert.deepEqual(missingRecoveryIds([], [snapshot], []), ['backup'])
  assert.deepEqual(missingRecoveryIds([], [snapshot], ['backup']), [])
  assert.equal(pendingRecoveryUploads([{ ...snapshot, retention: 'protected' }], [snapshot]).length, 1)
})

test('a committed device backup does not need a cloud fallback', async () => {
  await preserveBeforeCloudReplacement({ data: snapshot.data, saveLocal: async () => true,
    saveCloud: async () => { throw new Error('unexpected cloud write') }, readCloud: async () => [], isValidSnapshot })
})

test('full device storage can use a verified cloud backup', async () => {
  let uploaded = false
  await preserveBeforeCloudReplacement({ data: snapshot.data, saveLocal: async () => false,
    saveCloud: async () => { uploaded = true; return snapshot },
    readCloud: async id => { assert.equal(uploaded, true); assert.equal(id, snapshot.id); return [snapshot] }, isValidSnapshot })
})

test('failed, missing, or corrupted cloud backups block replacement', async () => {
  for (const values of [[], [{ ...snapshot, data: { sessions: ['corrupted'] } }], [{ ...snapshot, id: 'wrong-id' }]]) {
    await assert.rejects(preserveBeforeCloudReplacement({ data: snapshot.data, saveLocal: async () => false,
      saveCloud: async () => snapshot, readCloud: async () => values, isValidSnapshot }), /could not be verified/)
  }
  await assert.rejects(preserveBeforeCloudReplacement({ data: snapshot.data, saveLocal: async () => false,
    saveCloud: async () => { throw new Error('Cloud full') }, readCloud: async () => [], isValidSnapshot }), /Cloud full/)
})

test('the cloud deadline covers stalled response bodies as well as headers', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))) },
  }))
  try {
    await assert.rejects(timedCloudFetch('https://example.test', undefined, 10), /timed out/)
  } finally { globalThis.fetch = originalFetch }
})
