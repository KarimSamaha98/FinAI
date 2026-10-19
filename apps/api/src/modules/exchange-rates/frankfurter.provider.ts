import type { CurrencyRate, FxRateProvider, ProviderCurrency } from './fx-rate-provider.js'

const DEFAULT_BASE_URL = 'https://api.frankfurter.dev/v2'
/**
 * The first fetch of a currency pulls its entire history from FX_FLOOR_DATE — a
 * large response that Frankfurter can take 20s+ to serve cold. This must exceed
 * that, not a typical single-day request.
 */
const DEFAULT_TIMEOUT_MS = 30_000
/** The pivot: every stored rate is "units of currency per 1 of this". */
const PIVOT = 'usd'

/** The v2 /rates endpoint returns a flat array of these. */
interface FrankfurterRate {
  date: string
  base: string
  quote: string
  rate: number
}

/** The v2 /currencies endpoint returns a flat array of these. */
interface FrankfurterCurrency {
  iso_code: string
  name: string
  symbol?: string | null
  start_date?: string | null
  end_date?: string | null
}

/**
 * Frankfurter (https://frankfurter.dev) — free, no API key, no quotas, daily
 * rates for hundreds of currencies. All requests are quoted against USD; the
 * caller passes the currencies it needs as `quotes`.
 */
export class FrankfurterProvider implements FxRateProvider {
  constructor(
    private readonly baseUrl: string = process.env.FRANKFURTER_API_URL ?? DEFAULT_BASE_URL,
    private readonly timeoutMs: number = Number(process.env.FRANKFURTER_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  ) {}

  fetchSeries(currencies: string[], from: string, to: string): Promise<CurrencyRate[]> {
    return this.fetchRates({ quotes: currencies.join(','), from, to })
  }

  fetchLatest(currencies: string[]): Promise<CurrencyRate[]> {
    return this.fetchRates({ quotes: currencies.join(',') })
  }

  async fetchCurrencies(): Promise<ProviderCurrency[]> {
    const data = await this.request<FrankfurterCurrency[]>('/currencies')
    if (!Array.isArray(data)) return []
    return data
      .filter((row) => typeof row?.iso_code === 'string' && typeof row?.name === 'string')
      .map((row) => ({
        code: row.iso_code.toUpperCase(),
        name: row.name,
        symbol: row.symbol && row.symbol.length > 0 ? row.symbol : null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
      }))
  }

  private async fetchRates(params: Record<string, string>): Promise<CurrencyRate[]> {
    const search = new URLSearchParams({ base: PIVOT, ...params })
    const data = await this.request<FrankfurterRate[]>(`/rates?${search.toString()}`)
    if (!Array.isArray(data)) return []
    return data
      .filter((row) => typeof row?.rate === 'number' && typeof row?.date === 'string' && typeof row?.quote === 'string')
      .map((row) => ({ currencyCode: row.quote.toUpperCase(), date: row.date, rate: row.rate }))
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`FX provider responded ${response.status}`)
      }
      return (await response.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}
