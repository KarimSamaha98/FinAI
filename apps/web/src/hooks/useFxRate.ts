import { useEffect, useState } from 'react'
import { apiClient } from '../lib/apiClient'

/** Process-lifetime cache of resolved rates, keyed base:quote:date — rates are immutable daily data. */
const cache = new Map<string, number>()
const DEBOUNCE_MS = 250

/**
 * The market rate base→quote on `date` (nearest earlier published day), used to
 * preview a transaction's automatic conversion. Returns `rate: null` while
 * loading and when no rate can be resolved (503 FX_UNAVAILABLE) — the caller
 * shows "N/A". Disabled when any input is missing or base === quote.
 */
export function useFxRate(base: string | null, quote: string | null, date: string | null): { rate: number | null; loading: boolean } {
  const enabled = !!base && !!quote && !!date && base !== quote
  const key = enabled && base && quote && date ? `${base}:${quote}:${date}` : null
  const [rate, setRate] = useState<number | null>(() => (key && cache.has(key) ? cache.get(key)! : null))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!key || !base || !quote || !date) {
      setRate(null)
      setLoading(false)
      return
    }
    const cached = cache.get(key)
    if (cached != null) {
      setRate(cached)
      setLoading(false)
      return
    }

    let active = true
    setRate(null)
    setLoading(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ base, quote, date })
      apiClient
        .get<{ rate: number }>(`/fx/rate?${params.toString()}`)
        .then((result) => {
          cache.set(key, result.rate)
          if (active) setRate(result.rate)
        })
        .catch(() => {
          // No resolvable rate or a transient failure — show "N/A" rather than erroring.
          if (active) setRate(null)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key, base, quote, date])

  return { rate, loading }
}
