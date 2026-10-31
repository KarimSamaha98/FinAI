import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmountKind, CategoryBreakdownPoint } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { categoryKey } from './drillDown'
import { ColumnHitTargets } from './ColumnHitTargets'

interface CategoryBarChartProps {
  title: string
  points: CategoryBreakdownPoint[]
  kind: AmountKind
  currencyCode: string
  loading?: boolean
  /** Called with the category key when a bar is clicked. */
  onSelect?: (key: string) => void
  /** The currently-selected category key — highlighted with an accent ring. */
  selectedKey?: string | null
}

interface TooltipPayloadEntry {
  payload: CategoryBreakdownPoint
}

function CategoryBarTooltip({ active, payload, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; currencyCode: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
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
      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.15rem' }}>
        {entry.payload.categoryName}
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
        {formatCurrency(entry.payload.total, currencyCode)}
      </div>
    </div>
  )
}

const TONE_COLOR: Record<AmountKind, string> = {
  income: 'var(--amount-positive)',
  expense: 'var(--outflow)',
}

const BAR_HEIGHT = 20

export function CategoryBarChart({ title, points, kind, currencyCode, loading, onSelect, selectedKey }: CategoryBarChartProps) {
  if (loading) {
    const skeletonCount = 4
    const skeletonPoints = Array.from({ length: skeletonCount }, (_, i) => ({
      categoryId: `skel-${i}`,
      categoryName: '',
      total: Math.max(100, 1000 - i * 200),
    }))
    const chartHeight = skeletonCount * (BAR_HEIGHT + 12) + 8

    return (
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={skeletonPoints}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            barSize={BAR_HEIGHT}
            barGap={12}
          >
            <XAxis type="number" hide domain={[0, 1200]} />
            <YAxis type="category" dataKey="categoryName" width={140} tick={false} tickLine={false} axisLine={false} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]}>
              {skeletonPoints.map((_, i) => (
                <Cell key={i} fill="var(--surface-raised)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <p style={{ color: 'var(--text-muted)' }}>No data for this period.</p>
      </div>
    )
  }

  const maxTotal = Math.max(...points.map((p) => p.total))
  const chartHeight = points.length * (BAR_HEIGHT + 12) + 8
  const barColor = TONE_COLOR[kind]

  return (
    <div>
      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={points}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          barSize={BAR_HEIGHT}
          barGap={12}
        >
          <XAxis type="number" hide domain={[0, maxTotal * 1.15]} />
          <YAxis
            type="category"
            dataKey="categoryName"
            width={140}
            tick={{ fill: 'var(--text)', fontSize: 13 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CategoryBarTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--border)', opacity: 0.2 }} isAnimationActive={false} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {points.map((point) => {
              const isSelected = selectedKey === categoryKey(point.categoryId)
              return (
                <Cell
                  key={categoryKey(point.categoryId)}
                  fill={barColor}
                  opacity={selectedKey && !isSelected ? 0.45 : 1}
                  stroke={isSelected ? 'var(--accent)' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                />
              )
            })}
          </Bar>
          {onSelect && <ColumnHitTargets count={points.length} layout="vertical" onPick={(i) => onSelect(categoryKey(points[i].categoryId))} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
