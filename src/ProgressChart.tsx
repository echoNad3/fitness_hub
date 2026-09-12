import type { ProgressMetric, ProgressPoint, ProgressSeries } from './progressAnalysis'
import { formatProgressValue } from './progressAnalysis'
import { muscleColor } from './workoutPresentation'

const CHART_WIDTH = 320
const CHART_HEIGHT = 224
const PLOT_LEFT = 40
const PLOT_RIGHT = 310
const PLOT_TOP = 12
const PLOT_BOTTOM = 194

type ChartDomain = {
  min: number
  max: number
  ticks: number[]
}

function niceStep(value: number) {
  const power = 10 ** Math.floor(Math.log10(Math.max(value, Number.EPSILON)))
  const fraction = value / power
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return niceFraction * power
}

function buildChartDomain(values: number[]): ChartDomain {
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const rawRange = rawMax - rawMin
  const padding = rawRange > 0 ? rawRange * 0.12 : rawMax > 0 ? Math.max(1.25, rawMax * 0.08) : 2.5
  const paddedMin = Math.max(0, rawMin - padding)
  const paddedMax = rawMax + padding
  const step = niceStep((paddedMax - paddedMin) / 4)
  const min = rawMin === 0 ? 0 : Math.floor(paddedMin / step) * step
  const max = Math.max(step, Math.ceil(paddedMax / step) * step)
  const ticks: number[] = []
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value * 100) / 100)
  }
  return { min, max, ticks }
}

function formatAxisValue(value: number) {
  if (value >= 100) return `${Math.round(value)}`
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

function formatChartDate(timestamp: number, includeYear = false) {
  return new Intl.DateTimeFormat(
    undefined,
    includeYear ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' },
  ).format(timestamp)
}

function formatPointDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp)
}

function changeLabel(points: ProgressSeries['points']) {
  const change = Math.round((points[points.length - 1].value - points[0].value) * 10) / 10
  if (change === 0) return 'No change'
  return `${change > 0 ? '+' : '−'}${formatProgressValue(Math.abs(change))}`
}

export function ProgressChart({ series, metric, onOpenWorkout }: {
  series: ProgressSeries
  metric: ProgressMetric
  onOpenWorkout: (sessionId: string) => void
}) {
  const points = series.points
  const weightLabel = (point: ProgressPoint) => `${point.load} kg ${point.perHand ? 'per hand' : 'total'}`
  const pointLabel = (point: ProgressPoint) =>
    `${formatPointDate(point.createdAt)} · ${weightLabel(point)} · ${point.reps} reps · ${point.result === 'success' ? 'Done' : 'Failed'}`
  const values = points.map((point) => point.value)
  const dates = points.map((point) => point.createdAt)
  const minDate = Math.min(...dates)
  const maxDate = Math.max(...dates)
  const dateRange = maxDate - minDate
  const domain = buildChartDomain(values)
  const valueRange = domain.max - domain.min
  const x = (timestamp: number) =>
    dateRange === 0
      ? (PLOT_LEFT + PLOT_RIGHT) / 2
      : PLOT_LEFT + ((timestamp - minDate) / dateRange) * (PLOT_RIGHT - PLOT_LEFT)
  const y = (value: number) =>
    PLOT_BOTTOM - ((value - domain.min) / valueRange) * (PLOT_BOTTOM - PLOT_TOP)
  const includeAxisYear = new Date(minDate).getFullYear() !== new Date(maxDate).getFullYear()
  const firstDateLabel = formatChartDate(minDate, includeAxisYear)
  const lastDateLabel = formatChartDate(maxDate, includeAxisYear)
  const dateTicks =
    dateRange === 0 || firstDateLabel === lastDateLabel
      ? [{ value: minDate, anchor: 'middle' as const }]
      : [
          { value: minDate, anchor: 'start' as const },
          { value: minDate + dateRange / 2, anchor: 'middle' as const },
          { value: maxDate, anchor: 'end' as const },
        ]
  const chartLabel = metric === 'load' ? 'Logged weight' : 'Estimated one rep max'
  const latest = series.points[series.points.length - 1]
  const change = latest.value - series.points[0].value
  const latestMeasure = metric === 'load'
    ? weightLabel(latest)
    : `${formatProgressValue(latest.value)} estimated`
  const attemptMeasure = (point: ProgressPoint) => metric === 'load'
    ? weightLabel(point) : `${formatProgressValue(point.value)} estimated`
  const doneCount = points.filter((point) => point.result === 'success').length
  const failedCount = points.length - doneCount
  const color = muscleColor(series.category)
  const path = series.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.createdAt)} ${y(point.value)}`)
    .join(' ')

  return (
    <>
      <svg
          className="progress-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`${series.name} ${chartLabel.toLowerCase()} chart. ${points.length} attempts: ${doneCount} done, ${failedCount} failed.`}
        >
          <title>{chartLabel} over time</title>
          <text className="progress-chart-unit" x={PLOT_LEFT} y={PLOT_TOP}>kg</text>
          {domain.ticks.map((tick) => (
            <g key={tick}>
              <line className="progress-grid-line" x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y(tick)} y2={y(tick)} />
              <text className="progress-y-label" x={PLOT_LEFT - 7} y={y(tick)}>{formatAxisValue(tick)}</text>
            </g>
          ))}
          {dateTicks.map((tick, index) => (
            <text
              className="progress-x-label"
              key={`${tick.value}-${index}`}
              x={dateRange === 0 || firstDateLabel === lastDateLabel ? (PLOT_LEFT + PLOT_RIGHT) / 2 : x(tick.value)}
              y={CHART_HEIGHT - 5}
              textAnchor={tick.anchor}
            >
              {formatChartDate(tick.value, includeAxisYear)}
            </text>
          ))}
          <g className="progress-series">
            {points.length > 1 && <path className="progress-series-path" d={path} stroke={color} />}
            {series.points.map((point) => (
              <circle
                className={`progress-point${point.result === 'failure' ? ' failed' : ''}`}
                key={point.sessionId}
                cx={x(point.createdAt)}
                cy={y(point.value)}
                r={3.5}
                fill={point.result === 'failure' ? 'var(--surface)' : color}
                stroke={color}
              >
                <title>{pointLabel(point)}</title>
              </circle>
            ))}
          </g>
        </svg>

      <button className="progress-latest-attempt" type="button" onClick={() => onOpenWorkout(latest.sessionId)}>
        <span className="progress-latest-main">
          <small>Latest attempt</small>
          <strong>{formatPointDate(latest.createdAt)}</strong>
          <span>{latestMeasure} · <em className={latest.result === 'success' ? 'result-done' : 'result-failed'}>{latest.result === 'success' ? 'Done' : 'Failed'}</em></span>
        </span>
        {points.length > 1 && <span className="progress-period-change">
          <strong className={change > 0 ? 'up' : change < 0 ? 'down' : undefined}
            aria-label={`Period change ${changeLabel(series.points)}`}>
            {changeLabel(series.points)}
          </strong>
        </span>}
        <span className="progress-picker-chevron progress-latest-chevron" aria-hidden="true" />
      </button>

      {points.length > 1 && <details className="progress-attempts">
        <summary><span>View previous attempts</span><span className="progress-picker-chevron" aria-hidden="true" /></summary>
        <div className="progress-attempt-list">
          {points.slice(0, -1).reverse().map((point) => (
            <button type="button" key={point.sessionId} onClick={() => onOpenWorkout(point.sessionId)}>
              <span><strong>{formatPointDate(point.createdAt)}</strong><small>{attemptMeasure(point)}</small></span>
              <em className={point.result === 'success' ? 'result-done' : 'result-failed'}>{point.result === 'success' ? 'Done' : 'Failed'}</em>
              <span className="progress-picker-chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
      </details>}
    </>
  )
}
