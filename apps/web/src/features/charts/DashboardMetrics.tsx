import type { DashboardSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { formatCurrency } from '../../lib/formatCurrency'

interface DashboardMetricsProps {
  current: DashboardSummary
  comparison?: {
    summary: DashboardSummary
    label: string
  }
  currencyCode: string
}

interface Delta {
  absolute: number
  percent: number | null
}

function computeDelta(current: number, previous: number): Delta {
  const absolute = current - previous
  const percent = previous !== 0 ? (absolute / Math.abs(previous)) * 100 : null
  return { absolute, percent }
}

function deltaColor(delta: number, positiveIsGood: boolean): string | undefined {
  if (delta === 0) return undefined
  return (delta > 0) === positiveIsGood ? 'var(--accent)' : 'var(--danger)'
}

function formatDeltaPercent(delta: Delta): string {
  if (delta.percent === null) return '—'
  const sign = delta.percent > 0 ? '+' : ''
  return `${sign}${delta.percent.toFixed(1)}%`
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card style={{ flex: '1 1 10rem' }}>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: color ?? 'var(--text)' }}>{value}</p>
    </Card>
  )
}

function CompactTile({ label, delta, positiveIsGood }: { label: string; delta: Delta; positiveIsGood: boolean }) {
  const color = deltaColor(delta.absolute, positiveIsGood)
  return (
    <Card style={{ flex: '1 1 10rem' }}>
      <p style={{ margin: 0, color: color ?? 'var(--text-muted)', fontSize: '0.85rem' }}>
        {label}{' '}
        <span style={{ fontWeight: 600 }}>{formatDeltaPercent(delta)}</span>
      </p>
    </Card>
  )
}

export function DashboardMetrics({ current, comparison, currencyCode }: DashboardMetricsProps) {
  if (!comparison) {
    return (
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Tile label="Total expense" value={formatCurrency(current.totalExpense, currencyCode)} />
        <Tile label="Total income" value={formatCurrency(current.totalIncome, currencyCode)} />
        <Tile label="Net income" value={formatCurrency(current.netIncome, currencyCode)} color={current.netIncome < 0 ? 'var(--danger)' : 'var(--accent)'} />
        <Tile label="Savings rate" value={current.savingsRate === null ? '—' : `${(current.savingsRate * 100).toFixed(1)}%`} color={current.savingsRate !== null && current.savingsRate < 0 ? 'var(--danger)' : 'var(--amount-positive)'} />
      </div>
    )
  }

  const { summary: prev } = comparison
  const expenseDelta = computeDelta(current.totalExpense, prev.totalExpense)
  const incomeDelta = computeDelta(current.totalIncome, prev.totalIncome)
  const netDelta = computeDelta(current.netIncome, prev.netIncome)
  const savingsDelta = computeDelta(current.savingsRate ?? 0, prev.savingsRate ?? 0)

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <CompactTile label="Expense" delta={expenseDelta} positiveIsGood={false} />
      <CompactTile label="Income" delta={incomeDelta} positiveIsGood />
      <CompactTile label="Net income" delta={netDelta} positiveIsGood />
      <CompactTile label="Savings rate" delta={savingsDelta} positiveIsGood />
    </div>
  )
}
