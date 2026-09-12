import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { haptics } from './haptics'
import { ProgressChart } from './ProgressChart'
import {
  buildProgressStats, buildProgressSeries, PROGRESS_PERIODS, progressPeriodLabel,
} from './progressAnalysis'
import { loadProgressPreferences, saveProgressPreferences, type ProgressPreferences } from './progressPreferences'
import { formatWorkoutDuration } from './timeFormat'
import { CATEGORIES, categoryLabel } from './workoutPresentation'

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

type ProgressRangeDraft = Pick<ProgressPreferences, 'programId' | 'period'>

export default function ProgressAnalysisScreen({
  templates, sessions, completedSessionIds, programs, activeProgramId, picker, onPickerChange,
  onOpenWorkout, onBackToWorkout,
}: ProgressAnalysisScreenProps) {
  const [view, setView] = useState(() => loadProgressPreferences(activeProgramId))
  const [rangeDraft, setRangeDraft] = useState<ProgressRangeDraft | null>(null)
  const { metric, period, exerciseId } = view
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
  const options = { period, programId, now }
  const exerciseOptions = buildProgressSeries(templates, sessions, {
    period: 'all', programId, now, metric: 'load',
  })
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
      || a.name.localeCompare(b.name) || a.workoutName.localeCompare(b.workoutName))
  const fallbackExercise = exerciseOptions.reduce<(typeof exerciseOptions)[number] | undefined>((latest, item) => {
    const itemDate = item.points[item.points.length - 1]?.createdAt ?? 0
    const latestDate = latest?.points[latest.points.length - 1]?.createdAt ?? 0
    return itemDate > latestDate ? item : latest
  }, undefined)
  const selectedExerciseId = exerciseOptions.some((item) => item.exerciseId === exerciseId)
    ? exerciseId : fallbackExercise?.exerciseId ?? ''
  const selectedOption = exerciseOptions.find((item) => item.exerciseId === selectedExerciseId)
  const rangeLoadSeries = buildProgressSeries(templates, sessions, { ...options, metric: 'load' })
    .find((item) => item.exerciseId === selectedExerciseId)
  const selectedSeries = metric === 'load' ? rangeLoadSeries
    : buildProgressSeries(templates, sessions, { ...options, metric }).find((item) => item.exerciseId === selectedExerciseId)
  const stats = buildProgressStats(sessions, completedSessionIds, period, now, programId)
  const periodLabel = progressPeriodLabel(period)
  const hasAnyAttempts = sessions.some((session) => Object.values(session.groupEntries).some((group) =>
    Object.values(group.entries).some((entry) => entry.result),
  ))
  const emptyText = selectedOption && metric === 'estimated-1rm'
    ? 'No estimated 1RM data in this range. Reps must be 1–30.'
    : selectedOption ? 'No attempts in this range.'
      : hasAnyAttempts ? 'No recorded exercises in this program.' : 'Finish a workout to see progress.'
  const measuredAttempts = selectedSeries?.points.length ?? 0
  const totalAttempts = rangeLoadSeries?.points.length ?? 0
  const attemptLabel = measuredAttempts < totalAttempts
    ? `${measuredAttempts} of ${totalAttempts} attempts`
    : `${totalAttempts} ${totalAttempts === 1 ? 'attempt' : 'attempts'}`
  const selectedExerciseContext = selectedOption
    ? categoryLabel(selectedOption.category)
    : ''

  useEffect(() => {
    saveProgressPreferences(activeProgramId, { ...view, programId, exerciseId: selectedExerciseId || exerciseId })
  }, [activeProgramId, view, programId, selectedExerciseId, exerciseId])

  useEffect(() => {
    if (picker === 'program') setRangeDraft({ programId, period })
    else setRangeDraft(null)
  }, [picker, programId, period])

  const select = (patch: Partial<ProgressPreferences>) => {
    if (Object.entries(patch).every(([key, value]) => view[key as keyof ProgressPreferences] === value)) return
    setView((current) => ({ ...current, ...patch }))
    void haptics.selection()
  }

  const selectRange = (patch: Partial<ProgressRangeDraft>) => {
    const current = rangeDraft ?? { programId, period }
    if (Object.entries(patch).every(([key, value]) => current[key as keyof ProgressRangeDraft] === value)) return
    setRangeDraft({ ...current, ...patch })
    void haptics.selection()
  }

  const applyRange = () => {
    const next = rangeDraft ?? { programId, period }
    if (next.programId !== programId || next.period !== period) {
      setView((current) => ({
        ...current,
        ...next,
        exerciseId: next.programId === programId ? current.exerciseId : '',
      }))
    }
    onPickerChange(null)
  }

  return (
    <>
      <section className="progress-summary" aria-label="Workout summary">
        <strong className="progress-section-title">Workout summary</strong>
        <button className="progress-summary-trigger" type="button" aria-label={`Progress range: ${selectedProgramLabel}, ${periodLabel}`}
          aria-haspopup="dialog" aria-expanded={picker === 'program'} onClick={() => onPickerChange('program')}>
          <span><strong>Program &amp; date range</strong><small>{selectedProgramLabel} · {periodLabel}</small></span>
          <span className="progress-picker-chevron" aria-hidden="true" />
        </button>
        <div className="hist-stats" aria-label="Workout stats">
          <div className="hist-stat"><strong>{stats.total}</strong><span>Workouts</span></div>
          <div className="hist-stat"><strong className="good">{stats.completionRate}%</strong><span>Completed</span></div>
          <div className="hist-stat"><strong>{stats.perWeek.toFixed(1)}</strong><span>Per week</span></div>
          <div className="hist-stat"><strong>{stats.averageDuration === null ? '—' : formatWorkoutDuration(stats.averageDuration)}</strong><span>Avg duration</span></div>
        </div>
      </section>

      <section className="progress-card" aria-label="Exercise progress">
        <strong className="progress-section-title">Exercise progress</strong>
        <button className="progress-exercise-trigger" type="button" disabled={!exerciseOptions.length}
          aria-label={`Exercise: ${selectedOption?.name ?? 'No exercises with data'}`}
          aria-haspopup="dialog" aria-expanded={picker === 'exercise'} onClick={() => onPickerChange('exercise')}>
          <span>
            <strong>{selectedOption?.name ?? 'No exercises with data'}</strong>
            <small>{selectedOption ? `${selectedExerciseContext} · ${attemptLabel}` : 'Finish a workout to add exercise data'}</small>
          </span>
          <span className="progress-picker-chevron" aria-hidden="true" />
        </button>

        {selectedOption && (
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
          <>
            <div className="progress-empty-chart" role="img" aria-label={emptyText}>
              <span /><span /><span /><span />
              <strong>No attempts to chart</strong>
            </div>
            <div className="progress-empty">
              <p>{emptyText}</p>
              {!hasAnyAttempts && <button className="progress-text-action" type="button" onClick={onBackToWorkout}>Go to Home</button>}
              {hasAnyAttempts && !selectedOption && <button className="progress-text-action" type="button" onClick={() => onPickerChange('program')}>Change range</button>}
            </div>
          </>
        )}
      </section>

      {picker === 'program' && (
        <Dialog title="Progress range">
          <div className="progress-range-options">
            <section className="progress-range-section" aria-labelledby="progress-program-label">
              <strong id="progress-program-label">Program</strong>
              <div className="progress-picker-options">
                {[{ id: 'all', name: 'All programs' }, ...programOptions].map((program) => (
                  <button className={`progress-picker-option${program.id === (rangeDraft?.programId ?? programId) ? ' selected' : ''}`} type="button"
                    key={program.id} aria-pressed={program.id === (rangeDraft?.programId ?? programId)}
                    onClick={() => selectRange({ programId: program.id })}><span>{program.name}</span></button>
                ))}
              </div>
            </section>
            <section className="progress-range-section" aria-labelledby="progress-period-label">
              <strong id="progress-period-label">Time period</strong>
              <div className="ex-segment progress-period" role="group" aria-label="Progress time period">
                {PROGRESS_PERIODS.map((item) => (
                  <button className={(rangeDraft?.period ?? period) === item.value ? 'sel' : undefined} key={item.value} type="button"
                    aria-label={item.ariaLabel} aria-pressed={(rangeDraft?.period ?? period) === item.value}
                    onClick={() => selectRange({ period: item.value })}>
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={() => onPickerChange(null)}>Cancel</button>
            <button className="primary-action" type="button" onClick={applyRange}>Apply</button>
          </div>
        </Dialog>
      )}

      {picker === 'exercise' && exerciseOptions.length > 0 && (
        <Dialog title="Choose exercise">
          <div className="progress-exercise-groups">
            {CATEGORIES.map((category) => {
              const items = exerciseOptions.filter((item) => item.category === category)
              if (items.length === 0) return null
              return (
                <section className="progress-exercise-group" key={category} aria-labelledby={`progress-group-${category}`}>
                  <strong id={`progress-group-${category}`}>{categoryLabel(category)}</strong>
                  <div className="progress-picker-options">
                    {items.map((item) => {
                      const context = `${item.workoutName}${programId === 'all' ? ` · ${item.programName}` : ''}`
                      return (
                        <button className={`progress-picker-option${item.exerciseId === selectedExerciseId ? ' selected' : ''}`} type="button"
                          key={item.exerciseId} aria-pressed={item.exerciseId === selectedExerciseId} onClick={() => {
                            if (item.exerciseId !== selectedExerciseId) select({ exerciseId: item.exerciseId })
                            onPickerChange(null)
                          }}>
                          <span><strong>{item.name}</strong><small>{context}</small></span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
          <button className="choice-cancel" type="button" onClick={() => onPickerChange(null)}>Cancel</button>
        </Dialog>
      )}
    </>
  )
}
