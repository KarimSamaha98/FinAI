import type { AmountKind, HeatmapResponse, InsightMode } from 'shared-types'
import { useApiQuery } from './useApiQuery'

export function useHeatmap(mode: InsightMode, period: string, kind: AmountKind) {
  const params = new URLSearchParams({ type: kind, mode, period })
  const { data, loading, updating, error, refresh } = useApiQuery<HeatmapResponse>(`/reporting/heatmap?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load heatmap',
  })
  return { days: data?.days ?? [], loading, updating, error, refresh }
}
