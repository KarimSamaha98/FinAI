import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AmountKind, CategoryBreakdownPoint, TransactionView } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

export function useCategoryBreakdown(
  dateRange: DateRange,
  categoryIds: string[],
  view: TransactionView,
  kind: AmountKind,
) {
  const [points, setPoints] = useState<CategoryBreakdownPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const categoryIdsKey = categoryIds.join(',')

  const query = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null
    const params = new URLSearchParams()
    params.set('type', kind)
    params.set('from', dateRange.from)
    params.set('to', dateRange.to)
    if (categoryIdsKey) params.set('categoryIds', categoryIdsKey)
    params.set('view', view)
    return `?${params.toString()}`
    // categoryIdsKey is the stable, primitive representation of categoryIds.
  }, [dateRange.from, dateRange.to, categoryIdsKey, view, kind])

  const refresh = useCallback(async () => {
    if (!query) {
      setPoints([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get<{ points: CategoryBreakdownPoint[] }>(`/reporting/category-breakdown${query}`)
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
