import { Link } from 'react-router-dom'
import type { Category, DisplayRow } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { useInsightTransactions } from '../../hooks/useInsightTransactions'
import { CategoryIcon } from '../../components/categoryIcons'

/** At most this many transactions render in the drawer; beyond it, "Show All" hands off. */
const MAX_VISIBLE_ROWS = 10

interface InsightDrillPanelProps {
  range: { from: string; to: string }
  match: (row: DisplayRow) => boolean
  categories: Category[]
  currencyCode: string
  title?: string
  /** Destination for the "Show All" hand-off — the Transactions view carrying this drill's filters. */
  showAllHref?: string
}

/** Largest transactions first, measured by home-currency value. */
function homeValue(row: DisplayRow): number {
  return Math.abs(row.convertedValue ?? row.amount)
}

/**
 * Self-contained drill-down panel that fetches its own transactions.
 * The caller passes a range and a filter; this component owns the fetch
 * lifecycle so it never shows stale data captured at click time.
 * Rows are a compact single-line variant of the ledger row, ranked by
 * amount and capped at 10 — beyond that, "Show All" links to the full
 * Transactions view with the identical filters.
 */
export function InsightDrillPanel({ range, match, categories, currencyCode, title, showAllHref }: InsightDrillPanelProps) {
  const { rows, loading, error } = useInsightTransactions(range)
  const filtered = rows.filter(match).sort((a, b) => homeValue(b) - homeValue(a))
  const total = filtered.reduce((sum, row) => sum + (row.convertedValue ?? row.amount), 0)
  const visible = filtered.slice(0, MAX_VISIBLE_ROWS)

  return (
    <div className="insight-drill-content">
      {title && <p className="insight-drill-title">{title}</p>}
      {!loading && !error && (
        <p className="insight-drill-summary">
          {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'} ·{' '}
          <span className="mono">{formatCurrency(Math.abs(total), currencyCode)}</span>
        </p>
      )}
      {loading && <p className="insight-drill-note">Loading…</p>}
      {error && <p className="insight-drill-note">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="insight-drill-note">No transactions.</p>}
      {!loading && visible.length > 0 && (
        <>
          <ul className="drill-txn-list">
            {visible.map((row, index) => {
              const category = categories.find((c) => c.id === row.categoryId)
              return (
                <li key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`} className="drill-txn">
                  <span className="drill-txn-icon" aria-hidden="true">
                    <CategoryIcon name={category?.icon ?? null} />
                  </span>
                  <span className="drill-txn-desc" title={row.description}>
                    {row.description || 'No description'}
                  </span>
                  <span className={`drill-txn-amount${row.amount > 0 ? ' is-income' : ''}${row.amount === 0 ? ' is-zero' : ''}`}>
                    {formatCurrency(row.amount, row.currencyCode)}
                  </span>
                </li>
              )
            })}
          </ul>
          {filtered.length > MAX_VISIBLE_ROWS && showAllHref && (
            <Link to={showAllHref} className="drill-show-all">
              Show All →
            </Link>
          )}
        </>
      )}
    </div>
  )
}
