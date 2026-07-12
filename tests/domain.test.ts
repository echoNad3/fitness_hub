import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampRestValue,
  nextPendingId,
  restSecondsRemaining,
  resultGuidance,
  resultStreak,
  REST_STEP_SECONDS,
  toggleResult,
  WORKOUT_DURATION_STEP_SECONDS,
  workoutDurationSeconds,
} from '../src/domain.ts'

test('result buttons toggle, switch, and clear predictably', () => {
  assert.equal(toggleResult(undefined, 'success'), 'success')
  assert.equal(toggleResult('success', 'failure'), 'failure')
  assert.equal(toggleResult('failure', 'failure'), undefined)
})

test('result streak counts matching past attempts and resets when the result changes', () => {
  assert.deepEqual(resultStreak([], undefined), { result: undefined, count: 0 })
  assert.deepEqual(resultStreak(['failure'], undefined), { result: 'failure', count: 1 })
  assert.deepEqual(resultStreak(['failure', 'failure', 'success'], undefined), { result: 'failure', count: 2 })
  assert.deepEqual(resultStreak(['success', 'failure', 'failure'], undefined), { result: 'success', count: 1 })
})

test('result streak treats the editable baseline as the attempt before saved history', () => {
  assert.deepEqual(resultStreak([], 'success'), { result: 'success', count: 1 })
  assert.deepEqual(resultStreak(['success'], 'success'), { result: 'success', count: 2 })
  assert.deepEqual(resultStreak(['success', 'failure'], 'success'), { result: 'success', count: 1 })
})

test('result guidance adds a multiplier and plural only from the second matching result', () => {
  assert.equal(resultGuidance({ result: undefined, count: 0 }), "No previous result. Choose today's weight.")
  assert.equal(resultGuidance({ result: 'success', count: 1 }), 'Last result: done. Increase today.')
  assert.equal(resultGuidance({ result: 'success', count: 3 }), 'Last results: done x3. Increase today.')
  assert.equal(resultGuidance({ result: 'failure', count: 1 }), 'Last result: failed. Repeat today.')
  assert.equal(resultGuidance({ result: 'failure', count: 2 }), 'Last results: failed x2. Repeat today.')
})

test('auto-advance chooses the next unfinished exercise only', () => {
  const completed = new Set(['b'])
  assert.equal(nextPendingId(['a', 'b', 'c'], 'a', (id) => completed.has(id)), 'c')
  assert.equal(nextPendingId(['a', 'b', 'c'], 'c', () => false), undefined)
})

test('rest length stays between 10 seconds and 10 minutes', () => {
  assert.equal(REST_STEP_SECONDS, 10)
  assert.equal(clampRestValue(0), 10)
  assert.equal(clampRestValue(5), 10)
  assert.equal(clampRestValue(105), 105)
  assert.equal(clampRestValue(900), 600)
  assert.equal(clampRestValue(Number.NaN), 10)
})

test('rest countdown follows its wall-clock end time', () => {
  assert.equal(restSecondsRemaining(100_000, 90_000), 10)
  assert.equal(restSecondsRemaining(100_000, 99_001), 1)
  assert.equal(restSecondsRemaining(100_000, 100_000), 0)
  assert.equal(restSecondsRemaining(100_000, 120_000), 0)
})

test('edited workout duration uses minute precision between 10 minutes and 24 hours', () => {
  assert.equal(WORKOUT_DURATION_STEP_SECONDS, 600)
  assert.equal(workoutDurationSeconds(1, 15), 4500)
  assert.equal(workoutDurationSeconds(0, 10), 600)
  assert.equal(workoutDurationSeconds(23, 59), 86_340)
  assert.equal(workoutDurationSeconds(0, 9), null)
  assert.equal(workoutDurationSeconds(24, 0), null)
  assert.equal(workoutDurationSeconds(1, 60), null)
  assert.equal(workoutDurationSeconds(1.5, 0), null)
})
