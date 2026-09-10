import assert from 'node:assert/strict'
import test from 'node:test'

let response: { saved?: boolean; cancelled?: boolean; bytes?: number } = {}
let failure: Error | null = null
let received: unknown
// Provide the same bridge metadata that Capacitor injects before the web bundle starts.
Object.assign(globalThis, {
  androidBridge: {},
  Capacitor: {
    PluginHeaders: [{ name: 'BackupFiles', methods: [{ name: 'save', rtype: 'promise' }] }],
    nativePromise: async (_plugin: string, _method: string, options: unknown) => {
      received = options
      if (failure) throw failure
      return response
    },
  },
})
const { saveBackupFile, backupByteLength } = await import('../src/backupFiles.ts')
const contents = '{"name":"Treniņš 💪","sessions":[]}'

test('native exports forward the full UTF-8 payload and require matching verified bytes', async () => {
  response = { saved: true, bytes: backupByteLength(contents) }
  assert.deepEqual(await saveBackupFile(contents, 'backup.json'), response)
  assert.deepEqual(received, { contents, filename: 'backup.json' })
  for (const bytes of [0, 1, backupByteLength(contents) - 1, backupByteLength(contents) + 1]) {
    response = { saved: true, bytes }
    await assert.rejects(saveBackupFile(contents, 'backup.json'), /could not be verified/)
  }
})

test('native cancellation is silent and legacy success does not invent verification', async () => {
  response = { cancelled: true }
  assert.deepEqual(await saveBackupFile(contents, 'backup.json'), { cancelled: true })
  response = { saved: true }
  assert.equal((await saveBackupFile(contents, 'backup.json')).bytes, undefined)
})

test('native write failure or missing success never falls back to a browser download', async () => {
  response = {}
  await assert.rejects(saveBackupFile(contents, 'backup.json'), /could not be verified/)
  failure = new Error('Provider write failed')
  try {
    await assert.rejects(saveBackupFile(contents, 'backup.json'), /could not be verified/)
  } finally {
    failure = null
  }
})
