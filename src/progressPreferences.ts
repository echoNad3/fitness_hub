import { getStored, setStored } from './storage.ts'
import { CATEGORIES } from './workoutPresentation.ts'
import type { Category } from './workoutTypes'
import { PROGRESS_PERIODS, type ProgressMetric, type ProgressPeriod } from './progressAnalysis.ts'

const KEY = 'fitness-hub-progress-view-v1'

export type ProgressPreferences = {
  category: Category
  metric: ProgressMetric
  period: ProgressPeriod
  exerciseId: string
  programId: string
}

export function loadProgressPreferences(activeProgramId: string): ProgressPreferences {
  const defaults: ProgressPreferences = {
    category: 'CHEST', metric: 'load', period: 'all', exerciseId: '', programId: activeProgramId,
  }
  try {
    const saved = JSON.parse(getStored(KEY) ?? 'null')
    // Changing the active plan starts its own view; stale filters must not hide that plan's data.
    if (!saved || saved.activeProgramId !== activeProgramId) return defaults
    return {
      category: CATEGORIES.includes(saved.category) ? saved.category : defaults.category,
      metric: saved.metric === 'estimated-1rm' ? saved.metric : defaults.metric,
      period: PROGRESS_PERIODS.some((item) => item.value === saved.period) ? saved.period : defaults.period,
      exerciseId: typeof saved.exerciseId === 'string' ? saved.exerciseId : '',
      programId: typeof saved.programId === 'string' ? saved.programId : activeProgramId,
    }
  } catch {
    return defaults
  }
}

export function saveProgressPreferences(activeProgramId: string, preferences: ProgressPreferences) {
  setStored(KEY, JSON.stringify({ ...preferences, activeProgramId }))
}
