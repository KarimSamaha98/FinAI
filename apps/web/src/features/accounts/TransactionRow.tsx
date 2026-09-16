import type { Account, Category, DisplayRow } from 'shared-types'
import { TableRow, TableCell } from '../../components/Table'
import { Badge } from '../../components/Badge'
import { categoryEmoji } from '../../lib/categoryEmoji'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface TransactionRowProps {
  row: DisplayRow
  categories: Category[]
  accounts: Account[]
  /** Shown when the "ALL" pseudo-account is selected, since rows are mixed across accounts there. */
  showAccountTag: boolean
  onClick: () => void
}

function categoryName(categories: Category[], categoryId: string | null): string {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

function accountNames(accounts: Account[], accountIds: string[]): string {
  return accountIds.map((id) => accounts.find((a) => a.id === id)?.name ?? 'Unknown account').join(', ')
}

export function TransactionRow({ row, categories, accounts, showAccountTag, onClick }: TransactionRowProps) {
  const isIncome = row.amount >= 0
  const category = categoryName(categories, row.categoryId)

  return (
    <TableRow clickable onClick={onClick}>
      <TableCell>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              {formatDate(row.date)}
            </span>
            {' — '}
            {row.description || 'Untitled'}
          </span>
          <strong className="mono" style={{ flex: '0 0 auto', color: isIncome ? 'var(--accent)' : 'var(--outflow)' }}>
            {formatCurrency(row.amount, row.currencyCode)}
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'var(--space-1)' }}>
          <span style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {showAccountTag && row.accountIds.length > 0 && <Badge variant="neutral">{accountNames(accounts, row.accountIds)}</Badge>}
            {row.monthSplitId && <Badge variant="neutral">⑃ Split</Badge>}
            {row.reconciliationGroupId && <Badge variant="neutral">🔗 Reconciled</Badge>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.78rem', flex: '0 0 auto' }}>
            <span aria-hidden="true">{categoryEmoji(row.categoryId ? category : null)}</span>
            {category}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}
