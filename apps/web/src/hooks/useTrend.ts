import type { InsightMode, TrendResponse } from 'shared-types'
import { useApiQuery } from './useApiQuery'

export function useTrend(mode: InsightMode, period: string) {
  const params = new URLSearchParams({ mode, period })
  const { data, loading, updating, error, refresh } = useApiQuery<TrendResponse>(`/reporting/trend?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load trend',
  })
  return {
    points: data?.points ?? [],
    earliestPeriod: data?.earliestPeriod ?? null,
    latestPeriod: data?.latestPeriod ?? null,
    loading,
    updating,
    error,
    refresh,
  }
}
