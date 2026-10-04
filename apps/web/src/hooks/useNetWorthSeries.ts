import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NetWorthSeries } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

export function useNetWorthSeries(dateRange: DateRange) {
  const [series, setSeries] = useState<NetWorthSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null
    const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to })
    return `?${params.toString()}`
  }, [dateRange.from, dateRange.to])

  const refresh = useCallback(async () => {
    if (!query) {
      setSeries(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setSeries(await apiClient.get<NetWorthSeries>(`/accounts/net-worth-series${query}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load net worth series')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { series, loading, error, refresh }
}
