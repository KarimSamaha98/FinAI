import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/BackButton'
import { Alert } from '../../components/Alert'
import { SkeletonRows } from '../../components/Skeleton'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useProfile } from '../../hooks/useProfile'
import { useInsightTransactions } from '../../hooks/useInsightTransactions'
import { useScrollRestoreWhenReady } from '../../hooks/useScrollRestoreWhenReady'
import { formatCurrency } from '../../lib/formatCurrency'
import { TransactionRow } from '../accounts/TransactionRow'
import { breakdownDetails, byHomeValue, readInsightsView } from './insightsView'

/**
 * "Show all" for an Insights breakdown: every transaction in it, as a
 * sub-page of Insights (/insights/transactions, with the Insights URL's own
 * params), so Back returns to Insights with the breakdown still open.
 * "Open in Transactions" hands over to the ledger for editing.
 */
export function InsightTransactionsPage() {
  const [params] = useSearchParams()
  const { mode, period, activeSplit } = readInsightsView(params)
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const { profile } = useProfile()
  const details = activeSplit ? breakdownDetails(activeSplit, mode, period, categories) : null
  const { rows, loading, error } = useInsightTransactions(details?.range ?? null)
  useScrollRestoreWhenReady(!loading)

  // Nothing to show without a breakdown (an edited or stale link): back to Insights.
  if (!details) return <Navigate to={`/insights?${params.toString()}`} replace />

  const matching = rows.filter(details.match).sort(byHomeValue)
  const total = matching.reduce((sum, row) => sum + (row.convertedValue ?? row.amount), 0)
  const currencyCode = profile?.homeCurrencyCode ?? 'USD'

  return (
    <main className="insight-transactions-page">
      <PageHeader title={details.title} backTo={`/insights?${params.toString()}`} />
      <div className="insight-transactions-meta">
        {!loading && !error && (
          <p>
            {matching.length} {matching.length === 1 ? 'transaction' : 'transactions'} ·{' '}
            <span className="mono">{formatCurrency(Math.abs(total), currencyCode)}</span>
          </p>
        )}
        <Link to={details.ledgerHref} className="insight-transactions-ledger-link">
          Open in Transactions
        </Link>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <SkeletonRows count={8} />}
      {!loading && !error && matching.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No transactions.</p>}
      {matching.length > 0 && (
        <ul className="txn-list">
          {matching.map((row, index) => (
            <TransactionRow
              key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`}
              row={row}
              categories={categories}
              accounts={accounts}
              showAccount={accounts.length > 1}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
