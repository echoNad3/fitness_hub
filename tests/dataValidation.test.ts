import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidBackup, isValidSessions, isValidTemplates, repairTemplateLinks } from '../src/dataValidation.ts'

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
  const partner = structuredClone(linked[0].groups[0])
  partner.id = 'pair-partner'
  partner.activeVariantId = 'pair-partner'
  partner.variants[0].id = 'pair-partner'
  Object.assign(linked[0].groups[0], { hidden: false, linkId: 'pair-1' })
  Object.assign(partner, { hidden: true, linkId: 'pair-1' })
  linked[0].groups.push(partner)
  assert.equal(isValidTemplates(linked), true)

  const badHidden = structuredClone(templates)
  Object.assign(badHidden[0].groups[0], { hidden: 'yes' })
  assert.equal(isValidTemplates(badHidden), false)

  const badLink = structuredClone(templates)
  Object.assign(badLink[0].groups[0], { linkId: 42 })
  assert.equal(isValidTemplates(badLink), false)

  const orphaned = structuredClone(templates)
  Object.assign(orphaned[0].groups[0], { linkId: 'orphan', hidden: true })
  assert.equal(isValidTemplates(orphaned), false)

  const bothVisible = structuredClone(linked)
  bothVisible[0].groups[1].hidden = false
  assert.equal(isValidTemplates(bothVisible), false)
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

  // Session finishedAt
  const session = {
    id: 'session-1',
    workoutId: 'workout-a',
    createdAt: 100,
    finishedAt: 200,
    groupEntries: {},
  }
  assert.equal(isValidSessions([session]), true)
  assert.equal(isValidSessions([{ ...session, finishedAt: 'noon' }]), false)
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
  assert.equal(isValidSessions([{ ...validSession, createdAt: -1 }]), false)
  assert.equal(isValidSessions([{ ...validSession, finishedAt: validSession.createdAt - 1 }]), false)
  assert.equal(isValidSessions([{ ...validSession, groupEntries: { exercise: { activeVariantId: 'missing', entries: { exercise: { weight: 20 } } } } }]), false)
  assert.equal(isValidSessions([validSession, structuredClone(validSession)]), false)
})

test('app-wide ids must be unique across editable templates', () => {
  const templates = [template('workout-a'), template('workout-b')]
  templates[1].groups[0].id = templates[0].groups[0].id
  assert.equal(isValidTemplates(templates), false)
})

test('orphaned local swap links are repaired without weakening backup validation', () => {
  const templates = [template('workout-a'), template('workout-b')]
  Object.assign(templates[0].groups[0], { linkId: 'orphan', hidden: true })
  assert.equal(isValidTemplates(templates), false)

  const repaired = repairTemplateLinks(templates)
  assert.equal(isValidTemplates(repaired), true)
  assert.deepEqual((repaired as typeof templates)[0].groups[0], {
    ...template('workout-a').groups[0],
    hidden: false,
  })
})
