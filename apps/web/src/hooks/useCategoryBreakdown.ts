import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AmountKind, CategoryBreakdownPoint, CategoryBreakdownResponse, InsightMode } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useCategoryBreakdown(mode: InsightMode, period: string, kind: AmountKind) {
  const [points, setPoints] = useState<CategoryBreakdownPoint[]>([])
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
      const response = await apiClient.get<CategoryBreakdownResponse>(`/reporting/category-breakdown${query}`)
      setPoints(response.points)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load category breakdown')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { points, loading, error, refresh }
}
