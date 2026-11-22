import type { MonthSplit } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: MonthSplit[] = []

export function useMonthSplits() {
  const { data, loading, error, refresh } = useApiQuery<MonthSplit[]>('/month-splits', { errorMessage: 'Failed to load month splits' })

  async function createSplit(transactionId: string, startMonth: string, numMonths: number) {
    await apiClient.post<MonthSplit>('/month-splits', { transactionId, startMonth, numMonths })
    await invalidateApi()
  }

  async function updateSplit(id: string, startMonth: string, numMonths: number) {
    await apiClient.patch<MonthSplit>(`/month-splits/${id}`, { startMonth, numMonths })
    await invalidateApi()
  }

  async function deleteSplit(id: string) {
    await apiClient.delete(`/month-splits/${id}`)
    await invalidateApi()
  }

  return { splits: data ?? EMPTY, loading, error, refresh, createSplit, updateSplit, deleteSplit }
}
