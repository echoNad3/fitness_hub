import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidBackup, isValidSessions, isValidTemplates } from '../src/dataValidation.ts'

function variant(id: string) {
  return {
    id,
    name: id,
    category: 'CHEST',
    setup: '',
    sets: 3,
    reps: 10,
    weight: 20,
    perHand: false,
    lastResult: 'missing',
  }
}

function template(id: 'workout-a' | 'workout-b') {
  const exercise = variant(`${id}-exercise`)
  return {
    id,
    name: id === 'workout-a' ? 'Workout A' : 'Workout B',
    groups: [{ id: exercise.id, activeVariantId: exercise.id, variants: [exercise] }],
  }
}

test('a legacy backup with valid sessions and no templates is accepted', () => {
  assert.equal(isValidBackup({ sessions: [] }), true)
  assert.equal(isValidBackup({ sessions: [], variantOverrides: { exercise: { weight: 22.5 } } }), true)
  assert.equal(isValidBackup({ sessions: [], variantOverrides: { exercise: { weight: 'heavy' } } }), false)
})

test('both editable workout templates must be structurally valid', () => {
  const templates = [template('workout-a'), template('workout-b')]
  assert.equal(isValidTemplates(templates), true)
  assert.equal(isValidTemplates([template('workout-a')]), false)

  const broken = structuredClone(templates)
  broken[0].groups[0].activeVariantId = 'missing-variant'
  assert.equal(isValidTemplates(broken), false)
})

test('malformed template data cannot be imported', () => {
  assert.equal(isValidBackup({ sessions: [], templates: [{ id: 'workout-a' }] }), false)
})

test('session entries reject invalid weights and result values', () => {
  const validSession = {
    id: 'session-1',
    workoutId: 'workout-a',
    createdAt: Date.now(),
    groupEntries: {
      exercise: {
        activeVariantId: 'exercise',
        entries: { exercise: { weight: 20, result: 'success' } },
      },
    },
  }

  assert.equal(isValidSessions([validSession]), true)
  assert.equal(isValidSessions([{ ...validSession, groupEntries: { exercise: { activeVariantId: 'exercise', entries: { exercise: { weight: -1 } } } } }]), false)
})
