import type { CategoryChange, RecurringPayment, TopTransaction } from 'shared-types'
import { Card } from '../../components/Card'
import { CategoryIcon } from '../../components/categoryIcons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { categoryKey, type DrillableProps } from './drillDown'

interface CategoryChangesCardProps extends DrillableProps {
  changes: CategoryChange[]
  filterKind?: 'expense' | 'income'
  title?: string
}

export function CategoryChangesCard({ changes, filterKind, title = 'Category Changes', selectedKey, onSelect }: CategoryChangesCardProps) {
  const filtered = filterKind
    ? changes.filter(c => c.kind === filterKind)
    : changes

  if (filtered.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>
        {title}
      </h4>
      <div className="category-changes-grid">
        {filtered.slice(0, 8).map((change) => {
          const sign = change.percentChange > 0 ? '+' : ''
          const color = change.type === 'expense_spike' || change.type === 'income_reduction' ? 'var(--danger)' : 'var(--amount-positive)'
          return (
            <button
              type="button"
              key={`${categoryKey(change.categoryId)}-${change.type}`}
              className={`card category-change-tile${selectedKey === categoryKey(change.categoryId) ? ' is-selected' : ''}`}
              onClick={onSelect ? () => onSelect(categoryKey(change.categoryId)) : undefined}
              disabled={!onSelect}
              aria-pressed={onSelect ? selectedKey === categoryKey(change.categoryId) : undefined}
            >
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>{change.categoryName}</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color }}>
                {sign}{change.percentChange.toFixed(0)}%
              </p>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

interface TopExpensesCardProps extends DrillableProps {
  expenses: TopTransaction[]
}

export function TopExpensesCard({ expenses, selectedKey, onSelect }: TopExpensesCardProps) {
  if (expenses.length === 0) return null

  const displayAmount = (amount: number) => -amount

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>Top Expenses</h4>
      <ul className="txn-list">
        {expenses.map((expense) => (
          <li key={expense.description} className="txn-item">
            <button
              type="button"
              className={`txn-row${onSelect ? '' : ' is-static'}${selectedKey === expense.description ? ' is-selected' : ''}`}
              onClick={onSelect ? () => onSelect(expense.description) : undefined}
              aria-pressed={onSelect ? selectedKey === expense.description : undefined}
            >
              <span className="txn-row-date">{formatDate(expense.mostRecentDate)}</span>
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

interface TopIncomeCardProps extends DrillableProps {
  income: TopTransaction[]
}

export function TopIncomeCard({ income, selectedKey, onSelect }: TopIncomeCardProps) {
  if (income.length === 0) return null

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>Top Income</h4>
      <ul className="txn-list">
        {income.map((item) => (
          <li key={item.description} className="txn-item">
            <button
              type="button"
              className={`txn-row${onSelect ? '' : ' is-static'}${selectedKey === item.description ? ' is-selected' : ''}`}
              onClick={onSelect ? () => onSelect(item.description) : undefined}
              aria-pressed={onSelect ? selectedKey === item.description : undefined}
            >
              <span className="txn-row-date">{formatDate(item.mostRecentDate)}</span>
              <span className="txn-row-description-cell">
                <span className="txn-row-description">{item.description}</span>
              </span>
              <span className="txn-row-chips">
                <span className={`txn-chip txn-chip--category${item.categoryName ? '' : ' is-empty'}`}>
                  <span className="txn-chip-icon" aria-hidden="true">
                    <CategoryIcon name={item.categoryIcon} />
                  </span>
                  <span className="txn-chip-label">{item.categoryName ?? 'Uncategorized'}</span>
                </span>
              </span>
              <span className="txn-row-amount is-income">
                {formatCurrency(item.amount, item.currencyCode)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface RecurringPaymentsCardProps extends DrillableProps {
  payments: RecurringPayment[]
}

export function RecurringPaymentsCard({ payments, selectedKey, onSelect }: RecurringPaymentsCardProps) {
  if (payments.length === 0) return null

  const displayAmount = (amount: number) => -amount

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontSize: '0.95rem', marginBottom: 'var(--space-3)', margin: '0 0 var(--space-3) 0', fontWeight: 600, color: 'var(--text-muted)' }}>Recurring Payments</h4>
      <ul className="txn-list">
        {payments.slice(0, 5).map((payment, index) => (
          <li key={`${payment.description}-${index}`} className="txn-item">
            <button
              type="button"
              className={`txn-row${onSelect ? '' : ' is-static'}${selectedKey === payment.description ? ' is-selected' : ''}`}
              onClick={onSelect ? () => onSelect(payment.description) : undefined}
              aria-pressed={onSelect ? selectedKey === payment.description : undefined}
            >
              <span className="txn-row-date">{formatDate(payment.mostRecentDate)}</span>
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
