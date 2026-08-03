import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  backupByteLength,
  backupFilename,
  MAX_BACKUP_BYTES,
  normalizeBackupContents,
} from '../src/backupFiles.ts'

test('backup filenames are stable and filesystem-safe', () => {
  assert.equal(backupFilename(new Date('2026-08-02T23:45:00Z')), 'fitness-hub-backup-2026-08-02.json')
})

test('backup size checks use UTF-8 bytes and imports tolerate a BOM', () => {
  assert.equal(backupByteLength('gym'), 3)
  assert.equal(backupByteLength('ā'), 2)
  assert.equal(normalizeBackupContents('\ufeff{"sessions":[]}'), '{"sessions":[]}')
  assert.equal(normalizeBackupContents('{"sessions":[]}'), '{"sessions":[]}')
  assert.equal(MAX_BACKUP_BYTES, 10 * 1024 * 1024)
})

test('Android registers a bounded system-document backup bridge', async () => {
  const [activity, plugin] = await Promise.all([
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/MainActivity.java', 'utf8'),
    readFile('android/app/src/main/java/com/echonad3/fitnesshub/BackupFilesPlugin.java', 'utf8'),
  ])

  assert.match(activity, /registerPlugin\(BackupFilesPlugin\.class\)/)
  assert.match(plugin, /Intent\.ACTION_CREATE_DOCUMENT/)
  assert.match(plugin, /Intent\.ACTION_OPEN_DOCUMENT/)
  assert.match(plugin, /MAX_BACKUP_BYTES/)
  assert.match(plugin, /total > MAX_BACKUP_BYTES/)
  assert.match(plugin, /StandardCharsets\.UTF_8/)
})
