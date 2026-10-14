import { describe, expect, it } from 'vitest'
import { ExchangeRatesService } from '../../src/modules/exchange-rates/exchange-rates.service.js'
import type { ExchangeRateStore, StoredRate } from '../../src/modules/exchange-rates/exchange-rate-repository.js'
import type { FxRateProvider, RateObservation } from '../../src/modules/exchange-rates/fx-rate-provider.js'

/** In-memory rate cache (mirrors the Postgres exchange_rates table). */
class FakeStore implements ExchangeRateStore {
  rows = new Map<string, StoredRate>()
  upsertCalls = 0

  private key(row: StoredRate): string {
    return `${row.base}|${row.quote}|${row.date}`
  }

  async listRange(base: string, quote: string, from: string, to: string): Promise<StoredRate[]> {
    return [...this.rows.values()]
      .filter((row) => row.base === base && row.quote === quote && row.date >= from && row.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  async upsertMany(rows: StoredRate[]): Promise<void> {
    this.upsertCalls += 1
    for (const row of rows) this.rows.set(this.key(row), row)
  }
}

/** Deterministic provider — no network. */
class FakeProvider implements FxRateProvider {
  calls = 0
  constructor(private readonly series: Record<string, RateObservation[]> = {}) {}

  async fetchTimeSeries(base: string, quote: string, from: string, to: string): Promise<RateObservation[]> {
    this.calls += 1
    return (this.series[`${base}|${quote}`] ?? []).filter((o) => o.date >= from && o.date <= to)
  }
}

const usdCad: RateObservation[] = [
  { date: '2026-10-01', rate: 1.42 },
  { date: '2026-10-02', rate: 1.43 },
  { date: '2026-10-05', rate: 1.44 },
]

function makeService(series: Record<string, RateObservation[]> = { 'USD|CAD': usdCad }) {
  const store = new FakeStore()
  const provider = new FakeProvider(series)
  const service = new ExchangeRatesService(store, provider)
  return { service, store, provider }
}

describe('ExchangeRatesService.rateOnDate', () => {
  it('fetches on a cache miss and serves the same date from the cache afterwards', async () => {
    const { service, provider } = makeService()
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-02')).toBe(1.43)
    expect(provider.calls).toBe(1)
    // Second lookup for the same date is an exact-date cache hit.
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-02')).toBe(1.43)
    expect(provider.calls).toBe(1)
  })

  it('uses each date`s own rate, not a cached earlier one', async () => {
    const { service } = makeService()
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-01')).toBe(1.42)
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-02')).toBe(1.43)
  })

  it('uses the nearest earlier rate for a weekend', async () => {
    const { service } = makeService()
    // 2026-10-04 is a Sunday with no observation → Friday 2026-10-02.
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-04')).toBe(1.43)
  })

  it('returns 1 for identical currencies without touching the provider', async () => {
    const { service, provider } = makeService()
    expect(await service.rateOnDate('CAD', 'CAD', '2026-10-04')).toBe(1)
    expect(provider.calls).toBe(0)
  })

  it('returns null when the provider has no data (unsupported pair)', async () => {
    const { service } = makeService({})
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-01')).toBeNull()
  })

  it('returns null (does not throw) when the provider fails', async () => {
    const store = new FakeStore()
    const provider: FxRateProvider = {
      fetchTimeSeries: async () => {
        throw new Error('network down')
      },
    }
    const service = new ExchangeRatesService(store, provider)
    expect(await service.rateOnDate('USD', 'CAD', '2026-10-01')).toBeNull()
  })
})

describe('ExchangeRatesService.ensureRates', () => {
  it('upserts only the missing days and skips the fetch once the range is covered', async () => {
    const { service, store, provider } = makeService()
    await service.ensureRates('USD', 'CAD', '2026-10-01', '2026-10-05')
    expect(store.rows.size).toBe(3)
    expect(store.upsertCalls).toBe(1)
    expect(provider.calls).toBe(1)

    // Range already covered → no fetch, no writes.
    await service.ensureRates('USD', 'CAD', '2026-10-01', '2026-10-05')
    expect(store.upsertCalls).toBe(1)
    expect(provider.calls).toBe(1)
  })
})

describe('ExchangeRatesService.conversionFor', () => {
  it('materializes an automatic conversion for a foreign currency', async () => {
    const { service } = makeService()
    expect(await service.conversionFor({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', date: '2026-10-02' })).toEqual({
      exchangeRate: 1.43,
      convertedValue: 143,
      rateSource: 'auto',
    })
  })

  it('honors an override without hitting the provider', async () => {
    const { service, provider } = makeService({})
    expect(
      await service.conversionFor({ amount: 100, currencyCode: 'USD', homeCurrencyCode: 'CAD', date: '2026-10-02', override: 1.5 }),
    ).toEqual({ exchangeRate: 1.5, convertedValue: 150, rateSource: 'manual' })
    expect(provider.calls).toBe(0)
  })

  it('is a no-op conversion when the currency already matches home', async () => {
    const { service, provider } = makeService({})
    expect(await service.conversionFor({ amount: 100, currencyCode: 'CAD', homeCurrencyCode: 'CAD', date: '2026-10-02' })).toEqual({
      exchangeRate: 1,
      convertedValue: 100,
      rateSource: 'auto',
    })
    expect(provider.calls).toBe(0)
  })
})
