import { useCallback, useEffect, useState } from 'react'
import type { FxRate } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useFxRates() {
  const [rates, setRates] = useState<FxRate[]>([])
  const [currenciesInUse, setCurrenciesInUse] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ratesResult, currenciesResult] = await Promise.all([
        apiClient.get<FxRate[]>('/fx-rates'),
        apiClient.get<string[]>('/fx-rates/currencies-in-use'),
      ])
      setRates(ratesResult)
      setCurrenciesInUse(currenciesResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FX rates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function upsertRate(baseCurrency: string, quoteCurrency: string, rate: number) {
    await apiClient.post<FxRate>('/fx-rates', { baseCurrency, quoteCurrency, rate })
    await refresh()
  }

  return { rates, currenciesInUse, loading, error, refresh, upsertRate }
}
