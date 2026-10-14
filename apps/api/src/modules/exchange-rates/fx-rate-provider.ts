/** A single daily observation. */
export interface RateObservation {
  /** yyyy-MM-dd */
  date: string
  rate: number
}

/** DI token for the injected FxRateProvider. */
export const FX_RATE_PROVIDER = Symbol('FX_RATE_PROVIDER')

/**
 * A source of daily FX rates. Implemented by FrankfurterProvider in production
 * and replaced by a deterministic fake in unit tests.
 */
export interface FxRateProvider {
  /** Daily base→quote rates over [from, to] (inclusive), ascending by date. Returns only published dates. */
  fetchTimeSeries(base: string, quote: string, from: string, to: string): Promise<RateObservation[]>
}
