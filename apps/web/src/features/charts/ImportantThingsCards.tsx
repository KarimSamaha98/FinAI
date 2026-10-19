import type { RecurringPayment, SpendingSpike, TopExpense } from 'shared-types'
import { Card } from '../../components/Card'
import { formatCurrency } from '../../lib/formatCurrency'
import { format, parseISO } from 'date-fns'

interface SpendingSpikesCardProps {
  spikes: SpendingSpike[]
}

export function SpendingSpikesCard({ spikes }: SpendingSpikesCardProps) {
  if (spikes.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600 }}>
        Spending Spikes
      </h4>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {spikes.slice(0, 5).map((spike) => (
          <Card key={spike.categoryId ?? 'uncategorized'} style={{ flex: '1 1 auto', minWidth: '10rem', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{spike.categoryName}</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--outflow)' }}>
              +{spike.percentIncrease.toFixed(0)}% <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>MoM</span>
            </p>
          </Card>
        ))}
      </div>
    </Card>
  )
}

interface TopExpensesCardProps {
  expenses: TopExpense[]
}

export function TopExpensesCard({ expenses }: TopExpensesCardProps) {
  if (expenses.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600 }}>
        Top Expenses
      </h4>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {expenses.map((expense) => (
          <li key={expense.id} className="txn-row is-static" style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span className="txn-row-card" style={{ background: 'var(--surface-raised)' }}>
              <span className="txn-row-card-initial" aria-hidden="true">$</span>
            </span>
            <span className="txn-row-date">{format(parseISO(expense.date), 'MMM d')}</span>
            <span className="txn-row-description">{expense.description}</span>
            <span className="txn-row-chips">
              <span className={`txn-chip txn-chip--category${expense.categoryName ? '' : ' is-empty'}`}>
                {expense.categoryName ?? 'Uncategorized'}
              </span>
            </span>
            <span className="txn-row-amount">{formatCurrency(expense.amount, expense.currencyCode)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface RecurringPaymentsCardProps {
  payments: RecurringPayment[]
}

export function RecurringPaymentsCard({ payments }: RecurringPaymentsCardProps) {
  if (payments.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600 }}>
        Recurring Payments
      </h4>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {payments.slice(0, 5).map((payment, index) => (
          <li key={`${payment.description}-${index}`} className="txn-row is-static" style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span className="txn-row-card" style={{ background: 'var(--surface-raised)' }}>
              <span className="txn-row-card-initial" aria-hidden="true">↻</span>
            </span>
            <span className="txn-row-date">
              {payment.occurrenceCount}x / {payment.monthCount}mo
            </span>
            <span className="txn-row-description">{payment.description}</span>
            <span className="txn-row-chips">
              <span className="txn-chip txn-chip--special">Recurring</span>
            </span>
            <span className="txn-row-amount">{formatCurrency(payment.amount, payment.currencyCode)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
