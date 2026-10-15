import { useEffect, useMemo, useState } from 'react'
import type { Currency } from 'shared-types'
import { currencyOptions, fetchCurrencies } from '../lib/currencies'

/** Loads the supported currency list once (memoized in lib/currencies) and exposes dropdown options. */
export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchCurrencies()
      .then((list) => {
        if (!active) return
        setCurrencies(list)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load currencies')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(() => currencyOptions(currencies), [currencies])
  return { currencies, options, loading, error }
}
