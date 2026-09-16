import { Card } from '../../components/Card'
import { formatCurrency } from '../../lib/formatCurrency'

interface DashboardMetricsProps {
  totalExpense: number
  totalIncome: number
  netIncome: number
  savingsRate: number | null
  currencyCode: string
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card style={{ flex: '1 1 10rem' }}>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: color ?? 'var(--text)' }}>{value}</p>
    </Card>
  )
}

export function DashboardMetrics({ totalExpense, totalIncome, netIncome, savingsRate, currencyCode }: DashboardMetricsProps) {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '1rem 0' }}>
      <Tile label="Total expense" value={formatCurrency(totalExpense, currencyCode)} />
      <Tile label="Total income" value={formatCurrency(totalIncome, currencyCode)} />
      <Tile label="Net income" value={formatCurrency(netIncome, currencyCode)} color={netIncome < 0 ? 'var(--danger)' : 'var(--accent)'} />
      <Tile
        label="Savings rate"
        value={savingsRate === null ? '—' : `${(savingsRate * 100).toFixed(1)}%`}
        color={savingsRate !== null && savingsRate < 0 ? 'var(--danger)' : 'var(--accent)'}
      />
    </div>
  )
}
