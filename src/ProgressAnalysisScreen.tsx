import { useState } from 'react'
import { haptics } from './haptics'
import { ProgressChart } from './ProgressChart'
import {
  buildProgressSeries,
  PROGRESS_PERIODS,
  progressPeriodLabel,
  type ProgressMetric,
  type ProgressPeriod,
} from './progressAnalysis'
import type { Category } from './workoutTypes'
import { CATEGORIES, categoryLabel, muscleColorStyle } from './workoutPresentation'

type ProgressAnalysisScreenProps = {
  templates: Parameters<typeof buildProgressSeries>[0]
  sessions: Parameters<typeof buildProgressSeries>[1]
}

export default function ProgressAnalysisScreen({ templates, sessions }: ProgressAnalysisScreenProps) {
  const [category, setCategory] = useState<Category>('CHEST')
  const [metric, setMetric] = useState<ProgressMetric>('load')
  const [period, setPeriod] = useState<ProgressPeriod>('all')
  const series = buildProgressSeries(templates, sessions, {
    category,
    metric,
    period,
    now: Date.now(),
  })
  const metricLabel = metric === 'load' ? 'Total load' : 'Estimated 1RM'
  const periodLabel = progressPeriodLabel(period)
  const emptyText =
    metric === 'estimated-1rm'
      ? `No estimated 1RM data for ${categoryLabel(category).toLowerCase()} ${period === 'all' ? 'in your history' : `in the ${periodLabel.toLowerCase()}`}.`
      : `No load data for ${categoryLabel(category).toLowerCase()} ${period === 'all' ? 'in your history' : `in the ${periodLabel.toLowerCase()}`}.`

  return (
    <>
      <section className="progress-controls" aria-label="Progress filters">
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
      </section>

      <section className="progress-card" aria-label={`${categoryLabel(category)} progress`}>
        <div className="progress-card-head">
          <span className="progress-card-title">
            <strong>{categoryLabel(category)}</strong>
            <small>{metricLabel} · {periodLabel}</small>
          </span>
          <span className="progress-series-count">
            {series.length} {series.length === 1 ? 'exercise' : 'exercises'}
          </span>
        </div>

        {series.length > 0 ? (
          <ProgressChart series={series} metric={metric} />
        ) : (
          <div className="progress-empty">
            <p className="empty-state">{emptyText}</p>
          </div>
        )}

        <p className="progress-note">
          {metric === 'load'
            ? 'Per-hand weights are doubled. Hollow points are failed attempts.'
            : 'Based on saved weight and reps (1–30). Per-hand weights are doubled. Hollow points are failed attempts.'}
        </p>
      </section>
    </>
  )
}
