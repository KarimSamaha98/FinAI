import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InsightMode, TrendPoint, TrendResponse } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useTrend(mode: InsightMode, period: string) {
  const [points, setPoints] = useState<TrendPoint[]>([])
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
      const response = await apiClient.get<TrendResponse>(`/reporting/trend${query}`)
      setPoints(response.points)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trend')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { points, loading, error, refresh }
}
