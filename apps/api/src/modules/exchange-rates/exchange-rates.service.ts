import { Inject, Injectable, Logger } from '@nestjs/common'
import { addDays, format, parseISO } from 'date-fns'
import { EXCHANGE_RATE_STORE, type ExchangeRateStore, type StoredRate } from './exchange-rate-repository.js'
import { FX_RATE_PROVIDER, type FxRateProvider, type RateObservation } from './fx-rate-provider.js'
import { nearestRate, computeTransactionConversion, type TransactionConversion } from './conversion.js'

/** How far back from a target date to look for the nearest published rate (weekends/holidays). */
const LOOKBACK_DAYS = 60

/**
 * Resolves FX rates and materializes per-transaction home-currency values.
 * Rates are global reference data, so the cache is read/written on the raw DB
 * (no tenant context); the network fetch never happens inside a tenant
 * transaction — callers resolve rates first, then write.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name)
  // Dates we've already fetched for, so a weekend/holiday (which never gets an
  // exact observation) isn't re-fetched on every call. Process-local; a restart
  // re-checks once.
  private readonly attempted = new Set<string>()

  constructor(
    @Inject(EXCHANGE_RATE_STORE) private readonly repo: ExchangeRateStore,
    @Inject(FX_RATE_PROVIDER) private readonly provider: FxRateProvider,
  ) {}

  /** The rate base→quote on `date` (or the nearest earlier published day), fetching missing history. Null when unavailable. */
  async rateOnDate(base: string, quote: string, date: string): Promise<number | null> {
    if (base === quote) return 1
    // Prefer the exact date: a cached earlier day must not shadow a rate the
    // provider publishes for this date.
    const [exact] = await this.repo.listRange(base, quote, date, date)
    if (exact) return exact.rate

    const from = format(addDays(parseISO(date), -LOOKBACK_DAYS), 'yyyy-MM-dd')
    const key = `${base}|${quote}|${date}`
    if (!this.attempted.has(key)) {
      try {
        await this.ensureRates(base, quote, from, date)
        this.attempted.add(key)
      } catch (error) {
        this.logger.warn(`FX fetch failed for ${base}→${quote} @ ${date}: ${String(error)}`)
      }
    }
    return nearestRate(asObservations(await this.repo.listRange(base, quote, from, date)), date)
  }

  /** Ensure daily base→quote rates over [from, to] are cached, fetching any missing days in one request. */
  async ensureRates(base: string, quote: string, from: string, to: string): Promise<void> {
    if (base === quote) return
    const existing = new Set((await this.repo.listRange(base, quote, from, to)).map((r) => r.date))
    const fetched = await this.provider.fetchTimeSeries(base, quote, from, to)
    const missing = fetched.filter((observation) => !existing.has(observation.date))
    if (missing.length) {
      await this.repo.upsertMany(missing.map((observation) => ({ base, quote, date: observation.date, rate: observation.rate })))
    }
  }

  /**
   * Ensure every currency in `rows` is cached against home over its span of
   * dates — one time-series request per distinct currency. Best-effort: a
   * currency whose fetch fails keeps whatever is cached (its rows may then be
   * excluded). Call this before materializing a batch (import / recompute).
   */
  async ensureRatesFor(rows: { currencyCode: string; date: string }[], homeCurrencyCode: string): Promise<void> {
    const ranges = new Map<string, { min: string; max: string }>()
    for (const row of rows) {
      if (row.currencyCode === homeCurrencyCode) continue
      const range = ranges.get(row.currencyCode)
      if (!range) ranges.set(row.currencyCode, { min: row.date, max: row.date })
      else ranges.set(row.currencyCode, { min: row.date < range.min ? row.date : range.min, max: row.date > range.max ? row.date : range.max })
    }
    for (const [currency, range] of ranges) {
      try {
        const from = format(addDays(parseISO(range.min), -LOOKBACK_DAYS), 'yyyy-MM-dd')
        await this.ensureRates(currency, homeCurrencyCode, from, range.max)
      } catch (error) {
        this.logger.warn(`FX fetch failed for ${currency}→${homeCurrencyCode}: ${String(error)}`)
      }
    }
  }

  /** Resolve and materialize the home-currency value for one transaction. */
  async conversionFor(input: {
    amount: number
    currencyCode: string
    homeCurrencyCode: string
    date: string
    override?: number | null
  }): Promise<TransactionConversion> {
    if (input.currencyCode === input.homeCurrencyCode) {
      return computeTransactionConversion({ ...input, autoRate: 1 })
    }
    const override = input.override ?? null
    const autoRate = override != null ? null : await this.rateOnDate(input.currencyCode, input.homeCurrencyCode, input.date)
    return computeTransactionConversion({
      amount: input.amount,
      currencyCode: input.currencyCode,
      homeCurrencyCode: input.homeCurrencyCode,
      autoRate,
      override,
    })
  }
}

function asObservations(rates: StoredRate[]): RateObservation[] {
  return rates.map((rate) => ({ date: rate.date, rate: rate.rate }))
}
