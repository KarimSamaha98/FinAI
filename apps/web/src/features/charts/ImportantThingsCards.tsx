import type { CategoryChange, RecurringPayment, TopExpense } from 'shared-types'
import { Card } from '../../components/Card'
import { CategoryIcon } from '../../components/categoryIcons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface CategoryChangesCardProps {
  changes: CategoryChange[]
  filterKind?: 'expense' | 'income'
  title?: string
}

export function CategoryChangesCard({ changes, filterKind, title = 'Category Changes' }: CategoryChangesCardProps) {
  const filtered = filterKind
    ? changes.filter(c => c.kind === filterKind)
    : changes

  if (filtered.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>
        {title}
      </h4>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {filtered.slice(0, 8).map((change) => {
          const sign = change.percentChange > 0 ? '+' : ''
          const color = change.type === 'expense_spike' || change.type === 'income_reduction' ? 'var(--danger)' : 'var(--accent)'
          return (
            <Card key={`${change.categoryId ?? 'uncategorized'}-${change.type}`} style={{ flex: '1 1 auto', minWidth: '10rem', padding: 'var(--space-3)' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>{change.categoryName}</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color }}>
                {sign}{change.percentChange.toFixed(0)}%
              </p>
            </Card>
          )
        })}
      </div>
    </Card>
  )
}

interface TopExpensesCardProps {
  expenses: TopExpense[]
}

export function TopExpensesCard({ expenses }: TopExpensesCardProps) {
  if (expenses.length === 0) return null

  const displayAmount = (amount: number) => -amount

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>Top Expenses</h4>
      <ul className="txn-list">
        {expenses.map((expense) => (
          <li key={expense.id} className="txn-item">
            <button type="button" className="txn-row is-static">
              <span className="txn-row-date">{formatDate(expense.date)}</span>
              <span className="txn-row-description-cell">
                <span className="txn-row-description">{expense.description}</span>
              </span>
              <span className="txn-row-chips">
                <span className={`txn-chip txn-chip--category${expense.categoryName ? '' : ' is-empty'}`}>
                  <span className="txn-chip-icon" aria-hidden="true">
                    <CategoryIcon name={expense.categoryIcon} />
                  </span>
                  <span className="txn-chip-label">{expense.categoryName ?? 'Uncategorized'}</span>
                </span>
              </span>
              <span className="txn-row-amount">
                {formatCurrency(displayAmount(expense.amount), expense.currencyCode)}
              </span>
            </button>
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

  const displayAmount = (amount: number) => -amount

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>Recurring Payments</h4>
      <ul className="txn-list">
        {payments.slice(0, 5).map((payment, index) => (
          <li key={`${payment.description}-${index}`} className="txn-item">
            <button type="button" className="txn-row is-static">
              <span className="txn-row-date">{payment.monthCount} mo</span>
              <span className="txn-row-description-cell">
                <span className="txn-row-description">{payment.description}</span>
              </span>
              <span className="txn-row-chips">
                <span className={`txn-chip txn-chip--category${payment.categoryName ? '' : ' is-empty'}`}>
                  <span className="txn-chip-icon" aria-hidden="true">
                    <CategoryIcon name={payment.categoryIcon} />
                  </span>
                  <span className="txn-chip-label">{payment.categoryName ?? 'Uncategorized'}</span>
                </span>
              </span>
              <span className="txn-row-amount">
                {formatCurrency(displayAmount(payment.amount), payment.currencyCode)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
