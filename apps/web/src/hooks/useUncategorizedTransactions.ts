import type { CategorizeTransactionsInput, Transaction } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: Transaction[] = []

/** Transactions still waiting for a category (skipped during import or saved without one), newest first. */
export function useUncategorizedTransactions(accountIds: string[] = []) {
  const params = new URLSearchParams({ uncategorized: 'true' })
  if (accountIds.length) params.set('accountIds', accountIds.join(','))
  const { data, error, refresh } = useApiQuery<Transaction[]>(`/transactions?${params}`, { keepPrevious: true })

  async function categorize(assignments: CategorizeTransactionsInput['assignments']) {
    if (assignments.length > 0) await apiClient.post('/transactions/categorize', { assignments })
    await invalidateApi()
  }

  // The notice is a convenience: on failure it just doesn't show (the ledger below still lists every row).
  return { transactions: error ? EMPTY : (data ?? EMPTY), refresh, categorize }
}
