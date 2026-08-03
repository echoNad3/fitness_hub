import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProgressSeries,
  estimateOneRepMax,
  ONE_REP_MAX_PERCENTAGES,
  totalExerciseLoad,
} from '../src/progressAnalysis.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 1)

const templates = [
  {
    id: 'workout-a',
    groups: [
      {
        id: 'press-group',
        variants: [
          {
            id: 'press',
            name: 'Dumbbell Press',
            category: 'CHEST' as const,
            reps: 7,
            perHand: true,
          },
        ],
      },
    ],
  },
]

function session(
  id: string,
  ageDays: number,
  weight: number,
  reps: number,
  result: 'success' | 'failure',
  perHand?: boolean,
) {
  return {
    id,
    workoutId: 'workout-a',
    createdAt: NOW - ageDays * DAY,
    groupEntries: {
      'press-group': {
        entries: {
          press: { weight, reps, result, perHand },
        },
      },
    },
  }
}

test('the supplied 1RM percentage table is complete and exact at key points', () => {
  assert.equal(ONE_REP_MAX_PERCENTAGES.length, 30)
  assert.equal(ONE_REP_MAX_PERCENTAGES[0], 1)
  assert.equal(ONE_REP_MAX_PERCENTAGES[9], 0.75)
  assert.equal(ONE_REP_MAX_PERCENTAGES[19], 0.6)
  assert.equal(ONE_REP_MAX_PERCENTAGES[29], 0.5)
  assert.equal(estimateOneRepMax(100, 1), 100)
  assert.equal(estimateOneRepMax(75, 10), 100)
  assert.equal(estimateOneRepMax(50, 30), 100)
  assert.equal(estimateOneRepMax(50, 0), null)
  assert.equal(estimateOneRepMax(50, 31), null)
})

test('total load combines both hands and honors the saved workout load type', () => {
  assert.equal(totalExerciseLoad(32, true), 64)
  assert.equal(totalExerciseLoad(32, false), 32)

  const series = buildProgressSeries(
    templates,
    [session('saved-total', 1, 32, 7, 'success', false)],
    { category: 'CHEST', metric: 'load', period: 'all', now: NOW },
  )
  assert.equal(series[0].points[0].value, 32)
})

test('load and estimated 1RM keep the same logged 1–30 rep attempts, including failures', () => {
  const sessions = [
    session('old-success', 200, 30, 7, 'success'),
    session('recent-success', 20, 32, 8, 'success'),
    session('recent-failure', 10, 35, 8, 'failure'),
    session('too-many-reps', 5, 20, 31, 'success'),
  ]

  const load = buildProgressSeries(templates, sessions, {
    category: 'CHEST',
    metric: 'load',
    period: 'all',
    now: NOW,
  })
  assert.deepEqual(load[0].points.map((point) => point.value), [60, 64, 70, 40])
  assert.equal(load[0].points[2].result, 'failure')

  const oneRm = buildProgressSeries(templates, sessions, {
    category: 'CHEST',
    metric: 'estimated-1rm',
    period: 'all',
    now: NOW,
  })
  assert.deepEqual(oneRm[0].points.map((point) => point.sessionId), [
    'old-success',
    'recent-success',
    'recent-failure',
  ])
  assert.equal(oneRm[0].points[0].value, 72.29)
  assert.equal(oneRm[0].points[1].value, 79.01)
  assert.equal(oneRm[0].points[2].value, 86.42)
  assert.equal(oneRm[0].points[2].result, 'failure')
})

test('period and muscle filters keep only matching history', () => {
  const sessions = [session('old', 200, 30, 7, 'success'), session('recent', 20, 32, 7, 'success')]
  const recent = buildProgressSeries(templates, sessions, {
    category: 'CHEST',
    metric: 'load',
    period: '3-months',
    now: NOW,
  })
  assert.deepEqual(recent[0].points.map((point) => point.sessionId), ['recent'])

  const otherMuscle = buildProgressSeries(templates, sessions, {
    category: 'BACK',
    metric: 'load',
    period: 'all',
    now: NOW,
  })
  assert.deepEqual(otherMuscle, [])
})

test('period boundaries are inclusive and future workouts are ignored', () => {
  const sessions = [
    session('boundary', 90, 30, 7, 'success'),
    session('outside', 90 + 1 / 86_400, 31, 7, 'success'),
    { ...session('future', 0, 32, 7, 'success'), createdAt: NOW + 1 },
  ]
  const recent = buildProgressSeries(templates, sessions, {
    category: 'CHEST',
    metric: 'load',
    period: '3-months',
    now: NOW,
  })

  assert.deepEqual(recent[0].points.map((point) => point.sessionId), ['boundary'])
})

test('ended-early workouts include logged attempts without inventing failures for untouched exercises', () => {
  const attempted = {
    ...session('ended-early-attempt', 2, 32, 8, 'failure'),
    finishedAt: NOW - 2 * DAY + 45 * 60 * 1000,
    endedEarly: true,
  }
  const untouched = {
    ...session('ended-early-untouched', 1, 35, 8, 'success'),
    finishedAt: NOW - DAY + 30 * 60 * 1000,
    endedEarly: true,
    groupEntries: {
      'press-group': {
        entries: {
          press: { weight: 35, reps: 8, perHand: true },
        },
      },
    },
  }

  for (const metric of ['load', 'estimated-1rm'] as const) {
    const series = buildProgressSeries(templates, [attempted, untouched], {
      category: 'CHEST',
      metric,
      period: 'all',
      now: NOW,
    })
    assert.deepEqual(series[0].points.map((point) => point.sessionId), ['ended-early-attempt'])
    assert.equal(series[0].points[0].result, 'failure')
  }
})
