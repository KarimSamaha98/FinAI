import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts'
import type { TrendPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { ColumnHitTargets } from './ColumnHitTargets'

interface IncomeExpenseChartProps {
  title?: string
  subtitle?: string
  points: TrendPoint[]
  currencyCode: string
  currentPeriod?: string
  onSelectPeriod?: (period: string) => void
  onPageBack?: () => void
  onPageForward?: () => void
  stepLabel?: string
  loading?: boolean
}

function ChartHeader({ title, subtitle, onPageBack, onPageForward, stepLabel }: Pick<IncomeExpenseChartProps, 'title' | 'subtitle' | 'onPageBack' | 'onPageForward' | 'stepLabel'>) {
  const showArrows = Boolean(stepLabel)
  return (
    <div className="chart-header">
      {title && <h4 className="chart-header-title">{title}</h4>}
      {subtitle && <span className="chart-header-subtitle">{subtitle}</span>}
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
  payload: { label: string; income: number; expense: number; isCurrent: boolean }
}

function ChartTooltip({ active, payload, label, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string; currencyCode: string }) {
  if (!active || !payload?.length) return null

  const dataPoint = payload[0].payload
  const income = dataPoint.income
  const expense = Math.abs(dataPoint.expense)
  const savings = income - expense
  const savingsRate = income > 0 ? (savings / income) * 100 : 0

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
          {savings >= 0 ? '+' : ''}{formatCurrency(savings, currencyCode)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          Savings ({savingsRate.toFixed(1)}%)
        </span>
      </div>
    </div>
  )
}

const BAR_COLOR_INCOME = 'var(--amount-positive)'
const BAR_COLOR_EXPENSE = 'var(--outflow)'
const BAR_OPACITY_IDLE = 0.5
const BAR_OPACITY_ACTIVE = 1

function BidirectionalBarShape(props: BarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props
  const income = payload?.income ?? 0
  const expense = payload?.expense ?? 0
  const isCurrent = payload?.isCurrent ?? false
  const zeroY = y + height

  if (income === 0 && expense === 0) return null

  const pixelsPerUnit = income > 0 ? height / income : 1
  const expenseHeight = Math.abs(expense) * pixelsPerUnit

  const opacity = isCurrent ? BAR_OPACITY_ACTIVE : BAR_OPACITY_IDLE
  const stroke = isCurrent ? 'var(--accent)' : 'transparent'
  const strokeWidth = isCurrent ? 2 : 0
  const rx = Math.min(4, height / 2, expenseHeight / 2)
  const expenseBottom = zeroY + expenseHeight

  return (
    <g>
      <path
        d={`
          M ${x} ${zeroY}
          L ${x} ${y + rx}
          Q ${x} ${y} ${x + rx} ${y}
          L ${x + width - rx} ${y}
          Q ${x + width} ${y} ${x + width} ${y + rx}
          L ${x + width} ${zeroY}
          Z
        `}
        fill={BAR_COLOR_INCOME}
        opacity={opacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <path
        d={`
          M ${x} ${zeroY}
          L ${x} ${expenseBottom - rx}
          Q ${x} ${expenseBottom} ${x + rx} ${expenseBottom}
          L ${x + width - rx} ${expenseBottom}
          Q ${x + width} ${expenseBottom} ${x + width} ${expenseBottom - rx}
          L ${x + width} ${zeroY}
          Z
        `}
        fill={BAR_COLOR_EXPENSE}
        opacity={opacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </g>
  )
}

export function IncomeExpenseChart({ title, subtitle, points, currencyCode, currentPeriod, onSelectPeriod, onPageBack, onPageForward, stepLabel, loading }: IncomeExpenseChartProps) {
  const header = <ChartHeader title={title} subtitle={subtitle} onPageBack={onPageBack} onPageForward={onPageForward} stepLabel={stepLabel} />

  if (loading) {
    const skeletonData = Array.from({ length: 12 }, (_, i) => ({
      label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
      period: `skel-${i}`,
      income: 0,
      expense: 0,
      totalIncome: 0,
      totalExpense: 0,
      isCurrent: false,
    }))

    return (
      <div>
        {header}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={skeletonData} margin={{ top: 28, right: 16, left: 0, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--border)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} interval={0} />
            <YAxis stroke="var(--border)" tick={false} tickLine={false} width={48} />
            <Bar dataKey="income" maxBarSize={20} shape={BidirectionalBarShape} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div>
        {header}
        <p style={{ color: 'var(--text-muted)' }}>No data for this period.</p>
      </div>
    )
  }

  const data = points.map((p) => {
    const isCurrent = currentPeriod ? p.period === currentPeriod : false
    return {
      ...p,
      income: p.totalIncome,
      expense: -p.totalExpense,
      isCurrent,
    }
  })

  const maxAbs = Math.max(...data.map(p => Math.max(p.income, p.totalExpense)), 1)
  const niceMax = maxAbs >= 1_000 ? Math.ceil(maxAbs / 1_000) * 1_000 : Math.ceil(maxAbs)
  const yMax = Math.max(niceMax * 1.15, 100)
  const tickStep = yMax >= 10_000 ? 5_000 : yMax >= 5_000 ? 2_000 : yMax >= 2_000 ? 1_000 : 500
  const yTicks = []
  for (let v = yMax; v > 0; v -= tickStep) yTicks.push(v)
  for (let v = 0; v >= -yMax; v -= tickStep) yTicks.push(v)

  return (
    <div>
      {header}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 28, right: 16, left: 0, bottom: 28 }}
          style={onSelectPeriod ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            stroke="var(--border)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            domain={[-yMax, yMax]}
            ticks={yTicks}
            tickFormatter={(v: number) => {
              if (v === 0) return '0'
              const abs = Math.abs(v)
              const val = abs >= 1_000 ? `${(abs / 1_000).toFixed(0)}K` : `${abs}`
              return v < 0 ? `\u2212${val}` : val
            }}
            width={48}
          />
          <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--border)', opacity: 0.2 }} isAnimationActive={false} />

          <Bar dataKey="income" maxBarSize={20} shape={BidirectionalBarShape} />

          {onSelectPeriod && <ColumnHitTargets count={data.length} onPick={(i) => onSelectPeriod(data[i].period)} />}
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR_COLOR_INCOME }} />
          Income
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR_COLOR_EXPENSE }} />
          Expense
        </span>
      </div>
    </div>
  )
}
