import { Link } from 'react-router-dom'
import type { AccountType, NetWorthAccount, NetWorthSeriesPoint } from 'shared-types'
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker'
import { rangeFromParams, rangeToParams, type DateRangePreset } from '../../lib/dateRangePresets'
import { useUrlState } from '../../hooks/useUrlState'
import { useScrollRestoreWhenReady } from '../../hooks/useScrollRestoreWhenReady'
import { formatCurrency } from '../../lib/formatCurrency'
import { usePrivacy } from '../../context/PrivacyContext'
import { Card } from '../../components/Card'
import { SkeletonBlock } from '../../components/Skeleton'
import { PrivateAmount } from '../../components/PrivateAmount'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { isFxUnavailable } from '../../lib/apiClient'
import { useNetWorth } from '../../hooks/useNetWorth'
import { useNetWorthSeries } from '../../hooks/useNetWorthSeries'
import { NetWorthChart } from './NetWorthChart'
import { PeopleCard } from '../people/PeopleCard'

const HOME_DEFAULT_RANGE: DateRangePreset = '6m'

/** Home buckets: one per account type, fixed display order. Pure groupings — no subtotals. */
const HOME_BUCKETS: { type: AccountType; label: string }[] = [
  { type: 'checking', label: 'Checking' },
  { type: 'credit', label: 'Credit' },
  { type: 'investment', label: 'Investment' },
  { type: 'cash', label: 'Cash' },
  { type: 'other', label: 'Other' },
]

/** Negative balances read red; positive and zero keep the regular text color. Used for the net worth total. */
function signedColor(amount: number): string | undefined {
  return amount < 0 ? 'var(--danger)' : undefined
}

/** Account balances: positive green, negative red, zero neutral. */
function balanceColor(amount: number): string | undefined {
  if (amount > 0) return 'var(--amount-positive)'
  return signedColor(amount)
}

function AccountRow({ account }: { account: NetWorthAccount }) {
  return (
    <Link to={`/accounts?selected=${account.id}`} className="home-account-row">
      <span className="home-account-name">{account.name}</span>
      <span className="home-account-institution">{account.institution ?? ''}</span>
      <PrivateAmount
        amount={account.balance}
        currencyCode={account.currencyCode}
        className="mono home-account-balance"
        // Kept while hidden: the colour says in/out of the red, not how much.
        style={{ color: balanceColor(account.balance) }}
      />
    </Link>
  )
}

/**
 * "▲ CA$12,340 · 8.2% since May 2026": the change across the chart's range.
 * In privacy mode only the direction and percentage show, never the amount.
 */
function NetWorthChange({ points, currencyCode }: { points: NetWorthSeriesPoint[]; currencyCode: string }) {
  const { hidden } = usePrivacy()
  if (points.length < 2) return null
  const first = points[0]
  const delta = points[points.length - 1].total - first.total
  const percent = first.total !== 0 ? (delta / Math.abs(first.total)) * 100 : null
  const direction = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'
  return (
    <span className={`home-hero-change ${direction}`}>
      <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'}</span>
      {!hidden && <span className="mono">{formatCurrency(Math.abs(delta), currencyCode)}</span>}
      {percent !== null && <span className="mono">{!hidden ? '· ' : ''}{Math.abs(percent).toFixed(1)}%</span>}
      <span className="home-hero-change-since">since {first.bucketLabel}</span>
    </span>
  )
}

/** "Includes CA$242 owed to you" (or "you owe"): the net balance with people the total counts. Amounts hide in privacy mode. */
function PeopleNote({ balance, included, currencyCode }: { balance: number; included: boolean; currencyCode: string }) {
  const { hidden } = usePrivacy()
  if (balance === 0) return null
  const amount = hidden ? '••••' : formatCurrency(Math.abs(balance), currencyCode)
  const part = balance > 0 ? `${amount} owed to you` : `${amount} you owe`
  return <span className="home-hero-people">{included ? `Includes ${part}` : `Not counting ${part}`}</span>
}

export function HomeScreen() {
  // The chart range lives in the URL (?range=1y), so coming Back from an account keeps it.
  const [params, updateParams] = useUrlState()
  const rangeSelection = rangeFromParams(params, HOME_DEFAULT_RANGE)
  const dateRange = rangeSelection.range
  const { netWorth, loading, error, refresh } = useNetWorth()
  const { series, loading: seriesLoading, updating: seriesUpdating, error: seriesError, refresh: refreshSeries } = useNetWorthSeries(dateRange)
  // Back from an account lands where Home was scrolled, once it has loaded.
  useScrollRestoreWhenReady(!loading && !seriesLoading)

  // A failed exchange-rate fetch means the totals can't be computed — show a
  // retry screen instead of misleading partial numbers.
  if (isFxUnavailable(error) || isFxUnavailable(seriesError)) {
    return (
      <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <h1>Home</h1>
        <Card className="home-empty">
          <h2>Fetching data failed</h2>
          <p>We couldn&apos;t fetch exchange rates, so your balances and net worth can&apos;t be shown right now.</p>
          <Button
            variant="primary"
            onClick={() => {
              refresh()
              refreshSeries()
            }}
          >
            Try again
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <h1>Home</h1>
      {error && <Alert variant="error">{error}</Alert>}
      {/* First-ever load only (afterwards Home opens from cache): the hero card and two groups, in outline. */}
      {loading && (
        <div className="home-skeleton">
          <SkeletonBlock height="22rem" className="home-skeleton-hero" />
          <div className="home-buckets">
            <SkeletonBlock height="12rem" className="home-skeleton-bucket" />
            <SkeletonBlock height="8rem" className="home-skeleton-bucket" />
          </div>
        </div>
      )}

      {!loading && netWorth && netWorth.accounts.length > 0 && (
        <>
          {/* One card: the total, how it moved over the range, and the chart of it. */}
          <Card className="home-hero">
            <div className="home-hero-header">
              <div className="home-hero-summary">
                <span className="home-hero-label">
                  Total Net Worth
                  <PrivacyToggle />
                </span>
                <PrivateAmount
                  amount={netWorth.total}
                  currencyCode={netWorth.homeCurrencyCode}
                  className="mono home-hero-amount"
                  revealedStyle={{ color: signedColor(netWorth.total) }}
                />
                <PeopleNote balance={netWorth.peopleBalance} included={netWorth.peopleIncluded} currencyCode={netWorth.homeCurrencyCode} />
                {/* How it moved over the chart's range. (No "as of": the total is always today's.) */}
                {series && !seriesLoading && <NetWorthChange points={series.points} currencyCode={series.homeCurrencyCode} />}
              </div>
              <DateRangePresetPicker value={rangeSelection} onChange={(next) => updateParams(rangeToParams(next, HOME_DEFAULT_RANGE))} />
            </div>
            {seriesError && <Alert variant="error">{seriesError}</Alert>}
            <div className={`home-hero-chart${seriesUpdating ? ' is-updating' : ''}`} aria-busy={seriesUpdating}>
              {seriesLoading ? (
                <SkeletonBlock height={260} />
              ) : (
                series && <NetWorthChart points={series.points} granularity={series.granularity} currencyCode={series.homeCurrencyCode} />
              )}
            </div>
          </Card>

          <PeopleCard />

          <div className="home-buckets">
            {HOME_BUCKETS.map(({ type, label }) => {
              const bucketAccounts = netWorth.accounts.filter((a) => a.type === type)
              if (bucketAccounts.length === 0) return null
              return (
                <Card key={type} className="home-bucket">
                  <h2>{label}</h2>
                  {bucketAccounts.map((account) => (
                    <AccountRow key={account.id} account={account} />
                  ))}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && netWorth && netWorth.accounts.length === 0 && (
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
