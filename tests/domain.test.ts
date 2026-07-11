import assert from 'node:assert/strict'
import test from 'node:test'
import { clampRestValue, nextPendingId, restSecondsRemaining, toggleResult } from '../src/domain.ts'

test('result buttons toggle, switch, and clear predictably', () => {
  assert.equal(toggleResult(undefined, 'success'), 'success')
  assert.equal(toggleResult('success', 'failure'), 'failure')
  assert.equal(toggleResult('failure', 'failure'), undefined)
})

test('auto-advance chooses the next unfinished exercise only', () => {
  const completed = new Set(['b'])
  assert.equal(nextPendingId(['a', 'b', 'c'], 'a', (id) => completed.has(id)), 'c')
  assert.equal(nextPendingId(['a', 'b', 'c'], 'c', () => false), undefined)
})

test('rest length stays between 5 seconds and 10 minutes', () => {
  assert.equal(clampRestValue(0), 5)
  assert.equal(clampRestValue(105), 105)
  assert.equal(clampRestValue(900), 600)
  assert.equal(clampRestValue(Number.NaN), 5)
})

test('rest countdown follows its wall-clock end time', () => {
  assert.equal(restSecondsRemaining(100_000, 90_000), 10)
  assert.equal(restSecondsRemaining(100_000, 99_001), 1)
  assert.equal(restSecondsRemaining(100_000, 100_000), 0)
  assert.equal(restSecondsRemaining(100_000, 120_000), 0)
})
