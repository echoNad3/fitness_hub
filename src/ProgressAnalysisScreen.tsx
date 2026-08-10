import { useState } from 'react'
import { Dialog } from './Dialog'
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
  picker: 'program' | 'exercise' | null
  onPickerChange: (picker: 'program' | 'exercise' | null) => void
}

export default function ProgressAnalysisScreen({
  templates,
  sessions,
  completedSessionIds,
  programs,
  activeProgramId,
  picker,
  onPickerChange,
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
  const selectedProgramLabel = programId === 'all'
    ? 'All programs'
    : programOptions.find((program) => program.id === programId)?.name ?? 'Program unavailable'
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
    ? `No estimated 1RM data. Reps must be 1–30.`
    : `No ${categoryLabel(category).toLowerCase()} data ${period === 'all' ? 'yet' : `in the ${periodLabel.toLowerCase()}`}.`
  const measuredAttempts = selectedSeries?.points.length ?? 0
  const totalAttempts = selectedOption?.points.length ?? 0
  const attemptLabel = measuredAttempts < totalAttempts
    ? `${measuredAttempts} of ${totalAttempts} attempts`
    : `${totalAttempts} ${totalAttempts === 1 ? 'attempt' : 'attempts'}`

  return (
    <>
      <section className="progress-summary" aria-label="Workout summary">
        <div className="progress-filter">
          <span className="progress-filter-label">Program</span>
          <button
            className="progress-picker-trigger"
            type="button"
            aria-label={`Program: ${selectedProgramLabel}`}
            aria-haspopup="dialog"
            aria-expanded={picker === 'program'}
            onClick={() => onPickerChange('program')}
          >
            <span>{selectedProgramLabel}</span>
            <span className="progress-picker-chevron" aria-hidden="true" />
          </button>
        </div>

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

        <div className="progress-filter">
          <span className="progress-filter-label">Exercise</span>
          <button
            className="progress-picker-trigger"
            type="button"
            disabled={exerciseOptions.length === 0}
            aria-label={`Exercise: ${selectedOption ? exerciseLabel(selectedOption) : 'No exercises with data'}`}
            aria-haspopup="dialog"
            aria-expanded={picker === 'exercise'}
            onClick={() => onPickerChange('exercise')}
          >
            <span>{selectedOption ? exerciseLabel(selectedOption) : 'No exercises with data'}</span>
            <span className="progress-picker-chevron" aria-hidden="true" />
          </button>
        </div>

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

        {selectedOption && (
          <p className="progress-note">
            {metric === 'load'
              ? 'Hollow points are failed attempts.'
              : 'Uses reps from 1–30. Hollow points are failed attempts.'}
          </p>
        )}
      </section>

      {picker === 'program' && (
        <Dialog title="Choose program">
          <div className="progress-picker-options">
            {[
              { id: 'all', name: 'All programs' },
              ...programOptions,
            ].map((program) => {
              const selected = program.id === programId
              return (
                <button
                  className={`progress-picker-option${selected ? ' selected' : ''}`}
                  type="button"
                  key={program.id}
                  aria-pressed={selected}
                  onClick={() => {
                    if (selected) {
                      onPickerChange(null)
                      return
                    }
                    setProgramId(program.id)
                    setExerciseId('')
                    onPickerChange(null)
                    void haptics.selection()
                  }}
                >
                  <span>{program.name}</span>
                </button>
              )
            })}
          </div>
          <button className="choice-cancel" type="button" onClick={() => onPickerChange(null)}>Cancel</button>
        </Dialog>
      )}

      {picker === 'exercise' && exerciseOptions.length > 0 && (
        <Dialog title="Choose exercise">
          <div className="progress-picker-options">
            {exerciseOptions.map((item) => {
              const selected = item.exerciseId === selectedExerciseId
              return (
                <button
                  className={`progress-picker-option${selected ? ' selected' : ''}`}
                  type="button"
                  key={item.exerciseId}
                  aria-pressed={selected}
                  onClick={() => {
                    if (selected) {
                      onPickerChange(null)
                      return
                    }
                    setExerciseId(item.exerciseId)
                    onPickerChange(null)
                    void haptics.selection()
                  }}
                >
                  <span>{exerciseLabel(item)}</span>
                </button>
              )
            })}
          </div>
          <button className="choice-cancel" type="button" onClick={() => onPickerChange(null)}>Cancel</button>
        </Dialog>
      )}
    </>
  )
}
