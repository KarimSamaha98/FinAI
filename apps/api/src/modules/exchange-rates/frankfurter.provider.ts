import type { FxRateProvider, RateObservation } from './fx-rate-provider.js'

const DEFAULT_BASE_URL = 'https://api.frankfurter.dev/v2'
const DEFAULT_TIMEOUT_MS = 8000

/** The v2 /rates endpoint returns a flat array of these. */
interface FrankfurterRate {
  date: string
  base: string
  quote: string
  rate: number
}

/**
 * Frankfurter (https://frankfurter.dev) — free, no API key, no quotas, daily
 * rates for hundreds of currencies back to 1948. Only the time-series endpoint
 * is used; callers pass a single date as from=to.
 */
export class FrankfurterProvider implements FxRateProvider {
  constructor(
    private readonly baseUrl: string = process.env.FRANKFURTER_API_URL ?? DEFAULT_BASE_URL,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async fetchTimeSeries(base: string, quote: string, from: string, to: string): Promise<RateObservation[]> {
    const params = new URLSearchParams({ base: base.toLowerCase(), quotes: quote.toLowerCase(), from, to })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/rates?${params.toString()}`, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`FX provider responded ${response.status}`)
      }
      const data = (await response.json()) as FrankfurterRate[]
      if (!Array.isArray(data)) return []
      return data
        .filter((row) => typeof row?.rate === 'number' && typeof row?.date === 'string')
        .map((row) => ({ date: row.date, rate: row.rate }))
    } finally {
      clearTimeout(timer)
    }
  }
}
