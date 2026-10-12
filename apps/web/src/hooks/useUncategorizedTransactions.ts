import { useCallback, useEffect, useState } from 'react'
import type { CategorizeTransactionsInput, Transaction } from 'shared-types'
import { apiClient } from '../lib/apiClient'

/** Transactions still waiting for a category (skipped during import or saved without one), newest first. */
export function useUncategorizedTransactions(accountIds: string[] = []) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const accountIdsKey = accountIds.join(',')

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ uncategorized: 'true' })
    if (accountIdsKey) params.set('accountIds', accountIdsKey)
    try {
      setTransactions(await apiClient.get<Transaction[]>(`/transactions?${params}`))
    } catch {
      // The notice is a convenience — the ledger below still lists every row.
      setTransactions([])
    }
  }, [accountIdsKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function categorize(assignments: CategorizeTransactionsInput['assignments']) {
    if (assignments.length > 0) await apiClient.post('/transactions/categorize', { assignments })
    await refresh()
  }

  return { transactions, refresh, categorize }
}
