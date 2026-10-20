import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ImportantThingsResponse, InsightMode } from 'shared-types'
import { apiClient } from '../lib/apiClient'

const EMPTY_RESPONSE: ImportantThingsResponse = {
  categoryChanges: [],
  topExpenses: [],
  recurringPayments: [],
}

export function useImportantThings(mode: InsightMode, period: string) {
  const [data, setData] = useState<ImportantThingsResponse>(EMPTY_RESPONSE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('mode', mode)
    params.set('period', period)
    return `?${params.toString()}`
  }, [mode, period])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.get<ImportantThingsResponse>(`/reporting/important-things${query}`)
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load important things')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...data, loading, error, refresh }
}
