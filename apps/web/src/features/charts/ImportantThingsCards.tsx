import type { CategoryChange } from 'shared-types'
import { Card } from '../../components/Card'
import { StatGrid } from './StatGrid'

const MIN_CHANGE_PERCENT = 10
const MAX_TILES = 4

interface CategoryChangesCardProps {
  changes: CategoryChange[]
  filterKind?: 'expense' | 'income'
  title?: string
  hint?: string
  loading?: boolean
}

export function CategoryChangesCard({ changes, filterKind, title = 'Changes', hint, loading }: CategoryChangesCardProps) {
  const filtered = filterKind
    ? changes.filter(c => c.kind === filterKind)
    : changes

  if (loading) {
    return (
      <Card style={{ padding: 'var(--space-4)' }}>
        <h4 className="insights-subheader">{title}</h4>
        {hint && <p className="insights-hint">{hint}</p>}
        <div className="changes-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-grouped)', minHeight: '4.5rem' }} />
          ))}
        </div>
      </Card>
    )
  }

  const significant = filtered
    .filter(c => Math.abs(c.percentChange) >= MIN_CHANGE_PERCENT)
    .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
    .slice(0, MAX_TILES)

  if (significant.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 className="insights-subheader">{title}</h4>
      {hint && <p className="insights-hint">{hint}</p>}
      <StatGrid
        items={significant.map((change) => ({
          key: `${change.categoryId ?? 'uncategorized'}-${change.type}`,
          label: change.categoryName,
          value: `${change.percentChange > 0 ? '+' : ''}${change.percentChange.toFixed(0)}%`,
          color: change.type === 'expense_spike' || change.type === 'income_reduction' ? 'var(--danger)' : 'var(--amount-positive)',
        }))}
      />
    </Card>
  )
}
