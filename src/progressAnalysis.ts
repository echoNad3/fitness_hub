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
  name?: string
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
  programId?: string
  programName?: string
  workoutName?: string
  createdAt: number
  finishedAt?: number
  workoutSnapshot?: ProgressTemplate
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
  programId: string
  programName: string
  workoutId: string
  workoutName: string
  points: ProgressPoint[]
}

type ProgressOptions = {
  category: Category
  metric: ProgressMetric
  period: ProgressPeriod
  programId?: string | 'all'
  now: number
}

const PERIOD_MILLISECONDS: Record<Exclude<ProgressPeriod, 'all'>, number> = {
  '3-months': 90 * 24 * 60 * 60 * 1000,
  '6-months': 180 * 24 * 60 * 60 * 1000,
  '1-year': 365 * 24 * 60 * 60 * 1000,
}

const WEEK_MILLISECONDS = 7 * 24 * 60 * 60 * 1000
const MAX_RECORDED_DURATION_MILLISECONDS = 24 * 60 * 60 * 1000

const roundAnalysisValue = (value: number) => Math.round(value * 100) / 100

export function totalExerciseLoad(weight: number, _perHand: boolean) {
  return roundAnalysisValue(weight)
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

export type ProgressStats = {
  total: number
  completionRate: number
  perWeek: number
  averageDuration: number | null
}

export function buildProgressStats(
  sessions: readonly ProgressSession[],
  completedSessionIds: ReadonlySet<string>,
  period: ProgressPeriod,
  now: number,
  programId: string | 'all' = 'all',
): ProgressStats {
  const periodLength = period === 'all' ? null : PERIOD_MILLISECONDS[period]
  const cutoff = periodLength === null ? Number.NEGATIVE_INFINITY : now - periodLength
  const filtered = sessions.filter(
    (session) =>
      session.createdAt >= cutoff &&
      session.createdAt <= now &&
      (programId === 'all' || session.programId === programId),
  )
  const completed = filtered.filter((session) => completedSessionIds.has(session.id)).length
  const durations = filtered.flatMap((session) => {
    if (
      session.finishedAt === undefined ||
      session.finishedAt <= session.createdAt ||
      session.finishedAt - session.createdAt > MAX_RECORDED_DURATION_MILLISECONDS
    ) {
      return []
    }
    return [session.finishedAt - session.createdAt]
  })
  const oldest = filtered.reduce<number | null>(
    (value, session) => (value === null ? session.createdAt : Math.min(value, session.createdAt)),
    null,
  )
  const span = periodLength ?? (oldest === null ? WEEK_MILLISECONDS : Math.max(WEEK_MILLISECONDS, now - oldest))

  return {
    total: filtered.length,
    completionRate: filtered.length > 0 ? Math.round((completed / filtered.length) * 100) : 0,
    perWeek: filtered.length > 0 ? roundAnalysisValue(filtered.length / (span / WEEK_MILLISECONDS)) : 0,
    averageDuration:
      durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
  }
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
    .filter(
      (session) =>
        session.createdAt >= cutoff &&
        session.createdAt <= options.now &&
        (!options.programId || options.programId === 'all' || session.programId === options.programId),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
  const templateById = new Map(templates.map((template) => [template.id, template]))
  const series = new Map<string, ProgressSeries>()

  for (const session of chronologicalSessions) {
    const template = session.workoutSnapshot ?? templateById.get(session.workoutId)
    if (!template) continue
    for (const group of template.groups) {
      for (const variant of group.variants) {
        if (variant.category !== options.category) continue
        const entry = session.groupEntries[group.id]?.entries[variant.id]
        if (!entry?.result) continue
        const reps = entry.reps ?? variant.reps
        const load = totalExerciseLoad(entry.weight, entry.perHand ?? variant.perHand)
        const value = options.metric === 'load' ? load : estimateOneRepMax(load, reps)
        if (value === null) continue
        const programId = session.programId ?? 'legacy'
        const exerciseId = `${programId}:${session.workoutId}:${variant.id}`
        const current = series.get(exerciseId) ?? {
          exerciseId,
          name: variant.name,
          category: variant.category,
          programId,
          programName: session.programName ?? 'Current program',
          workoutId: session.workoutId,
          workoutName: session.workoutName ?? template.name ?? 'Workout',
          points: [],
        }
        current.points.push({
          sessionId: session.id,
          createdAt: session.createdAt,
          value,
          load,
          reps,
          result: entry.result,
        })
        series.set(exerciseId, current)
      }
    }
  }

  return [...series.values()]
}

export function formatProgressValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} kg`
}
