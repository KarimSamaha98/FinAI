import { useId } from 'react'
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

  if (points.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No data for this range.</p>
  }

  const compactCurrency = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  })

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
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            width={56}
            tickFormatter={(value: number) => (hidden ? '—' : compactCurrency.format(value))}
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
