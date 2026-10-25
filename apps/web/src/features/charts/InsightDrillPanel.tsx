import type { ReactNode } from 'react'
import type { Account, Category, DisplayRow } from 'shared-types'
import { CloseIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { TransactionRow } from '../accounts/TransactionRow'

interface InsightSplitProps {
  /** The panel to show beside the card; null keeps the card full width. */
  panel: ReactNode
  children: ReactNode
}

/**
 * Lays a card and its drill-down panel side by side. The panel takes the
 * card's height and scrolls its own list; on narrow screens it drops below.
 */
export function InsightSplit({ panel, children }: InsightSplitProps) {
  return (
    <div className={`insight-split${panel ? ' is-open' : ''}`}>
      <div className="insight-split-main">{children}</div>
      {panel && <div className="insight-split-panel">{panel}</div>}
    </div>
  )
}

interface InsightDrillPanelProps {
  title: string
  rows: DisplayRow[]
  loading: boolean
  error: string | null
  categories: Category[]
  accounts: Account[]
  currencyCode: string
  onClose: () => void
}

export function InsightDrillPanel({ title, rows, loading, error, categories, accounts, currencyCode, onClose }: InsightDrillPanelProps) {
  const total = rows.reduce((sum, row) => sum + (row.convertedValue ?? row.amount), 0)
  const showAccount = new Set(rows.map((r) => r.anchorAccountId)).size > 1

  return (
    <section className="card insight-drill" aria-label={`Transactions: ${title}`}>
      <header className="insight-drill-header">
        <div className="insight-drill-heading">
          <h4 className="insight-drill-title">{title}</h4>
          {!loading && !error && (
            <p className="insight-drill-summary">
              {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'} ·{' '}
              <span className="mono">{formatCurrency(Math.abs(total), currencyCode)}</span>
            </p>
          )}
        </div>
        <button type="button" className="icon-button icon-button--small" onClick={onClose} aria-label="Close transactions">
          <CloseIcon />
        </button>
      </header>
      <div className="insight-drill-body">
        {loading && <p className="insight-drill-note">Loading…</p>}
        {error && <p className="insight-drill-note">{error}</p>}
        {!loading && !error && rows.length === 0 && <p className="insight-drill-note">No transactions.</p>}
        {!loading && rows.length > 0 && (
          <ul className="txn-list">
            {rows.map((row, index) => (
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
    </section>
  )
}
