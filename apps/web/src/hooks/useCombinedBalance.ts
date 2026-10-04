import type { AccountSummary } from 'shared-types'
import { useProfile } from './useProfile'
import { useFxRates } from './useFxRates'

/**
 * Combined balance of the given accounts in the home currency, via the user's
 * fx_rates — mirrors AccountsService's own per-account conversion. Accounts in
 * a currency with no rate to home can't be added in, so they're returned in
 * `excluded` for the UI to call out.
 */
export function useCombinedBalance(accounts: AccountSummary[]) {
  const { profile } = useProfile()
  const { rates } = useFxRates()
  const homeCurrency = profile?.homeCurrencyCode ?? accounts[0]?.currencyCode ?? 'USD'
  const rateByBase = new Map(rates.filter((r) => r.quoteCurrency === homeCurrency).map((r) => [r.baseCurrency, r.rate]))

  let total = 0
  const excluded: AccountSummary[] = []
  for (const account of accounts) {
    if (account.currencyCode === homeCurrency) {
      total += account.balance
      continue
    }
    const rate = rateByBase.get(account.currencyCode)
    if (rate === undefined) excluded.push(account)
    else total += account.balance * rate
  }

  return { total, homeCurrency, excluded }
}
