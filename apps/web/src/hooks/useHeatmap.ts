import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AmountKind, HeatmapDay, HeatmapResponse, InsightMode } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useHeatmap(mode: InsightMode, period: string, kind: AmountKind) {
  const [days, setDays] = useState<HeatmapDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('type', kind)
    params.set('mode', mode)
    params.set('period', period)
    return `?${params.toString()}`
  }, [mode, period, kind])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get<HeatmapResponse>(`/reporting/heatmap${query}`)
      setDays(response.days)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load heatmap')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { days, loading, error, refresh }
}
