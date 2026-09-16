import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmountKind, BucketGranularity, TimeseriesPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'

interface TimeseriesChartProps {
  title: string
  seriesName: string
  kind: AmountKind
  granularity: BucketGranularity
  points: TimeseriesPoint[]
  currencyCode: string
}

const MOVING_AVERAGE_LABEL: Record<BucketGranularity, string> = {
  daily: '7-day moving average',
  weekly: '4-week moving average',
  monthly: '3-month moving average',
}

// Income and expense reuse the same semantic colors as the ledger and account
// balances (var(--accent) for money in, var(--outflow) for money out) rather
// than a generic categorical hue — this chart plots one metric over time, not
// category identity, so tying it to the app's existing income/expense color
// language reads as more consistent than an arbitrary series color.
const TONE_COLOR: Record<AmountKind, string> = {
  income: 'var(--accent)',
  expense: 'var(--outflow)',
}

interface TooltipPayloadEntry {
  color: string
  name: string
  value: number
  dataKey: string
}

function TimeseriesTooltip({ active, payload, label, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string; currencyCode: string }) {
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
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 10, height: 2, background: entry.color, flex: '0 0 auto' }} />
          <span className="mono" style={{ fontWeight: 700 }}>
            {entry.value === null ? '—' : formatCurrency(entry.value, currencyCode)}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{entry.name}</span>
        </div>
      ))}
    </div>
  )
}

function TimeseriesLegend({ payload }: { payload?: { value: string; color: string; type?: string }[] }) {
  if (!payload?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
      {payload.map((entry) => (
        <span key={entry.value} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {entry.type === 'line' ? (
            <span style={{ width: 10, height: 2, background: entry.color, flex: '0 0 auto' }} />
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: '2px', background: entry.color, flex: '0 0 auto' }} />
          )}
          {entry.value}
        </span>
      ))}
    </div>
  )
}

export function TimeseriesChart({ title, seriesName, kind, granularity, points, currencyCode }: TimeseriesChartProps) {
  const toneColor = TONE_COLOR[kind]

  return (
    <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
      <h2 style={{ fontSize: '1rem' }}>
        {title} ({granularity})
      </h2>
      {points.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No data for this range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="bucketLabel" stroke="var(--border)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} />
            <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} width={48} />
            <Tooltip content={<TimeseriesTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} isAnimationActive={false} />
            <Legend content={<TimeseriesLegend />} />
            <Bar dataKey="total" name={seriesName} fill={toneColor} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line
              dataKey="movingAverage"
              name={MOVING_AVERAGE_LABEL[granularity]}
              stroke="var(--text-muted)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
