import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Capacitor } from '@capacitor/core'
import {
  backupByteLength,
  backupFilename,
  MAX_BACKUP_BYTES,
  normalizeBackupContents,
  saveBackupFile,
} from '../src/backupFiles.ts'

test('backup filenames are stable and filesystem-safe', () => {
  assert.equal(backupFilename(new Date('2026-08-02T23:45:00Z')), 'fitness-hub-backup-2026-08-02.json')
})

test('empty or oversized exports fail before creating a download', async () => {
  await assert.rejects(saveBackupFile('', 'backup.json'), /empty or too large/)
  await assert.rejects(saveBackupFile('a'.repeat(MAX_BACKUP_BYTES + 1), 'backup.json'), /empty or too large/)
})

test('an Android shell without the file bridge never uses a blob download', async () => {
  const original = Capacitor.isNativePlatform
  Capacitor.isNativePlatform = () => true
  try {
    await assert.rejects(saveBackupFile('{"sessions":[]}', 'backup.json'), /Update the Android app/)
  } finally {
    Capacitor.isNativePlatform = original
  }
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
