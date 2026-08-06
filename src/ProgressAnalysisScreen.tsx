import { useState } from 'react'
import { haptics } from './haptics'
import { ProgressChart } from './ProgressChart'
import {
  buildProgressStats,
  buildProgressSeries,
  PROGRESS_PERIODS,
  progressPeriodLabel,
  type ProgressMetric,
  type ProgressPeriod,
} from './progressAnalysis'
import { formatWorkoutDuration } from './timeFormat'
import type { Category } from './workoutTypes'
import { CATEGORIES, categoryLabel, muscleColorStyle } from './workoutPresentation'

type ProgressAnalysisScreenProps = {
  templates: Parameters<typeof buildProgressSeries>[0]
  sessions: Parameters<typeof buildProgressSeries>[1]
  completedSessionIds: ReadonlySet<string>
  programs: ReadonlyArray<{ id: string; name: string }>
  activeProgramId: string
}

export default function ProgressAnalysisScreen({
  templates,
  sessions,
  completedSessionIds,
  programs,
  activeProgramId,
}: ProgressAnalysisScreenProps) {
  const [category, setCategory] = useState<Category>('CHEST')
  const [metric, setMetric] = useState<ProgressMetric>('load')
  const [period, setPeriod] = useState<ProgressPeriod>('all')
  const [exerciseId, setExerciseId] = useState('')
  const [programId, setProgramId] = useState<string | 'all'>(activeProgramId)
  const now = Date.now()
  const historicalPrograms = sessions.reduce<Array<{ id: string; name: string }>>((items, session) => {
    if (!session.programId || items.some((item) => item.id === session.programId) || programs.some((item) => item.id === session.programId)) {
      return items
    }
    return [...items, { id: session.programId, name: `${session.programName || 'Program'} (deleted)` }]
  }, [])
  const programOptions = [...programs, ...historicalPrograms]
  const exerciseOptions = buildProgressSeries(templates, sessions, {
    category,
    metric: 'load',
    period,
    programId,
    now,
  }).sort((a, b) => a.name.localeCompare(b.name) || a.workoutName.localeCompare(b.workoutName))
  const exerciseNameCounts = new Map<string, number>()
  for (const item of exerciseOptions) {
    exerciseNameCounts.set(item.name, (exerciseNameCounts.get(item.name) ?? 0) + 1)
  }
  const exerciseLabel = (item: (typeof exerciseOptions)[number]) =>
    (exerciseNameCounts.get(item.name) ?? 0) > 1
      ? `${item.name} · ${item.workoutName}${programId === 'all' ? ` · ${item.programName}` : ''}`
      : item.name
  const selectedExerciseId = exerciseOptions.some((item) => item.exerciseId === exerciseId)
    ? exerciseId
    : exerciseOptions[0]?.exerciseId ?? ''
  const selectedOption = exerciseOptions.find((item) => item.exerciseId === selectedExerciseId)
  const selectedSeries = metric === 'load'
    ? selectedOption
    : buildProgressSeries(templates, sessions, {
        category,
        metric,
        period,
        programId,
        now,
      }).find((item) => item.exerciseId === selectedExerciseId)
  const stats = buildProgressStats(sessions, completedSessionIds, period, now, programId)
  const metricLabel = metric === 'load' ? 'Total load' : 'Estimated 1RM'
  const periodLabel = progressPeriodLabel(period)
  const emptyText = selectedOption && metric === 'estimated-1rm'
    ? `No estimated 1RM for ${selectedOption.name}. Saved reps must be from 1 to 30.`
    : `No load data for ${categoryLabel(category).toLowerCase()} ${period === 'all' ? 'in your history' : `in the ${periodLabel.toLowerCase()}`}.`
  const measuredAttempts = selectedSeries?.points.length ?? 0
  const totalAttempts = selectedOption?.points.length ?? 0
  const attemptLabel = measuredAttempts < totalAttempts
    ? `${measuredAttempts} of ${totalAttempts} attempts`
    : `${totalAttempts} ${totalAttempts === 1 ? 'attempt' : 'attempts'}`

  return (
    <>
      <section className="progress-summary" aria-label="Workout summary">
        <label className="progress-filter">
          <span className="progress-filter-label">Program</span>
          <select
            className="progress-exercise-select"
            value={programId}
            onChange={(event) => {
              setProgramId(event.target.value)
              setExerciseId('')
              void haptics.selection()
            }}
          >
            <option value="all">All programs</option>
            {programOptions.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>

        <div className="progress-filter">
          <span className="progress-filter-label">Time period</span>
          <div className="ex-segment progress-period" role="group" aria-label="Progress time period">
            {PROGRESS_PERIODS.map((option) => {
              const selected = period === option.value
              return (
                <button
                  className={selected ? 'sel' : undefined}
                  key={option.value}
                  type="button"
                  aria-label={option.ariaLabel}
                  aria-pressed={selected}
                  onClick={() => {
                    if (selected) return
                    setPeriod(option.value)
                    void haptics.selection()
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="hist-stats" aria-label="Workout stats">
          <div className="hist-stat">
            <strong>{stats.total}</strong>
            <span>Workouts</span>
          </div>
          <div className="hist-stat">
            <strong className="good">{stats.completionRate}%</strong>
            <span>Completed</span>
          </div>
          <div className="hist-stat">
            <strong>{stats.perWeek.toFixed(1)}</strong>
            <span>Per week</span>
          </div>
          <div className="hist-stat">
            <strong>{stats.averageDuration === null ? '—' : formatWorkoutDuration(stats.averageDuration)}</strong>
            <span>Avg duration</span>
          </div>
        </div>
      </section>

      <section className="progress-controls" aria-label="Chart filters">
        <div className="progress-filter">
          <span className="progress-filter-label">Muscle group</span>
          <div className="ex-muscles" role="group" aria-label="Muscle group">
            {CATEGORIES.map((item) => {
              const selected = category === item
              return (
                <button
                  className={`ex-muscle${selected ? ' sel' : ''}`}
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  style={selected ? muscleColorStyle(item) : undefined}
                  onClick={() => {
                    if (selected) return
                    setCategory(item)
                    setExerciseId('')
                    void haptics.selection()
                  }}
                >
                  {categoryLabel(item)}
                </button>
              )
            })}
          </div>
        </div>

        <label className="progress-filter">
          <span className="progress-filter-label">Exercise</span>
          <select
            className="progress-exercise-select"
            value={selectedExerciseId}
            disabled={exerciseOptions.length === 0}
            onChange={(event) => {
              setExerciseId(event.target.value)
              void haptics.selection()
            }}
          >
            {exerciseOptions.length === 0 ? (
              <option value="">No exercises with data</option>
            ) : (
              exerciseOptions.map((item) => <option key={item.exerciseId} value={item.exerciseId}>{exerciseLabel(item)}</option>)
            )}
          </select>
        </label>

        <div className="progress-filter">
          <span className="progress-filter-label">Measure</span>
          <div className="ex-segment" role="group" aria-label="Progress measure">
            {([
              ['load', 'Total load'],
              ['estimated-1rm', 'Estimated 1RM'],
            ] as const).map(([item, label]) => {
              const selected = metric === item
              return (
                <button
                  className={selected ? 'sel' : undefined}
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    if (selected) return
                    setMetric(item)
                    void haptics.selection()
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

      </section>

      <section className="progress-card" aria-label={`${categoryLabel(category)} progress`}>
        <div className="progress-card-head">
          <span className="progress-card-title">
            <strong>{selectedOption?.name ?? categoryLabel(category)}</strong>
            <small>{metricLabel} · {periodLabel}</small>
          </span>
          {selectedOption && (
            <span className="progress-series-count">
              {attemptLabel}
            </span>
          )}
        </div>

        {selectedSeries ? (
          <ProgressChart series={selectedSeries} metric={metric} />
        ) : (
          <div className="progress-empty">
            <p className="empty-state">{emptyText}</p>
          </div>
        )}

        <p className="progress-note">
          {metric === 'load'
            ? 'Uses the weight you entered. Hollow points are failed attempts.'
            : 'Uses saved weight and reps from 1–30. Hollow points are failed attempts.'}
        </p>
      </section>
    </>
  )
}
