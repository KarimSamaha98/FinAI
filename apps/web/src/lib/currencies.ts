import type { Currency } from 'shared-types'
import { apiClient } from './apiClient'

let cache: Currency[] | null = null
let inflight: Promise<Currency[]> | null = null

/** Every currency the app supports (from the API), fetched once and memoized for the tab. */
export function fetchCurrencies(): Promise<Currency[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = apiClient
      .get<Currency[]>('/currencies')
      .then((list) => {
        cache = list
        inflight = null
        return list
      })
      .catch((error: unknown) => {
        inflight = null
        throw error
      })
  }
  return inflight
}

/** Selector options: "CAD — Canadian Dollar". */
export function currencyOptions(currencies: Currency[]): { value: string; label: string }[] {
  return currencies.map((currency) => ({ value: currency.code, label: `${currency.code} — ${currency.name}` }))
}
