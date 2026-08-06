import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProgram,
  LEGACY_PROGRAM_ID,
  migrateSessionPrograms,
  normalizeProgramState,
  workoutNameForIndex,
  type WorkoutTemplate,
} from '../src/programs.ts'

function template(): WorkoutTemplate {
  return {
    id: 'workout-a',
    name: 'Workout A',
    groups: [{
      id: 'press-group',
      activeVariantId: 'press',
      restSeconds: 90,
      variants: [{
        id: 'press',
        name: 'Press',
        category: 'CHEST',
        setup: 'Seat 4',
        sets: 3,
        reps: 10,
        weight: 20,
        perHand: true,
        lastResult: 'missing',
      }],
    }],
  }
}

test('legacy Workout A/B data migrates into one current program', () => {
  const templates = [template(), { ...template(), id: 'workout-b', name: 'Workout B' }]
  const state = normalizeProgramState(undefined, templates, undefined, 123)
  assert.equal(state.activeProgramId, LEGACY_PROGRAM_ID)
  assert.deepEqual(state.programs, [{
    id: LEGACY_PROGRAM_ID,
    name: 'Current program',
    workoutIds: ['workout-a', 'workout-b'],
    createdAt: 123,
  }])
})

test('the default program is stable across fresh loads', () => {
  const templates = [template()]
  assert.deepEqual(
    normalizeProgramState(undefined, templates, undefined),
    normalizeProgramState(undefined, templates, undefined),
  )
})

test('session migration snapshots historically saved exercise settings', () => {
  const workout = template()
  const programs = normalizeProgramState(undefined, [workout], undefined, 123).programs
  const sessions = migrateSessionPrograms([{
    id: 'session-1',
    workoutId: 'workout-a',
    createdAt: 456,
    groupEntries: {
      'press-group': {
        activeVariantId: 'press',
        entries: {
          press: { weight: 24, setup: 'Seat 5', sets: 4, reps: 8, perHand: false },
        },
      },
    },
  }], [workout], programs)

  const migrated = sessions[0]
  const variant = migrated.workoutSnapshot.groups[0].variants[0]
  assert.equal(migrated.programId, LEGACY_PROGRAM_ID)
  assert.equal(migrated.programName, 'Current program')
  assert.equal(migrated.workoutName, 'Workout A')
  assert.deepEqual(
    { weight: variant.weight, setup: variant.setup, sets: variant.sets, reps: variant.reps, perHand: variant.perHand },
    { weight: 24, setup: 'Seat 5', sets: 4, reps: 8, perHand: false },
  )
})

test('new programs create one to seven alphabetical workout days with unique ids', () => {
  let sequence = 0
  const created = createProgram('Plan', 7, 90, () => `id-${sequence += 1}`, 123)
  assert.equal(created.program.name, 'Plan')
  assert.equal(created.program.workoutIds.length, 7)
  assert.deepEqual(created.templates.map((workout) => workout.name), [
    'Workout A',
    'Workout B',
    'Workout C',
    'Workout D',
    'Workout E',
    'Workout F',
    'Workout G',
  ])
  assert.equal(new Set(created.program.workoutIds).size, 7)
  assert.equal(workoutNameForIndex(0), 'Workout A')
  assert.equal(workoutNameForIndex(6), 'Workout G')
})
