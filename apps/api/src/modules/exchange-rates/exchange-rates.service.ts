import { Inject, Injectable, Logger } from '@nestjs/common'
import { format } from 'date-fns'
import { FX_RATE_PROVIDER, type CurrencyRate, type FxRateProvider, type RateObservation } from './fx-rate-provider.js'
import { nearestRate, computeTransactionConversion, type TransactionConversion } from './conversion.js'
import { FxUnavailableError } from './fx-unavailable.error.js'

/** The pivot every rate is stored against (also the provider's base). */
const PIVOT = 'USD'
/**
 * Earliest history to load for a currency the first time it's used. Defaults to
 * 2021-01-01 because the hosted Frankfurter API throttles ranges starting before
 * 2021 to 10 requests/min (a self-hosted instance has no such limit, so raising
 * FX_FLOOR_DATE there — e.g. to 2000-01-01 — is fine).
 */
const FLOOR_DATE = process.env.FX_FLOOR_DATE ?? '2021-01-01'

interface CachedSeries {
  /** Ascending by date. */
  rates: RateObservation[]
  latestDate: string | null
  /** Newest date we've already attempted to fetch through (so a failed or empty day isn't retried). */
  attemptedThrough: string | null
}

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Resolves FX rates from an in-memory cache, filling it on demand from the
 * provider (quoted against USD). There is no persistent rate store: a
 * currency's full daily history is fetched once on first use and reused for
 * the process lifetime; a requested day that isn't available yet falls back to
 * the nearest earlier published day. Any day beyond what's cached is fetched
 * at most once per process. Process-global because rates are public data
 * shared by every user.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name)
  private readonly cache = new Map<string, CachedSeries>()

  constructor(@Inject(FX_RATE_PROVIDER) private readonly provider: FxRateProvider) {}

  /** The rate base→quote on `date`, or the nearest available day. Null when unresolvable. */
  async rateOnDate(base: string, quote: string, date: string): Promise<number | null> {
    if (base === quote) return 1
    const [baseRate, quoteRate] = await Promise.all([this.rateVsPivot(base, date), this.rateVsPivot(quote, date)])
    if (baseRate == null || quoteRate == null) return null
    return quoteRate / baseRate
  }

  /** Like rateOnDate but throws FxUnavailableError instead of returning null. */
  async requireRate(base: string, quote: string, date: string): Promise<number> {
    const rate = await this.rateOnDate(base, quote, date)
    if (rate == null) throw FxUnavailableError.pair(base, quote, date)
    return rate
  }

  /** Best-effort warm so later lookups are cache-only. Failures are swallowed (later callers throw/fallback). */
  async warm(currencies: string[]): Promise<void> {
    const today = todayISO()
    await Promise.all([...new Set(currencies)].filter((c) => c !== PIVOT).map((c) => this.rateVsPivot(c, today)))
  }

  /**
   * Resolve and materialize the home-currency value for one transaction. Never
   * throws: with no override and no auto rate it returns a null-valued
   * conversion, so the row is stored unpriced and repaired on the next
   * `/fx/sync` (import does the same). Reads/aggregates that genuinely need a
   * rate call `requireRate` and still fail loudly.
   */
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

  private getEntry(currency: string): CachedSeries {
    let entry = this.cache.get(currency)
    if (!entry) {
      entry = { rates: [], latestDate: null, attemptedThrough: null }
      this.cache.set(currency, entry)
    }
    return entry
  }

  /** currency's rate against the pivot on `date` (nearest available day), fetching the series on demand. */
  private async rateVsPivot(currency: string, date: string): Promise<number | null> {
    if (currency === PIVOT) return 1
    const entry = this.getEntry(currency)
    const today = todayISO()
    const target = date > today ? date : today
    const needsFetch = entry.latestDate == null || (target > entry.latestDate && target > (entry.attemptedThrough ?? ''))
    if (needsFetch) {
      const from = entry.latestDate ?? FLOOR_DATE
      try {
        const fetched = await this.provider.fetchSeries([currency], from, target)
        this.merge(entry, fetched)
      } catch (error) {
        this.logger.warn(`FX fetch failed for ${currency}→${PIVOT} @ ${target}: ${String(error)}`)
      }
      entry.attemptedThrough = target
    }
    return nearestOrEarliest(entry.rates, date)
  }

  private merge(entry: CachedSeries, fetched: CurrencyRate[]): void {
    if (fetched.length === 0) return
    const byDate = new Map(entry.rates.map((r) => [r.date, r]))
    for (const row of fetched) byDate.set(row.date, { date: row.date, rate: row.rate })
    entry.rates = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    entry.latestDate = entry.rates[entry.rates.length - 1].date
  }
}

/** The nearest published day at or before `date`; the earliest day as a last resort; null when empty. */
function nearestOrEarliest(rates: RateObservation[], date: string): number | null {
  if (rates.length === 0) return null
  return nearestRate(rates, date) ?? rates[0].rate
}
