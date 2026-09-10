import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { haptics } from './haptics'
import { ProgressChart } from './ProgressChart'
import {
  buildProgressStats, buildProgressSeries, PROGRESS_PERIODS, progressPeriodLabel,
} from './progressAnalysis'
import { loadProgressPreferences, saveProgressPreferences, type ProgressPreferences } from './progressPreferences'
import { formatWorkoutDuration } from './timeFormat'
import { CATEGORIES, categoryLabel, muscleColorStyle } from './workoutPresentation'

type ProgressAnalysisScreenProps = {
  templates: Parameters<typeof buildProgressSeries>[0]
  sessions: Parameters<typeof buildProgressSeries>[1]
  completedSessionIds: ReadonlySet<string>
  programs: ReadonlyArray<{ id: string; name: string }>
  activeProgramId: string
  picker: 'program' | 'exercise' | null
  onPickerChange: (picker: 'program' | 'exercise' | null) => void
  onOpenWorkout: (sessionId: string) => void
  onBackToWorkout: () => void
}

export default function ProgressAnalysisScreen({
  templates, sessions, completedSessionIds, programs, activeProgramId, picker, onPickerChange,
  onOpenWorkout, onBackToWorkout,
}: ProgressAnalysisScreenProps) {
  const [view, setView] = useState(() => loadProgressPreferences(activeProgramId))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { category, metric, period, exerciseId } = view
  const historicalPrograms = sessions.reduce<Array<{ id: string; name: string }>>((items, session) => {
    if (!session.programId || items.some((item) => item.id === session.programId) || programs.some((item) => item.id === session.programId)) return items
    return [...items, { id: session.programId, name: `${session.programName || 'Program'} (deleted)` }]
  }, [])
  const programOptions = [...programs, ...historicalPrograms]
  const programId = view.programId === 'all' || programOptions.some((item) => item.id === view.programId)
    ? view.programId : activeProgramId
  const selectedProgramLabel = programId === 'all'
    ? 'All programs' : programOptions.find((item) => item.id === programId)?.name ?? 'Current program'
  const now = Date.now()
  const options = { category, period, programId, now }
  const exerciseOptions = buildProgressSeries(templates, sessions, { ...options, metric: 'load' })
    .sort((a, b) => a.name.localeCompare(b.name) || a.workoutName.localeCompare(b.workoutName))
  const selectedExerciseId = exerciseOptions.some((item) => item.exerciseId === exerciseId)
    ? exerciseId : exerciseOptions[0]?.exerciseId ?? ''
  const selectedOption = exerciseOptions.find((item) => item.exerciseId === selectedExerciseId)
  const selectedSeries = metric === 'load' ? selectedOption
    : buildProgressSeries(templates, sessions, { ...options, metric }).find((item) => item.exerciseId === selectedExerciseId)
  const stats = buildProgressStats(sessions, completedSessionIds, period, now, programId)
  const metricLabel = metric === 'load' ? 'Logged weight' : 'Estimated 1RM'
  const periodLabel = progressPeriodLabel(period)
  const hasAnyAttempts = sessions.some((session) => Object.values(session.groupEntries).some((group) =>
    Object.values(group.entries).some((entry) => entry.result),
  ))
  const emptyText = selectedOption && metric === 'estimated-1rm'
    ? 'No estimated 1RM data. Reps must be 1–30.'
    : hasAnyAttempts ? 'No attempts match these filters.' : 'Mark an exercise Done or Failed to see your progress.'
  const measuredAttempts = selectedSeries?.points.length ?? 0
  const totalAttempts = selectedOption?.points.length ?? 0
  const attemptLabel = measuredAttempts < totalAttempts
    ? `${measuredAttempts} of ${totalAttempts} attempts`
    : `${totalAttempts} ${totalAttempts === 1 ? 'attempt' : 'attempts'}`
  const exerciseNameCounts = new Map<string, number>()
  for (const item of exerciseOptions) exerciseNameCounts.set(item.name, (exerciseNameCounts.get(item.name) ?? 0) + 1)
  const exerciseLabel = (item: (typeof exerciseOptions)[number]) =>
    (exerciseNameCounts.get(item.name) ?? 0) > 1
      ? `${item.name} · ${item.workoutName}${programId === 'all' ? ` · ${item.programName}` : ''}` : item.name

  useEffect(() => {
    saveProgressPreferences(activeProgramId, { ...view, programId, exerciseId: selectedExerciseId || exerciseId })
  }, [activeProgramId, view, programId, selectedExerciseId, exerciseId])

  const select = (patch: Partial<ProgressPreferences>) => {
    if (Object.entries(patch).every(([key, value]) => view[key as keyof ProgressPreferences] === value)) return
    setView((current) => ({ ...current, ...patch }))
    void haptics.selection()
  }

  return (
    <>
      <section className="progress-toolbar" aria-label="Progress view">
        <div className="progress-filter">
          <span className="progress-filter-label">Exercise</span>
          <button className="progress-picker-trigger" type="button" disabled={!exerciseOptions.length}
            aria-label={`Exercise: ${selectedOption ? exerciseLabel(selectedOption) : 'No exercises with data'}`}
            aria-haspopup="dialog" aria-expanded={picker === 'exercise'} onClick={() => onPickerChange('exercise')}>
            <span>{selectedOption ? exerciseLabel(selectedOption) : 'No exercises with data'}</span>
            <span className="progress-picker-chevron" aria-hidden="true" />
          </button>
        </div>
        <button className="progress-filter-toggle" type="button" aria-expanded={filtersOpen}
          aria-controls="progress-filters" onClick={() => setFiltersOpen((current) => !current)}>
          <span><strong>Filters</strong><small>{selectedProgramLabel} · {periodLabel}</small></span>
          <span className="progress-picker-chevron" aria-hidden="true" />
        </button>
      </section>

      <section className="progress-controls" id="progress-filters" aria-label="Chart filters" hidden={!filtersOpen}>
        <div className="progress-filter">
          <span className="progress-filter-label">Program</span>
          <button className="progress-picker-trigger" type="button" aria-label={`Program: ${selectedProgramLabel}`}
            aria-haspopup="dialog" aria-expanded={picker === 'program'} onClick={() => onPickerChange('program')}>
            <span>{selectedProgramLabel}</span><span className="progress-picker-chevron" aria-hidden="true" />
          </button>
        </div>
        <div className="progress-filter">
          <span className="progress-filter-label">Time period</span>
          <div className="ex-segment progress-period" role="group" aria-label="Progress time period">
            {PROGRESS_PERIODS.map((item) => (
              <button className={period === item.value ? 'sel' : undefined} key={item.value} type="button"
                aria-label={item.ariaLabel} aria-pressed={period === item.value} onClick={() => select({ period: item.value })}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="progress-filter">
          <span className="progress-filter-label">Muscle group</span>
          <div className="ex-muscles" role="group" aria-label="Muscle group">
            {CATEGORIES.map((item) => (
              <button className={`ex-muscle${category === item ? ' sel' : ''}`} key={item} type="button"
                aria-pressed={category === item} style={category === item ? muscleColorStyle(item) : undefined}
                onClick={() => { if (category !== item) select({ category: item, exerciseId: '' }) }}>
                {categoryLabel(item)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="progress-card" aria-label={`${categoryLabel(category)} progress`}>
        <div className="progress-card-head">
          <span className="progress-card-title">
            <strong>{selectedOption?.name ?? 'Exercise progress'}</strong>
            <small>{metricLabel} · {periodLabel}</small>
          </span>
          {selectedOption && <span className="progress-series-count">{attemptLabel}</span>}
        </div>
        {hasAnyAttempts && (
          <div className="ex-segment progress-measure" role="group" aria-label="Progress measure">
            {([['load', 'Logged weight'], ['estimated-1rm', 'Estimated 1RM']] as const).map(([item, label]) => (
              <button className={metric === item ? 'sel' : undefined} type="button" key={item}
                aria-pressed={metric === item} onClick={() => select({ metric: item })}>{label}</button>
            ))}
          </div>
        )}
        {selectedSeries ? (
          <ProgressChart key={`${selectedSeries.exerciseId}:${period}`} series={selectedSeries} metric={metric} onOpenWorkout={onOpenWorkout} />
        ) : (
          <div className="progress-empty">
            <p>{emptyText}</p>
            {!hasAnyAttempts && <button className="progress-text-action" type="button" onClick={onBackToWorkout}>Go to Home</button>}
            {hasAnyAttempts && !selectedOption && <button className="progress-text-action" type="button" onClick={() => setFiltersOpen(true)}>Change filters</button>}
          </div>
        )}
        {selectedOption && <p className="progress-note">{metric === 'estimated-1rm' ? 'Uses reps from 1–30. ' : ''}Hollow points are failed attempts.</p>}
      </section>

      {sessions.length > 0 && (
        <section className="progress-summary" aria-label="Workout summary">
          <div className="progress-card-title"><strong>Workout summary</strong><small>{selectedProgramLabel} · {periodLabel}</small></div>
          <div className="hist-stats" aria-label="Workout stats">
            <div className="hist-stat"><strong>{stats.total}</strong><span>Workouts</span></div>
            <div className="hist-stat"><strong className="good">{stats.completionRate}%</strong><span>Completed</span></div>
            <div className="hist-stat"><strong>{stats.perWeek.toFixed(1)}</strong><span>Per week</span></div>
            <div className="hist-stat"><strong>{stats.averageDuration === null ? '—' : formatWorkoutDuration(stats.averageDuration)}</strong><span>Avg duration</span></div>
          </div>
        </section>
      )}

      {picker === 'program' && (
        <Dialog title="Choose program">
          <div className="progress-picker-options">
            {[{ id: 'all', name: 'All programs' }, ...programOptions].map((program) => (
              <button className={`progress-picker-option${program.id === programId ? ' selected' : ''}`} type="button"
                key={program.id} aria-pressed={program.id === programId} onClick={() => {
                  if (program.id !== programId) select({ programId: program.id, exerciseId: '' })
                  onPickerChange(null)
                }}><span>{program.name}</span></button>
            ))}
          </div>
          <button className="choice-cancel" type="button" onClick={() => onPickerChange(null)}>Cancel</button>
        </Dialog>
      )}
      {picker === 'exercise' && exerciseOptions.length > 0 && (
        <Dialog title="Choose exercise">
          <div className="progress-picker-options">
            {exerciseOptions.map((item) => (
              <button className={`progress-picker-option${item.exerciseId === selectedExerciseId ? ' selected' : ''}`} type="button"
                key={item.exerciseId} aria-pressed={item.exerciseId === selectedExerciseId} onClick={() => {
                  if (item.exerciseId !== selectedExerciseId) select({ exerciseId: item.exerciseId })
                  onPickerChange(null)
                }}><span>{exerciseLabel(item)}</span></button>
            ))}
          </div>
          <button className="choice-cancel" type="button" onClick={() => onPickerChange(null)}>Cancel</button>
        </Dialog>
      )}
    </>
  )
}
