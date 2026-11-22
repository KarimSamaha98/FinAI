import type { DisplayRow } from 'shared-types'
import { useApiQuery } from './useApiQuery'

const EMPTY: DisplayRow[] = []

/**
 * Real-view rows for an Insights breakdown. Fetches only while a range is
 * given (a panel is open); callers filter the rows for the clicked item.
 * Not kept across ranges: another breakdown's rows must never show under
 * this one's title.
 */
export function useInsightTransactions(range: { from: string; to: string } | null) {
  const path = range ? `/transactions/display?${new URLSearchParams({ from: range.from, to: range.to, view: 'real' })}` : null
  const { data, loading, error } = useApiQuery<DisplayRow[]>(path, { errorMessage: 'Failed to load transactions' })
  return { rows: data ?? EMPTY, loading, error }
}
