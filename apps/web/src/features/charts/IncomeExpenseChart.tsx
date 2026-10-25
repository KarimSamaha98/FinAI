import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { ColumnHitTargets } from './ColumnHitTargets'

interface IncomeExpenseChartProps {
  title: string
  /** Shown beside the title, e.g. the visible date range. */
  subtitle?: string
  points: TrendPoint[]
  currencyCode: string
  currentPeriod?: string
  /** Called with a point's period ('yyyy-MM' or 'yyyy') when its bar is clicked. */
  onSelectPeriod?: (period: string) => void
  /** Page the window; an omitted handler disables that arrow (no data further that way). */
  onPageBack?: () => void
  onPageForward?: () => void
  /** How far one arrow press moves, for the buttons' accessible labels. */
  stepLabel?: string
}

function ChartHeader({ title, subtitle, onPageBack, onPageForward, stepLabel }: Pick<IncomeExpenseChartProps, 'title' | 'subtitle' | 'onPageBack' | 'onPageForward' | 'stepLabel'>) {
  const showArrows = Boolean(stepLabel)
  return (
    <div className="chart-header">
      <h4 className="chart-header-title">
        {title}
        {subtitle && <span className="chart-header-subtitle">{subtitle}</span>}
      </h4>
      {showArrows && (
        <div className="chart-header-arrows">
          <button type="button" className="icon-button icon-button--small" onClick={onPageBack} disabled={!onPageBack} aria-label={`Back ${stepLabel}`}>
            <ChevronLeftIcon />
          </button>
          <button type="button" className="icon-button icon-button--small" onClick={onPageForward} disabled={!onPageForward} aria-label={`Forward ${stepLabel}`}>
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </div>
  )
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
        <span style={{ width: 10, height: 2, background: 'var(--amount-positive)', flex: '0 0 auto' }} />
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

export function IncomeExpenseChart({ title, subtitle, points, currencyCode, currentPeriod, onSelectPeriod, onPageBack, onPageForward, stepLabel }: IncomeExpenseChartProps) {
  const header = <ChartHeader title={title} subtitle={subtitle} onPageBack={onPageBack} onPageForward={onPageForward} stepLabel={stepLabel} />
  if (points.length === 0) {
    return (
      <div>
        {header}
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
      {header}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
          style={onSelectPeriod ? { cursor: 'pointer' } : undefined}
        >
          <XAxis
            dataKey="label"
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
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
              <Cell key={i} fill="var(--amount-positive)" opacity={entry.isCurrent ? 1 : 0.35} />
            ))}
          </Bar>
          {onSelectPeriod && <ColumnHitTargets count={data.length} onPick={(i) => onSelectPeriod(data[i].period)} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
