import assert from 'node:assert/strict'
import test from 'node:test'
import { clampRestSeconds, moveItem, nextPendingId, selectActiveVariantId, toggleResult } from '../src/domain.ts'

test('result buttons toggle, switch, and clear predictably', () => {
  assert.equal(toggleResult(undefined, 'success'), 'success')
  assert.equal(toggleResult('success', 'failure'), 'failure')
  assert.equal(toggleResult('failure', 'failure'), undefined)
})

test('workout items move one position without crossing boundaries', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  assert.deepEqual(moveItem(items, 'b', -1).map((item) => item.id), ['b', 'a', 'c'])
  assert.deepEqual(moveItem(items, 'b', 1).map((item) => item.id), ['a', 'c', 'b'])
  assert.equal(moveItem(items, 'a', -1), items)
  assert.equal(moveItem(items, 'missing', 1), items)
})

test('auto-advance chooses the next unfinished exercise only', () => {
  const completed = new Set(['b'])
  assert.equal(nextPendingId(['a', 'b', 'c'], 'a', (id) => completed.has(id)), 'c')
  assert.equal(nextPendingId(['a', 'b', 'c'], 'c', () => false), undefined)
})

test('rest length stays between 15 seconds and 10 minutes', () => {
  assert.equal(clampRestSeconds(15, -15), 15)
  assert.equal(clampRestSeconds(90, 15), 105)
  assert.equal(clampRestSeconds(600, 15), 600)
})

test('the current session variant wins in edit mode', () => {
  assert.equal(selectActiveVariantId('session-choice', 'saved-choice', 'default-choice'), 'session-choice')
  assert.equal(selectActiveVariantId(undefined, 'saved-choice', 'default-choice'), 'saved-choice')
  assert.equal(selectActiveVariantId(undefined, undefined, 'default-choice'), 'default-choice')
})
