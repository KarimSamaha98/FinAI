import type { DisplayRow, TransactionView } from 'shared-types'
import type { DateRange } from '../components/DateRangePicker'
import { useApiQuery } from './useApiQuery'

export function useDisplayRows(dateRange: DateRange, categoryIds: string[], view: TransactionView, accountIds: string[] = []) {
  const params = new URLSearchParams()
  if (dateRange.from) params.set('from', dateRange.from)
  if (dateRange.to) params.set('to', dateRange.to)
  if (categoryIds.length) params.set('categoryIds', categoryIds.join(','))
  if (accountIds.length) params.set('accountIds', accountIds.join(','))
  params.set('view', view)
  // A filter change keeps the current list on screen (marked `updating`) until the new one arrives.
  const { data, loading, updating, error, refresh } = useApiQuery<DisplayRow[]>(`/transactions/display?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load transactions',
  })
  return { rows: data ?? EMPTY, loading, updating, error, refresh }
}

const EMPTY: DisplayRow[] = []
