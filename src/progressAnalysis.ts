import type { Category, ResultStatus } from './workoutTypes'

export type ProgressMetric = 'load' | 'estimated-1rm'
export type ProgressPeriod = '3-months' | '6-months' | '1-year' | 'all'

export const PROGRESS_PERIODS: ReadonlyArray<{
  value: ProgressPeriod
  label: string
  ariaLabel: string
}> = [
  { value: '3-months', label: '3 mo', ariaLabel: 'Last 3 months' },
  { value: '6-months', label: '6 mo', ariaLabel: 'Last 6 months' },
  { value: '1-year', label: '1 yr', ariaLabel: 'Last year' },
  { value: 'all', label: 'All', ariaLabel: 'All history' },
]

// The exact repetition percentages supplied for this app. The array index is reps - 1.
export const ONE_REP_MAX_PERCENTAGES = [
  1,
  0.97,
  0.94,
  0.92,
  0.89,
  0.86,
  0.83,
  0.81,
  0.78,
  0.75,
  0.73,
  0.71,
  0.7,
  0.68,
  0.67,
  0.65,
  0.64,
  0.63,
  0.61,
  0.6,
  0.59,
  0.58,
  0.57,
  0.56,
  0.55,
  0.54,
  0.53,
  0.52,
  0.51,
  0.5,
] as const

type ProgressVariant = {
  id: string
  name: string
  category: Category
  reps: number
  perHand: boolean
}

type ProgressTemplate = {
  id: string
  groups: ReadonlyArray<{
    id: string
    variants: readonly ProgressVariant[]
  }>
}

type ProgressEntry = {
  weight: number
  reps?: number
  perHand?: boolean
  result?: ResultStatus
}

type ProgressSession = {
  id: string
  workoutId: string
  createdAt: number
  groupEntries: Record<
    string,
    {
      entries: Record<string, ProgressEntry>
    }
  >
}

export type ProgressPoint = {
  sessionId: string
  createdAt: number
  value: number
  load: number
  reps: number
  result: ResultStatus
}

export type ProgressSeries = {
  exerciseId: string
  name: string
  category: Category
  points: ProgressPoint[]
}

type ProgressOptions = {
  category: Category
  metric: ProgressMetric
  period: ProgressPeriod
  now: number
}

const PERIOD_MILLISECONDS: Record<Exclude<ProgressPeriod, 'all'>, number> = {
  '3-months': 90 * 24 * 60 * 60 * 1000,
  '6-months': 180 * 24 * 60 * 60 * 1000,
  '1-year': 365 * 24 * 60 * 60 * 1000,
}

const roundAnalysisValue = (value: number) => Math.round(value * 100) / 100

export function totalExerciseLoad(weight: number, perHand: boolean) {
  return roundAnalysisValue(weight * (perHand ? 2 : 1))
}

export function estimateOneRepMax(load: number, reps: number) {
  const percentage = ONE_REP_MAX_PERCENTAGES[reps - 1]
  if (percentage === undefined || !Number.isFinite(load) || load < 0) {
    return null
  }
  return roundAnalysisValue(load / percentage)
}

export function progressPeriodLabel(period: ProgressPeriod) {
  return PROGRESS_PERIODS.find((option) => option.value === period)?.ariaLabel ?? 'All history'
}

export function buildProgressSeries(
  templates: readonly ProgressTemplate[],
  sessions: readonly ProgressSession[],
  options: ProgressOptions,
): ProgressSeries[] {
  const cutoff =
    options.period === 'all'
      ? Number.NEGATIVE_INFINITY
      : options.now - PERIOD_MILLISECONDS[options.period]
  const chronologicalSessions = sessions
    .filter((session) => session.createdAt >= cutoff && session.createdAt <= options.now)
    .sort((a, b) => a.createdAt - b.createdAt)
  const series: ProgressSeries[] = []

  for (const template of templates) {
    for (const group of template.groups) {
      for (const variant of group.variants) {
        if (variant.category !== options.category) continue

        const points: ProgressPoint[] = []
        for (const session of chronologicalSessions) {
          if (session.workoutId !== template.id) continue
          const entry = session.groupEntries[group.id]?.entries[variant.id]
          if (!entry?.result) continue

          const reps = entry.reps ?? variant.reps
          const load = totalExerciseLoad(entry.weight, entry.perHand ?? variant.perHand)
          const value = options.metric === 'load' ? load : estimateOneRepMax(load, reps)
          if (value === null) continue

          points.push({
            sessionId: session.id,
            createdAt: session.createdAt,
            value,
            load,
            reps,
            result: entry.result,
          })
        }

        if (points.length > 0) {
          series.push({
            exerciseId: variant.id,
            name: variant.name,
            category: variant.category,
            points,
          })
        }
      }
    }
  }

  return series
}

export function formatProgressValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} kg`
}
