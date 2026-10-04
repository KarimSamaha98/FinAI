import type { AccountSummary } from 'shared-types'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatCurrency } from '../../lib/formatCurrency'
import { useProfile } from '../../hooks/useProfile'
import { useFxRates } from '../../hooks/useFxRates'

export const ALL_ACCOUNTS = 'all'

interface AccountCarouselProps {
  accounts: AccountSummary[]
  selectedId: string
  onSelect: (id: string) => void
  onAddClick: () => void
}

/** Combined balance across every account, converted to the home currency via the user's fx_rates — mirrors AccountsService's own per-account conversion. Accounts in a currency with no rate set are silently excluded, same as the dashboard summary. */
function useCombinedBalance(accounts: AccountSummary[]) {
  const { profile } = useProfile()
  const { rates } = useFxRates()
  const homeCurrency = profile?.homeCurrencyCode ?? accounts[0]?.currencyCode ?? 'USD'
  const rateByBase = new Map(rates.filter((r) => r.quoteCurrency === homeCurrency).map((r) => [r.baseCurrency, r.rate]))

  let total = 0
  for (const account of accounts) {
    if (account.currencyCode === homeCurrency) {
      total += account.balance
      continue
    }
    const rate = rateByBase.get(account.currencyCode)
    if (rate !== undefined) total += account.balance * rate
  }

  return { total, homeCurrency }
}

export function AccountCarousel({ accounts, selectedId, onSelect, onAddClick }: AccountCarouselProps) {
  const { total, homeCurrency } = useCombinedBalance(accounts)

  return (
    <div className="account-carousel">
      <button
        type="button"
        className={`account-card${selectedId === ALL_ACCOUNTS ? ' account-card--selected' : ''}`}
        onClick={() => onSelect(ALL_ACCOUNTS)}
      >
        <span className="account-card-type">Every account</span>
        <span className="account-card-name">ALL</span>
        <span className="account-card-balance">{formatCurrency(total, homeCurrency)}</span>
      </button>
      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          className={`account-card account-card--branded${account.cardImageUrl ? ' has-photo' : ''}${selectedId === account.id ? ' account-card--selected' : ''}`}
          style={{ background: account.cardColor }}
          onClick={() => onSelect(account.id)}
        >
          {account.cardImageUrl && <img src={account.cardImageUrl} alt="" className="account-card-photo" />}
          <span className="account-card-type">{accountTypeLabel(account.type)}</span>
          <span className="account-card-name">{account.name}</span>
          <span className="account-card-balance">{formatCurrency(account.balance, account.currencyCode)}</span>
        </button>
      ))}
      <button type="button" className="account-card account-card--add" onClick={onAddClick}>
        + Add account
      </button>
    </div>
  )
}
