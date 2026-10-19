import type { AccountSummary } from 'shared-types'
import { useProfile } from './useProfile'

/**
 * Combined balance of the given accounts in the home currency. The API already
 * converts each account's balance to home (`homeBalance`) and fails loudly
 * (FX_UNAVAILABLE) when a rate is missing, so this is a plain sum.
 */
export function useCombinedBalance(accounts: AccountSummary[]) {
  const { profile } = useProfile()
  const homeCurrency = profile?.homeCurrencyCode ?? accounts[0]?.balanceCurrencyCode ?? 'USD'

  let total = 0
  for (const account of accounts) total += account.homeBalance

  return { total, homeCurrency }
}
