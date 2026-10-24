import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'

interface IncomeExpenseChartProps {
  title: string
  points: TrendPoint[]
  currencyCode: string
  currentPeriod?: string
}

interface TooltipPayloadEntry {
  color: string
  name: string
  value: number | null
  dataKey: string
  payload: TrendPoint & { incomePct: number; expensePct: number; isCurrent: boolean }
}

function ChartTooltip({ active, payload, label, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string; currencyCode: string }) {
  if (!active || !payload?.length) return null

  const income = payload.find(p => p.dataKey === 'incomePct')?.payload?.totalIncome ?? 0
  const expense = payload.find(p => p.dataKey === 'expensePct')?.payload?.totalExpense ?? 0
  const savings = income - expense

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ width: 10, height: 2, background: 'var(--accent)', flex: '0 0 auto' }} />
        <span className="mono" style={{ fontWeight: 700 }}>
          {formatCurrency(income, currencyCode)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Income</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ width: 10, height: 2, background: 'var(--outflow)', flex: '0 0 auto' }} />
        <span className="mono" style={{ fontWeight: 700 }}>
          {formatCurrency(expense, currencyCode)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Expense</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
        <span className="mono" style={{ fontWeight: 700, color: savings >= 0 ? 'var(--amount-positive)' : 'var(--danger)' }}>
          {savings >= 0 ? '+' : ''}{((savings / income) * 100).toFixed(1)}%
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Savings</span>
      </div>
    </div>
  )
}

export function IncomeExpenseChart({ title, points, currencyCode, currentPeriod }: IncomeExpenseChartProps) {
  if (points.length === 0) {
    return (
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <p style={{ color: 'var(--text-muted)' }}>No data for this period.</p>
      </div>
    )
  }

  const data = points.map((p) => {
    const total = p.totalIncome + p.totalExpense
    const incomePct = total > 0 ? (p.totalIncome / total) * 100 : 0
    const expensePct = total > 0 ? (p.totalExpense / total) * 100 : 0
    const isCurrent = currentPeriod ? p.period === currentPeriod : false

    return {
      ...p,
      incomePct,
      expensePct,
      isCurrent,
    }
  })

  return (
    <div>
      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
            width={48}
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--border)', opacity: 0.2 }} isAnimationActive={false} />
          <Bar dataKey="expensePct" stackId="stack" radius={[0, 0, 0, 0]} maxBarSize={20}>
            {data.map((entry, i) => (
              <Cell key={i} fill="var(--outflow)" opacity={entry.isCurrent ? 1 : 0.35} />
            ))}
          </Bar>
          <Bar dataKey="incomePct" stackId="stack" radius={[4, 4, 0, 0]} maxBarSize={20}>
            {data.map((entry, i) => (
              <Cell key={i} fill="var(--accent)" opacity={entry.isCurrent ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
