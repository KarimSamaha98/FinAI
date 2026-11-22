import type { DisplayRow } from 'shared-types'
import { useApiQuery } from './useApiQuery'

/**
 * How many items are flagged as needing attention (in these accounts, any
 * date), for the notice on Transactions. Counted on the same rows the Flagged
 * filter lists (a linked group or a split is one item), so the two always
 * agree. Failure just hides the notice.
 */
export function useFlaggedTransactions(accountIds: string[] = []) {
  const params = new URLSearchParams({ view: 'real', flagged: 'true' })
  if (accountIds.length) params.set('accountIds', accountIds.join(','))
  const { data, error } = useApiQuery<DisplayRow[]>(`/transactions/display?${params}`, { keepPrevious: true })
  return { count: error ? 0 : (data?.length ?? 0) }
}
