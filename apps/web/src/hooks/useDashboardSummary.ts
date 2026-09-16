import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DashboardSummary, TransactionView } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

const EMPTY_SUMMARY: DashboardSummary = { totalExpense: 0, totalIncome: 0, netIncome: 0, savingsRate: null, excludedCurrencies: [] }

export function useDashboardSummary(dateRange: DateRange, categoryIds: string[], view: TransactionView) {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const categoryIdsKey = categoryIds.join(',')

  const query = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null
    const params = new URLSearchParams()
    params.set('from', dateRange.from)
    params.set('to', dateRange.to)
    if (categoryIdsKey) params.set('categoryIds', categoryIdsKey)
    params.set('view', view)
    return `?${params.toString()}`
    // categoryIdsKey is the stable, primitive representation of categoryIds.
  }, [dateRange.from, dateRange.to, categoryIdsKey, view])

  const refresh = useCallback(async () => {
    if (!query) {
      setSummary(EMPTY_SUMMARY)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setSummary(await apiClient.get<DashboardSummary>(`/reporting/summary${query}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard summary')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...summary, loading, error, refresh }
}
