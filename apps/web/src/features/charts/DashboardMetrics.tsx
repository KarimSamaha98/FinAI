import type { DashboardSummary } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { StatGrid } from './StatGrid'

interface DashboardMetricsProps {
  current: DashboardSummary
  loading?: boolean
  currencyCode: string
}

export function DashboardMetrics({ current, loading, currencyCode }: DashboardMetricsProps) {
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

  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <StatGrid items={items} title="Summary" hint="What you should remember" />
    </div>
  )
}
