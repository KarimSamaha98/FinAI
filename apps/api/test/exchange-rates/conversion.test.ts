import { describe, expect, it } from 'vitest'
import type { RateObservation } from '../../src/modules/exchange-rates/fx-rate-provider.js'
import { nearestRate, resolveRate, computeTransactionConversion, roundMoney } from '../../src/modules/exchange-rates/conversion.js'

const obs = (...pairs: [string, number][]): RateObservation[] => pairs.map(([date, rate]) => ({ date, rate }))

describe('nearestRate', () => {
  const series = obs(['2026-10-01', 1.42], ['2026-10-02', 1.43], ['2026-10-05', 1.44])

  it('returns the rate on an exact date', () => {
    expect(nearestRate(series, '2026-10-02')).toBe(1.43)
  })

  it('falls back to the nearest earlier day for a weekend/holiday gap', () => {
    // 2026-10-03 / 10-04 are a Sat/Sun with no observation → Friday (10-02).
    expect(nearestRate(series, '2026-10-03')).toBe(1.43)
    expect(nearestRate(series, '2026-10-04')).toBe(1.43)
  })

  it('returns null when every observation is after the date', () => {
    expect(nearestRate(series, '2026-09-30')).toBeNull()
  })

  it('returns null for an empty series', () => {
    expect(nearestRate([], '2026-10-01')).toBeNull()
  })
})

describe('resolveRate', () => {
  it('prefers an override, then auto, then fallback', () => {
    expect(resolveRate({ override: 1.5, auto: 1.4, fallback: 1.3 })).toBe(1.5)
    expect(resolveRate({ auto: 1.4, fallback: 1.3 })).toBe(1.4)
    expect(resolveRate({ fallback: 1.3 })).toBe(1.3)
    expect(resolveRate({})).toBeNull()
  })

  it('treats a null override/auto as absent', () => {
    expect(resolveRate({ override: null, auto: 1.4 })).toBe(1.4)
    expect(resolveRate({ override: null, auto: null, fallback: null })).toBeNull()
  })
})

describe('computeTransactionConversion', () => {
  it('uses rate 1 when the transaction is already in the home currency', () => {
    expect(
      computeTransactionConversion({ amount: 100, currencyCode: 'CAD', homeCurrencyCode: 'CAD', autoRate: 9 }),
    ).toEqual({ exchangeRate: 1, convertedValue: 100, rateSource: 'auto' })
  })

  it('converts with the auto rate, keeping the sign', () => {
    expect(
      computeTransactionConversion({ amount: -100, currencyCode: 'USD', homeCurrencyCode: 'CAD', autoRate: 1.42 }),
    ).toEqual({ exchangeRate: 1.42, convertedValue: -142, rateSource: 'auto' })
  })

  it('lets an override win and marks the source manual', () => {
    expect(
      computeTransactionConversion({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', autoRate: 1.42, override: 1.5 }),
    ).toEqual({ exchangeRate: 1.5, convertedValue: 150, rateSource: 'manual' })
  })

  it('yields a null value when no rate is available', () => {
    expect(
      computeTransactionConversion({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', autoRate: null }),
    ).toEqual({ exchangeRate: null, convertedValue: null, rateSource: 'auto' })
  })

  it('rounds the converted value to 2 decimals', () => {
    expect(
      computeTransactionConversion({ amount: 33.33, currencyCode: 'USD', homeCurrencyCode: 'CAD', autoRate: 1.4246 }).convertedValue,
    ).toBe(47.48)
    expect(roundMoney(47.479999)).toBe(47.48)
  })
})
