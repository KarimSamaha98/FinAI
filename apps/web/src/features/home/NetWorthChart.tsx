import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BucketGranularity, NetWorthSeriesPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'

interface NetWorthChartProps {
  points: NetWorthSeriesPoint[]
  granularity: BucketGranularity
  currencyCode: string
}

interface TooltipEntry {
  value: number
}

function NetWorthTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  currencyCode: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.5rem 0.75rem',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{label}</div>
      <div className="mono" style={{ fontWeight: 700 }}>
        {formatCurrency(payload[0].value, currencyCode)}
      </div>
    </div>
  )
}

export function NetWorthChart({ points, granularity, currencyCode }: NetWorthChartProps) {
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
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="bucketLabel" stroke="var(--border)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            width={56}
            tickFormatter={(value: number) => compactCurrency.format(value)}
          />
          <Tooltip content={<NetWorthTooltip currencyCode={currencyCode} />} cursor={{ stroke: 'var(--border)' }} isAnimationActive={false} />
          {/* Same semantic color as the hero's positive total — one metric
              over time, not a categorical series. */}
          <Line dataKey="total" name={`Net worth (${granularity})`} stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
