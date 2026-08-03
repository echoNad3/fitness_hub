import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTimerDuration, formatWorkoutDuration } from '../src/timeFormat.ts'

test('historic workout durations display only hours and minutes', () => {
  assert.equal(formatWorkoutDuration(30_000), '1 min')
  assert.equal(formatWorkoutDuration(45 * 60_000 + 29_000), '45 min')
  assert.equal(formatWorkoutDuration(45 * 60_000 + 30_000), '46 min')
  assert.equal(formatWorkoutDuration(60 * 60_000), '1h 0m')
  assert.equal(formatWorkoutDuration((2 * 60 + 7) * 60_000 + 15_000), '2h 7m')
  assert.equal(formatWorkoutDuration((3 * 24 * 60 + 5 * 60 + 45) * 60_000), '3d 5h')
})

test('active timers display only minutes and seconds', () => {
  assert.equal(formatTimerDuration(0), '0:00')
  assert.equal(formatTimerDuration(90), '1:30')
  assert.equal(formatTimerDuration(600), '10:00')
})
