import type { Account, Category, DisplayRow } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { useInsightTransactions } from '../../hooks/useInsightTransactions'
import { TransactionRow } from '../accounts/TransactionRow'

interface InsightDrillPanelProps {
  range: { from: string; to: string }
  match: (row: DisplayRow) => boolean
  categories: Category[]
  accounts: Account[]
  currencyCode: string
}

/**
 * Self-contained drill-down panel that fetches its own transactions.
 * The caller passes a range and a filter; this component owns the fetch
 * lifecycle so it never shows stale data captured at click time.
 */
export function InsightDrillPanel({ range, match, categories, accounts, currencyCode }: InsightDrillPanelProps) {
  const { rows, loading, error } = useInsightTransactions(range)
  const filtered = rows.filter(match)
  const total = filtered.reduce((sum, row) => sum + (row.convertedValue ?? row.amount), 0)
  const showAccount = new Set(filtered.map((r) => r.anchorAccountId)).size > 1

  return (
    <div className="insight-drill-content">
      {!loading && !error && (
        <p className="insight-drill-summary">
          {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'} ·{' '}
          <span className="mono">{formatCurrency(Math.abs(total), currencyCode)}</span>
        </p>
      )}
      {loading && <p className="insight-drill-note">Loading…</p>}
      {error && <p className="insight-drill-note">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="insight-drill-note">No transactions.</p>}
      {!loading && filtered.length > 0 && (
        <ul className="txn-list">
          {filtered.map((row, index) => (
            <TransactionRow
              key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`}
              row={row}
              categories={categories}
              accounts={accounts}
              showAccount={showAccount}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
