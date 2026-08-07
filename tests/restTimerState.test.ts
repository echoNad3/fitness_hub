import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStoredRestTimer, restAlertDue } from '../src/restTimerState.ts'

test('a live rest timer can be restored after a reload', () => {
  assert.deepEqual(
    parseStoredRestTimer(JSON.stringify({ endsAt: 120_000, duration: 90 }), 100_000),
    { endsAt: 120_000, duration: 90 },
  )
})

test('expired or malformed rest timers are discarded', () => {
  assert.equal(parseStoredRestTimer(JSON.stringify({ endsAt: 100_000, duration: 90 }), 100_000), null)
  assert.equal(parseStoredRestTimer(JSON.stringify({ endsAt: 120_000, duration: -1 }), 100_000), null)
  assert.equal(parseStoredRestTimer(JSON.stringify({ endsAt: 120_000, duration: 100_000 }), 100_000), null)
  assert.equal(parseStoredRestTimer('not json', 100_000), null)
})

test('the rest alert starts once, when the timer reaches zero', () => {
  assert.equal(restAlertDue(3, false), false)
  assert.equal(restAlertDue(1, false), false)
  assert.equal(restAlertDue(0, false), true)
  assert.equal(restAlertDue(0, true), false)
})
