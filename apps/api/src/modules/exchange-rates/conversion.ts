import type { RateObservation } from './fx-rate-provider.js'

/** Rounds to 2 decimals (money), matching the numeric(14,2) columns. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The rate in force on `date`: the observation on that day, or the nearest
 * earlier one (weekends/holidays carry no observation of their own). Returns
 * null when every observation is after `date` (or the list is empty).
 * `observations` must be ascending by date.
 */
export function nearestRate(observations: RateObservation[], date: string): number | null {
  let best: number | null = null
  for (const observation of observations) {
    if (observation.date <= date) best = observation.rate
    else break
  }
  return best
}

/** Precedence: a user override wins, then the auto (market) rate, then a manual fallback. */
export function resolveRate(input: { override?: number | null; auto?: number | null; fallback?: number | null }): number | null {
  if (input.override != null) return input.override
  if (input.auto != null) return input.auto
  if (input.fallback != null) return input.fallback
  return null
}

export interface TransactionConversion {
  exchangeRate: number | null
  convertedValue: number | null
  rateSource: 'auto' | 'manual'
}

/**
 * The home-currency materialization for one transaction: rate = currency → home
 * (exactly 1 when the currencies match, and no override is ever applied then),
 * value = amount × rate (signed like amount). An explicit override wins;
 * otherwise the auto rate; otherwise there is no conversion and the value is
 * null (the transaction is then excluded from home-currency aggregates).
 */
export function computeTransactionConversion(input: {
  amount: number
  currencyCode: string
  homeCurrencyCode: string
  autoRate: number | null
  override?: number | null
}): TransactionConversion {
  if (input.currencyCode === input.homeCurrencyCode) {
    return { exchangeRate: 1, convertedValue: roundMoney(input.amount), rateSource: 'auto' }
  }
  const override = input.override ?? null
  const rate = resolveRate({ override, auto: input.autoRate })
  if (rate == null) {
    return { exchangeRate: null, convertedValue: null, rateSource: override != null ? 'manual' : 'auto' }
  }
  return { exchangeRate: rate, convertedValue: roundMoney(input.amount * rate), rateSource: override != null ? 'manual' : 'auto' }
}
