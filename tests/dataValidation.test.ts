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

test('swap-pair flags must be well-typed when present', () => {
  const templates = [template('workout-a'), template('workout-b')]
  const linked = structuredClone(templates)
  Object.assign(linked[0].groups[0], { hidden: false, linkId: 'pair-1' })
  assert.equal(isValidTemplates(linked), true)

  const badHidden = structuredClone(templates)
  Object.assign(badHidden[0].groups[0], { hidden: 'yes' })
  assert.equal(isValidTemplates(badHidden), false)

  const badLink = structuredClone(templates)
  Object.assign(badLink[0].groups[0], { linkId: 42 })
  assert.equal(isValidTemplates(badLink), false)
})

test('increase-stage fields must be well-typed when present', () => {
  const entry = (extra: object) => [
    {
      id: 'session-1',
      workoutId: 'workout-a',
      createdAt: Date.now(),
      groupEntries: {
        exercise: { activeVariantId: 'exercise', entries: { exercise: { weight: 20, ...extra } } },
      },
    },
  ]

  assert.equal(isValidSessions(entry({ increaseResolved: true, increaseDelta: 2.5 })), true)
  assert.equal(isValidSessions(entry({ increaseResolved: 'yes' })), false)
  assert.equal(isValidSessions(entry({ increaseDelta: -2.5 })), false)
})

test('new optional fields must be well-typed when present', () => {
  // Variant note
  const templates = [template('workout-a'), template('workout-b')]
  const noted = structuredClone(templates)
  Object.assign(noted[0].groups[0].variants[0], { note: 'grip felt off' })
  assert.equal(isValidTemplates(noted), true)
  const badNote = structuredClone(templates)
  Object.assign(badNote[0].groups[0].variants[0], { note: 42 })
  assert.equal(isValidTemplates(badNote), false)

  // Session finishedAt + gymPass on the backup root
  const session = {
    id: 'session-1',
    workoutId: 'workout-a',
    createdAt: 100,
    finishedAt: 200,
    groupEntries: {},
  }
  assert.equal(isValidSessions([session]), true)
  assert.equal(isValidSessions([{ ...session, finishedAt: 'noon' }]), false)
  assert.equal(isValidBackup({ sessions: [], gymPass: 'data:image/png;base64,abc' }), true)
  assert.equal(isValidBackup({ sessions: [], gymPass: 12 }), false)
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
