import { useCallback, useEffect, useState } from 'react'
import type { MonthSplit } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useMonthSplits() {
  const [splits, setSplits] = useState<MonthSplit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSplits(await apiClient.get<MonthSplit[]>('/month-splits'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load month splits')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createSplit(transactionId: string, startMonth: string, numMonths: number) {
    await apiClient.post<MonthSplit>('/month-splits', { transactionId, startMonth, numMonths })
    await refresh()
  }

  async function updateSplit(id: string, startMonth: string, numMonths: number) {
    await apiClient.patch<MonthSplit>(`/month-splits/${id}`, { startMonth, numMonths })
    await refresh()
  }

  async function deleteSplit(id: string) {
    await apiClient.delete(`/month-splits/${id}`)
    await refresh()
  }

  return { splits, loading, error, refresh, createSplit, updateSplit, deleteSplit }
}
