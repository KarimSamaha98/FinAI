import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmountKind, HeatmapDay } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { format, parseISO } from 'date-fns'

interface MonthlyBarChartProps {
  title: string
  days: HeatmapDay[]
  kind: AmountKind
  currencyCode: string
}

interface TooltipPayloadEntry {
  payload: { monthLabel: string; total: number }
}

function ChartTooltip({ active, payload, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; currencyCode: string }) {
  if (!active || !payload?.length) return null
  const { monthLabel, total } = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.4rem 0.65rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{monthLabel}</div>
      <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
        {formatCurrency(total, currencyCode)}
      </div>
    </div>
  )
}

export function MonthlyBarChart({ title, days, kind, currencyCode }: MonthlyBarChartProps) {
  const monthlyData = useMemo(() => {
    const totals = new Map<string, number>()
    for (const day of days) {
      const monthKey = day.date.slice(0, 7)
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + day.total)
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, total]) => ({
        monthKey,
        monthLabel: format(parseISO(monthKey + '-01'), 'MMM'),
        total,
      }))
  }, [days])

  if (monthlyData.length === 0) {
    return (
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <p style={{ color: 'var(--text-muted)' }}>No data for this period.</p>
      </div>
    )
  }

  const barColor = kind === 'expense' ? 'var(--outflow)' : 'var(--amount-positive)'

  return (
    <div>
      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barSize={28} barGap={4}>
          <XAxis
            dataKey="monthLabel"
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v: number) => {
              if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
              return `$${v}`
            }}
            width={48}
          />
          <Tooltip
            content={<ChartTooltip currencyCode={currencyCode} />}
            cursor={{ fill: 'var(--border)', opacity: 0.2 }}
            isAnimationActive={false}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {monthlyData.map((_, i) => (
              <Cell key={i} fill={barColor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
