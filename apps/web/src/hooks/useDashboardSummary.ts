import type { DashboardSummary, InsightMode } from 'shared-types'
import { useApiQuery } from './useApiQuery'

const EMPTY_SUMMARY: DashboardSummary = { totalExpense: 0, totalIncome: 0, netIncome: 0, savingsRate: null }

export function useDashboardSummary(mode: InsightMode, period: string) {
  const params = new URLSearchParams({ mode, period })
  const { data, loading, updating, error, refresh } = useApiQuery<DashboardSummary>(`/reporting/summary?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load dashboard summary',
  })
  return { ...(data ?? EMPTY_SUMMARY), loading, updating, error, refresh }
}
