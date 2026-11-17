import type { CategoryChange, DashboardSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { formatCurrency } from '../../lib/formatCurrency'
import { StatTiles } from './StatGrid'
import { significantChangeTiles } from './categoryChanges'

interface SummaryCardProps {
  current: DashboardSummary
  loading?: boolean
  changes: CategoryChange[]
  changesLoading?: boolean
  currencyCode: string
}

/** Placeholder tiles while a group loads. */
function SkeletonTiles() {
  return (
    <div className="changes-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="change-tile" style={{ minHeight: '4.5rem' }} />
      ))}
    </div>
  )
}

/**
 * The period at a glance: the four totals, then — below a keyline, in the
 * same card — the categories that changed the most.
 */
export function SummaryCard({ current, loading, changes, changesLoading, currencyCode }: SummaryCardProps) {
  const placeholder = loading || undefined

  const items = [
    { key: 'expense', label: 'Total Expense', value: loading ? '—' : formatCurrency(current.totalExpense, currencyCode) },
    {
      key: 'income',
      label: 'Total Income',
      value: loading ? '—' : formatCurrency(current.totalIncome, currencyCode),
      color: placeholder ? undefined : current.totalIncome > 0 ? 'var(--amount-positive)' : undefined,
    },
    {
      key: 'net',
      label: 'Net Income',
      value: loading ? '—' : formatCurrency(current.netIncome, currencyCode),
      color: placeholder ? undefined : current.netIncome < 0 ? 'var(--danger)' : 'var(--amount-positive)',
    },
    {
      key: 'savings',
      label: 'Savings Rate',
      value: loading ? '—' : (current.savingsRate === null ? '—' : `${(current.savingsRate * 100).toFixed(1)}%`),
      color: placeholder ? undefined : current.savingsRate !== null && current.savingsRate < 0 ? 'var(--danger)' : 'var(--amount-positive)',
    },
  ]
  const changeTiles = significantChangeTiles(changes)

  return (
    <Card style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
      <h4 className="insights-subheader">Summary</h4>
      <p className="insights-hint">What you should remember</p>
      <StatTiles items={items} />

      <hr className="insights-keyline" />

      <h4 className="insights-subheader">Changes</h4>
      <p className="insights-hint">Categories with the most significant change</p>
      {changesLoading ? (
        <SkeletonTiles />
      ) : changeTiles.length > 0 ? (
        <StatTiles items={changeTiles} />
      ) : (
        <p className="insights-empty">No big changes compared with recent periods.</p>
      )}
    </Card>
  )
}
