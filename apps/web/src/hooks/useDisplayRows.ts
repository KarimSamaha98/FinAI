import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DisplayRow, TransactionView } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

export function useDisplayRows(dateRange: DateRange, categoryIds: string[], view: TransactionView, accountIds: string[] = []) {
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const categoryIdsKey = categoryIds.join(',')
  const accountIdsKey = accountIds.join(',')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (categoryIdsKey) params.set('categoryIds', categoryIdsKey)
    if (accountIdsKey) params.set('accountIds', accountIdsKey)
    params.set('view', view)
    return `?${params.toString()}`
    // categoryIdsKey/accountIdsKey are the stable, primitive representations of their array props.
  }, [dateRange.from, dateRange.to, categoryIdsKey, accountIdsKey, view])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await apiClient.get<DisplayRow[]>(`/transactions/display${query}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { rows, loading, error, refresh }
}
