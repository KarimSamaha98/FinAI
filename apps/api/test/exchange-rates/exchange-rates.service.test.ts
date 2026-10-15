import { describe, expect, it } from 'vitest'
import { ExchangeRatesService } from '../../src/modules/exchange-rates/exchange-rates.service.js'
import { FxUnavailableError } from '../../src/modules/exchange-rates/fx-unavailable.error.js'
import type { CurrencyRate, FxRateProvider, ProviderCurrency, RateObservation } from '../../src/modules/exchange-rates/fx-rate-provider.js'

/** Deterministic provider — no network. Series are keyed by currency code (vs the USD pivot). */
class FakeProvider implements FxRateProvider {
  calls = 0
  constructor(private readonly series: Record<string, RateObservation[]> = {}) {}

  async fetchSeries(currencies: string[], from: string, to: string): Promise<CurrencyRate[]> {
    this.calls += 1
    const out: CurrencyRate[] = []
    for (const currencyCode of currencies) {
      for (const o of this.series[currencyCode] ?? []) {
        if (o.date >= from && o.date <= to) out.push({ currencyCode, date: o.date, rate: o.rate })
      }
    }
    return out
  }

  async fetchLatest(currencies: string[]): Promise<CurrencyRate[]> {
    return this.fetchSeries(currencies, '0000-01-01', '9999-12-31')
  }

  async fetchCurrencies(): Promise<ProviderCurrency[]> {
    return []
  }
}

const usdCad: RateObservation[] = [
  { date: '2026-06-01', rate: 1.35 },
  { date: '2026-06-02', rate: 1.36 },
  { date: '2026-06-05', rate: 1.37 },
]
const usdEur: RateObservation[] = [
  { date: '2026-06-01', rate: 0.9 },
  { date: '2026-06-02', rate: 0.91 },
  { date: '2026-06-05', rate: 0.92 },
]

function makeService(series: Record<string, RateObservation[]> = { CAD: usdCad, EUR: usdEur }) {
  const provider = new FakeProvider(series)
  const service = new ExchangeRatesService(provider)
  return { service, provider }
}

describe('ExchangeRatesService.rateOnDate', () => {
  it('resolves quote per base against the pivot and caches the series', async () => {
    const { service, provider } = makeService()
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-02')).toBe(1.36)
    expect(provider.calls).toBe(1)
    // Same date from cache, and any other past date too — one fetch per process.
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-02')).toBe(1.36)
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-01')).toBe(1.35)
    expect(provider.calls).toBe(1)
  })

  it('inverts and triangulates through the pivot', async () => {
    const { service } = makeService()
    expect(await service.rateOnDate('CAD', 'USD', '2026-06-02')).toBeCloseTo(1 / 1.36)
    expect(await service.rateOnDate('CAD', 'EUR', '2026-06-02')).toBeCloseTo(0.91 / 1.36)
  })

  it('falls back to the nearest earlier published day (weekend/holiday)', async () => {
    const { service } = makeService()
    // 2026-06-06 / 06-07 are a Sat/Sun with no observation → Friday 06-05.
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-07')).toBe(1.37)
  })

  it('returns 1 for identical currencies without touching the provider', async () => {
    const { service, provider } = makeService()
    expect(await service.rateOnDate('CAD', 'CAD', '2026-06-04')).toBe(1)
    expect(provider.calls).toBe(0)
  })

  it('returns null when the provider has no data, and requireRate throws', async () => {
    const { service } = makeService({})
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-01')).toBeNull()
    await expect(service.requireRate('USD', 'CAD', '2026-06-01')).rejects.toBeInstanceOf(FxUnavailableError)
  })

  it('returns null (does not throw) when the provider fails', async () => {
    const provider: FxRateProvider = {
      fetchSeries: async () => {
        throw new Error('network down')
      },
      fetchLatest: async () => [],
      fetchCurrencies: async () => [],
    }
    const service = new ExchangeRatesService(provider)
    expect(await service.rateOnDate('USD', 'CAD', '2026-06-01')).toBeNull()
  })
})

describe('ExchangeRatesService.conversionFor', () => {
  it('materializes an automatic conversion for a foreign currency', async () => {
    const { service } = makeService()
    expect(await service.conversionFor({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', date: '2026-06-02' })).toEqual({
      exchangeRate: 1.36,
      convertedValue: 136,
      rateSource: 'auto',
    })
  })

  it('honors an override without hitting the provider', async () => {
    const { service, provider } = makeService({})
    expect(
      await service.conversionFor({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', date: '2026-06-02', override: 1.5 }),
    ).toEqual({ exchangeRate: 1.5, convertedValue: 150, rateSource: 'manual' })
    expect(provider.calls).toBe(0)
  })

  it('is a no-op conversion when the currency already matches home', async () => {
    const { service, provider } = makeService({})
    expect(await service.conversionFor({ amount: 100, currencyCode: 'CAD', homeCurrencyCode: 'CAD', date: '2026-06-02' })).toEqual({
      exchangeRate: 1,
      convertedValue: 100,
      rateSource: 'auto',
    })
    expect(provider.calls).toBe(0)
  })

  it('returns an unpriced conversion when the auto rate cannot be resolved (repaired later)', async () => {
    const { service } = makeService({})
    expect(
      await service.conversionFor({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', date: '2026-06-02' }),
    ).toEqual({ exchangeRate: null, convertedValue: null, rateSource: 'auto' })
  })
})
