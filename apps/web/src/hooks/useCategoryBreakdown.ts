import type { AmountKind, CategoryBreakdownResponse, InsightMode } from 'shared-types'
import { useApiQuery } from './useApiQuery'

export function useCategoryBreakdown(mode: InsightMode, period: string, kind: AmountKind) {
  const params = new URLSearchParams({ type: kind, mode, period })
  const { data, loading, updating, error, refresh } = useApiQuery<CategoryBreakdownResponse>(`/reporting/category-breakdown?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load category breakdown',
  })
  return { points: data?.points ?? [], loading, updating, error, refresh }
}
