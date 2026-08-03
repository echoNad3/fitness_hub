import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HISTORY_PAGE_SIZE,
  clampHistoryCount,
  historyCountForIndex,
  nextHistoryCount,
} from '../src/historyPagination.ts'

test('history initially renders at most fifty workouts', () => {
  assert.equal(HISTORY_PAGE_SIZE, 50)
  assert.equal(clampHistoryCount(HISTORY_PAGE_SIZE, 12), 12)
  assert.equal(clampHistoryCount(HISTORY_PAGE_SIZE, 120), 50)
})

test('older history loads in bounded pages without dropping data', () => {
  assert.equal(nextHistoryCount(50, 120), 100)
  assert.equal(nextHistoryCount(100, 120), 120)
  assert.equal(nextHistoryCount(120, 120), 120)
})

test('tracker navigation reveals the page containing its target', () => {
  assert.equal(historyCountForIndex(0, 140), 50)
  assert.equal(historyCountForIndex(50, 140), 100)
  assert.equal(historyCountForIndex(139, 140), 140)
})
