import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmountKind, CategoryBreakdownPoint } from 'shared-types'
import { categoryColor } from '../../lib/categoryColor'
import { formatCurrency } from '../../lib/formatCurrency'
import type { Category } from 'shared-types'

interface CategoryBarChartProps {
  title: string
  points: CategoryBreakdownPoint[]
  categories: Category[]
  kind: AmountKind
  currencyCode: string
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
  income: 'var(--accent)',
  expense: 'var(--outflow)',
}

const BAR_HEIGHT = 20
const BAR_GAP = 12

export function CategoryBarChart({ title, points, categories, kind, currencyCode }: CategoryBarChartProps) {
  if (points.length === 0) {
    return (
      <div>
        <h2 style={{ fontSize: '1rem' }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)' }}>No data for this period.</p>
      </div>
    )
  }

  const maxTotal = Math.max(...points.map((p) => p.total))
  const chartHeight = points.length * (BAR_HEIGHT + BAR_GAP) + BAR_GAP + 8

  return (
    <div>
      <h2 style={{ fontSize: '1rem' }}>{title}</h2>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={points} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={BAR_HEIGHT} barGap={BAR_GAP}>
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
            {points.map((point) => (
              <Cell
                key={point.categoryId ?? 'uncategorized'}
                fill={categoryColor(point.categoryId, categories) ?? TONE_COLOR[kind]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
