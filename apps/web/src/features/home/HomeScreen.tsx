import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AccountType, NetWorthAccount } from 'shared-types'
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker'
import type { DateRange } from '../../components/DateRangePicker'
import { getPresetRange } from '../../lib/dateRangePresets'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { ExcludedCurrenciesWarning } from '../charts/ExcludedCurrenciesWarning'
import { useNetWorth } from '../../hooks/useNetWorth'
import { useNetWorthSeries } from '../../hooks/useNetWorthSeries'
import { NetWorthChart } from './NetWorthChart'

/** Home display buckets: e_banking folds under Checking (an online checking account). Buckets are pure groupings — no subtotals. */
type HomeBucket = 'checking' | 'credit' | 'investment' | 'cash' | 'other'

const HOME_BUCKETS: { bucket: HomeBucket; label: string }[] = [
  { bucket: 'checking', label: 'Checking' },
  { bucket: 'credit', label: 'Credit' },
  { bucket: 'investment', label: 'Investment' },
  { bucket: 'cash', label: 'Cash' },
  { bucket: 'other', label: 'Other' },
]

function homeBucketFor(type: AccountType): HomeBucket {
  return type === 'e_banking' ? 'checking' : type
}

/** Negative balances read red (danger), positive green (success); zero stays neutral. */
function signedColor(amount: number): string | undefined {
  if (amount < 0) return 'var(--danger)'
  if (amount > 0) return 'var(--success)'
  return undefined
}

function AccountRow({ account }: { account: NetWorthAccount }) {
  return (
    <Link to={`/accounts?selected=${account.id}`} className="home-account-row">
      <span className="home-account-name">{account.name}</span>
      <span className="home-account-institution">{account.institution ?? ''}</span>
      <span className="mono home-account-balance" style={{ color: signedColor(account.balance) }}>
        {formatCurrency(account.balance, account.currencyCode)}
      </span>
    </Link>
  )
}

export function HomeScreen() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('6m'))
  const { netWorth, loading, error } = useNetWorth()
  const { series, loading: seriesLoading, error: seriesError } = useNetWorthSeries(dateRange)

  const chartCard = (
    <Card className="home-chart">
      <div className="home-chart-header">
        <h2>Net Worth Over Time</h2>
        <DateRangePresetPicker value={dateRange} onChange={setDateRange} defaultPreset="6m" />
      </div>
      {seriesError && <Alert variant="error">{seriesError}</Alert>}
      {seriesLoading && (
        <p role="status" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </p>
      )}
      {!seriesLoading && series && (
        <NetWorthChart points={series.points} granularity={series.granularity} currencyCode={series.homeCurrencyCode} />
      )}
    </Card>
  )

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <h1>Home</h1>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && (
        <p role="status" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </p>
      )}

      {!loading && netWorth && (netWorth.accounts.length > 0 || netWorth.excludedAccounts.length > 0) && (
        <>
          <Card className="home-hero">
            <span className="home-hero-label">Total Net Worth</span>
            <span className="mono home-hero-amount" style={{ color: signedColor(netWorth.total) }}>
              {formatCurrency(netWorth.total, netWorth.homeCurrencyCode)}
            </span>
            <span className="home-hero-asof">as of {formatDate(netWorth.asOf)}</span>
          </Card>

          {netWorth.excludedAccounts.length > 0 && (
            <Alert variant="info">
              {netWorth.excludedAccounts.map((a) => `${a.name} (${formatCurrency(a.balance, a.currencyCode)})`).join(', ')}{' '}
              {netWorth.excludedAccounts.length === 1 ? 'is' : 'are'} excluded from net worth — no exchange rate to{' '}
              {netWorth.homeCurrencyCode}. <Link to="/settings">Add one in Settings.</Link>
            </Alert>
          )}
          <ExcludedCurrenciesWarning excludedCurrencies={netWorth.excludedCurrencies} />

          {netWorth.accounts.length > 0 ? (
            <div className="home-grid">
              <div className="home-buckets">
                {HOME_BUCKETS.map(({ bucket, label }) => {
                  const bucketAccounts = netWorth.accounts.filter((a) => homeBucketFor(a.type) === bucket)
                  if (bucketAccounts.length === 0) return null
                  return (
                    <Card key={bucket} className="home-bucket">
                      <h2>{label}</h2>
                      {bucketAccounts.map((account) => (
                        <AccountRow key={account.id} account={account} />
                      ))}
                    </Card>
                  )
                })}
              </div>
              {chartCard}
            </div>
          ) : (
            chartCard
          )}
        </>
      )}

      {!loading && netWorth && netWorth.accounts.length === 0 && netWorth.excludedAccounts.length === 0 && (
        <Card className="home-empty">
          <h2>No accounts yet</h2>
          <p>Add your first account to see your net worth here.</p>
          <Link to="/accounts" className="btn btn-primary">
            Add an Account
          </Link>
        </Card>
      )}
    </main>
  )
}
