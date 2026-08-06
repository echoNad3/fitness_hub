import type { ProgressMetric, ProgressSeries } from './progressAnalysis'
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
  if (points.length < 2) return 'First attempt'
  const change = Math.round((points[points.length - 1].value - points[0].value) * 10) / 10
  if (change === 0) return 'No change'
  return `${change > 0 ? '+' : '−'}${formatProgressValue(Math.abs(change))}`
}

export function ProgressChart({ series, metric }: { series: ProgressSeries; metric: ProgressMetric }) {
  const points = series.points
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
  const chartLabel = metric === 'load' ? 'Total load' : 'Estimated one rep max'
  const latest = series.points[series.points.length - 1]
  const change = latest.value - series.points[0].value
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
        aria-label={`${series.name} ${chartLabel.toLowerCase()} chart`}
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
          {series.points.length > 1 && (
            <path className="progress-series-path" d={path} stroke={color} />
          )}
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
              <title>
                {`${series.name} · ${formatPointDate(point.createdAt)} · ${formatProgressValue(point.value)} · ${point.reps} ${point.reps === 1 ? 'rep' : 'reps'} · ${point.result === 'success' ? 'Done' : 'Failed'}`}
              </title>
            </circle>
          ))}
        </g>
      </svg>

      <div className="progress-chart-summary" aria-label="Exercise summary">
        <span>
          <small>Latest</small>
          <strong>{formatProgressValue(latest.value)}</strong>
        </span>
        <span>
          <small>Trend</small>
          <strong className={change > 0 ? 'up' : change < 0 ? 'down' : undefined}>
            {changeLabel(series.points)}
          </strong>
        </span>
      </div>
    </>
  )
}
