import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Category, CategoryBreakdownPoint } from 'shared-types'
import { categoryColor } from '../../lib/categoryColor'
import { formatCurrency } from '../../lib/formatCurrency'

const FALLBACK_SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
]

interface CategoryPieChartProps {
  title: string
  points: CategoryBreakdownPoint[]
  categories: Category[]
  currencyCode: string
}

interface TooltipPayloadEntry {
  color: string
  payload: CategoryBreakdownPoint
}

function CategoryTooltip({ active, payload, total, currencyCode }: { active?: boolean; payload?: TooltipPayloadEntry[]; total: number; currencyCode: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const percent = total > 0 ? (entry.payload.total / total) * 100 : 0
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.5rem 0.75rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: entry.color, flex: '0 0 auto' }} />
        {entry.payload.categoryName}
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: '1rem' }}>
        {formatCurrency(entry.payload.total, currencyCode)}{' '}
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>· {percent.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function CategoryLegend({ payload }: { payload?: { value: string; color: string }[] }) {
  if (!payload?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
      {payload.map((entry) => (
        <span key={entry.value} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: entry.color, flex: '0 0 auto' }} />
          {entry.value}
        </span>
      ))}
    </div>
  )
}

export function CategoryPieChart({ title, points, categories, currencyCode }: CategoryPieChartProps) {
  const total = points.reduce((sum, p) => sum + p.total, 0)

  return (
    <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
      <h2 style={{ fontSize: '1rem' }}>{title}</h2>
      {points.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No data for this range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={points}
              dataKey="total"
              nameKey="categoryName"
              cx="50%"
              cy="45%"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={points.length > 1 ? 3 : 0}
              cornerRadius={6}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {/* Colors match the per-category indicator shown in the ledger
                  (see lib/categoryColor.ts) — same category, same hue,
                  everywhere in the app. Beyond the 8 validated hues, colors
                  cycle; identity for the 9th+ category still relies on the
                  legend/tooltip text, not color alone. */}
              {points.map((point, index) => (
                <Cell
                  key={point.categoryId ?? 'uncategorized'}
                  fill={categoryColor(point.categoryId, categories) ?? FALLBACK_SERIES_COLORS[index % FALLBACK_SERIES_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CategoryTooltip total={total} currencyCode={currencyCode} />} isAnimationActive={false} />
            <Legend content={<CategoryLegend />} verticalAlign="bottom" />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
