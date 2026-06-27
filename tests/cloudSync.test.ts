import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chooseSyncDirection,
  hasMeaningfulLocalData,
  initialLocalTimestamp,
  parseCloudTimestamp,
} from '../src/cloudSync.ts'

test('cloud timestamps parse safely', () => {
  assert.equal(parseCloudTimestamp('2026-06-27T18:00:00.000Z'), Date.parse('2026-06-27T18:00:00.000Z'))
  assert.equal(parseCloudTimestamp('not-a-date'), null)
  assert.equal(parseCloudTimestamp(null), null)
})

test('the newest copy wins on sign-in', () => {
  assert.equal(chooseSyncDirection(200, 100), 'pull')
  assert.equal(chooseSyncDirection(100, 200), 'push')
  assert.equal(chooseSyncDirection(200, 200), 'push')
  assert.equal(chooseSyncDirection(null, 100), 'push')
})

test('fresh devices do not overwrite meaningful remote data', () => {
  const initial = { sessions: [], templates: [{ id: 'a' }], baselineResults: {}, restSeconds: 90 }
  assert.equal(hasMeaningfulLocalData(initial, initial), false)
  assert.equal(initialLocalTimestamp(null, false, 500), 0)
})

test('existing local changes receive a migration timestamp', () => {
  const initial = { sessions: [], templates: [{ id: 'a' }], baselineResults: {}, restSeconds: 90 }
  const changed = { ...initial, sessions: [{ id: 'session' }] }
  assert.equal(hasMeaningfulLocalData(changed, initial), true)
  assert.equal(initialLocalTimestamp(null, true, 500), 500)
  assert.equal(initialLocalTimestamp('250', true, 500), 250)
})
