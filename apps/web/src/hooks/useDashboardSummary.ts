import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DashboardSummary, InsightMode } from 'shared-types'
import { apiClient } from '../lib/apiClient'

const EMPTY_SUMMARY: DashboardSummary = { totalExpense: 0, totalIncome: 0, netIncome: 0, savingsRate: null }

export function useDashboardSummary(mode: InsightMode, period: string) {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('mode', mode)
    params.set('period', period)
    return `?${params.toString()}`
  }, [mode, period])

  const refresh = useCallback(async () => {
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
