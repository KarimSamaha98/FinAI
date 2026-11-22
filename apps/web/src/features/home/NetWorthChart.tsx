import { useId, useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BucketGranularity, NetWorthSeriesPoint } from 'shared-types'
import { formatCurrency, maskedCurrency } from '../../lib/formatCurrency'
import { usePrivacy } from '../../context/PrivacyContext'

interface NetWorthChartProps {
  points: NetWorthSeriesPoint[]
  granularity: BucketGranularity
  currencyCode: string
  height?: number
}

const AXIS_FONT_SIZE = 12
/** Space between a label and the plot. */
const AXIS_TICK_MARGIN = 8
/** Recharts offsets labels by the tick-line length even when the line is hidden. */
const AXIS_TICK_SIZE = 6

/**
 * Round tick values covering 0 and the data (like the chart's own default
 * axis), so the labels are known before rendering and can be measured.
 */
function niceTicks(values: number[], targetCount = 4): number[] {
  let min = Math.min(0, ...values)
  let max = Math.max(0, ...values)
  if (min === max) max = min + 1
  const rawStep = (max - min) / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude
  min = Math.floor(min / step) * step
  max = Math.ceil(max / step) * step
  const ticks: number[] = []
  // Index-based, so float steps (0.1 + 0.2…) don't drift.
  for (let i = 0; min + i * step <= max + step / 2; i++) ticks.push(Number((min + i * step).toPrecision(12)))
  return ticks
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** Rendered width of a label in the axis font (the page's own font family). */
function textWidth(text: string): number {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * AXIS_FONT_SIZE * 0.62
  measureContext.font = `${AXIS_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`
  return measureContext.measureText(text).width
}

interface TooltipEntry {
  value: number
}

function NetWorthTooltip({
  active,
  payload,
  label,
  currencyCode,
  hidden,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  currencyCode: string
  hidden: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="net-worth-tooltip">
      <div className="net-worth-tooltip-label">{label}</div>
      <div className="mono net-worth-tooltip-value">{hidden ? maskedCurrency(currencyCode) : formatCurrency(payload[0].value, currencyCode)}</div>
    </div>
  )
}

/**
 * Net worth over time: one metric, so one accent-coloured line over a soft
 * gradient fill that fades to nothing. In privacy mode the trend stays; the
 * axis labels read "—" and the tooltip is masked.
 */
export function NetWorthChart({ points, granularity, currencyCode, height = 260 }: NetWorthChartProps) {
  const { hidden } = usePrivacy()
  // Unique per chart, so two charts on a page never share a gradient.
  const gradientId = `net-worth-fill-${useId().replace(/:/g, '')}`

  const compactCurrency = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 1 }),
    [currencyCode],
  )
  const formatTick = (value: number) => (hidden ? '—' : compactCurrency.format(value))
  const ticks = useMemo(() => niceTicks(points.map((p) => p.total)), [points])
  // As wide as the widest amount label, whatever the digits, sign or currency
  // symbol ("CA$140K", "-CHF 1.2M"), so none is ever cut off. Measured on the
  // amounts even in privacy mode (the dashes sit right-aligned in the same
  // space), so hiding or revealing never shifts the plot.
  const axisWidth =
    Math.ceil(Math.max(...ticks.map((tick) => textWidth(compactCurrency.format(tick))))) + AXIS_TICK_MARGIN + AXIS_TICK_SIZE + 2

  if (points.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No data for this range.</p>
  }

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--separator)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="bucketLabel"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: AXIS_FONT_SIZE }}
            tickMargin={AXIS_TICK_MARGIN}
            width={axisWidth}
            ticks={ticks}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            interval={0}
            tickFormatter={formatTick}
          />
          <Tooltip
            content={<NetWorthTooltip currencyCode={currencyCode} hidden={hidden} />}
            cursor={{ stroke: 'var(--accent)', strokeOpacity: 0.35, strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="total"
            name={`Net worth (${granularity})`}
            stroke="var(--accent)"
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--accent)' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
