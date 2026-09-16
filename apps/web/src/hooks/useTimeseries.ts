import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AmountKind, BucketGranularity, ExcludedCurrency, TimeseriesPoint, TransactionView } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

export function useTimeseries(dateRange: DateRange, categoryIds: string[], view: TransactionView, kind: AmountKind) {
  const [granularity, setGranularity] = useState<BucketGranularity>('monthly')
  const [points, setPoints] = useState<TimeseriesPoint[]>([])
  const [excludedCurrencies, setExcludedCurrencies] = useState<ExcludedCurrency[]>([])
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
      setExcludedCurrencies([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get<{
        granularity: BucketGranularity
        points: TimeseriesPoint[]
        excludedCurrencies: ExcludedCurrency[]
      }>(`/reporting/timeseries${query}`)
      setGranularity(response.granularity)
      setPoints(response.points)
      setExcludedCurrencies(response.excludedCurrencies)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeseries')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { granularity, points, excludedCurrencies, loading, error, refresh }
}
