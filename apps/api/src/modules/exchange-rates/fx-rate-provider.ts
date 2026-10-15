/** A single daily observation of a currency against the pivot. */
export interface RateObservation {
  /** yyyy-MM-dd */
  date: string
  rate: number
}

/** One currency's rate on one day (against the pivot), as returned by the provider. */
export interface CurrencyRate {
  currencyCode: string
  /** yyyy-MM-dd */
  date: string
  rate: number
}

/** A currency the provider can price, with its label + valid period. */
export interface ProviderCurrency {
  code: string
  name: string
  symbol: string | null
  startDate: string | null
  endDate: string | null
}

/** DI token for the injected FxRateProvider. */
export const FX_RATE_PROVIDER = Symbol('FX_RATE_PROVIDER')

/**
 * A source of daily FX rates, quoted against a single pivot currency (see
 * ExchangeRatesService for the pivot). Implemented by FrankfurterProvider in
 * production and replaced by a deterministic fake in unit tests.
 */
export interface FxRateProvider {
  /** Daily pivot→currency rates for the given currencies over [from, to] (inclusive). Returns only published dates. */
  fetchSeries(currencies: string[], from: string, to: string): Promise<CurrencyRate[]>
  /** The most recent published rate for each currency. */
  fetchLatest(currencies: string[]): Promise<CurrencyRate[]>
  /** Every currency the provider supports, with labels. */
  fetchCurrencies(): Promise<ProviderCurrency[]>
}
