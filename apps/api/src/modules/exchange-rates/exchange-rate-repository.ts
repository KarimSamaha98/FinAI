import { and, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { exchangeRates } from '../../db/schema.js'

/** DI token for the injected ExchangeRateStore. */
export const EXCHANGE_RATE_STORE = Symbol('EXCHANGE_RATE_STORE')

export interface StoredRate {
  base: string
  quote: string
  date: string
  rate: number
}

/** The sliver of the rate cache ExchangeRatesService needs — faked in unit tests. */
export interface ExchangeRateStore {
  /** Cached rates for the pair in [from, to], ascending by date. */
  listRange(base: string, quote: string, from: string, to: string): Promise<StoredRate[]>
  upsertMany(rows: StoredRate[]): Promise<void>
}

function toStoredRate(row: typeof exchangeRates.$inferSelect): StoredRate {
  return { base: row.baseCurrency, quote: row.quoteCurrency, date: row.date, rate: Number(row.rate) }
}

/**
 * Data access for the global exchange_rates cache. Runs on the raw DB (no
 * tenant context) — the table is public reference data whose RLS policies are
 * permissive by design (see the exchange_rates migration).
 */
export class ExchangeRateRepository implements ExchangeRateStore {
  constructor(private readonly db: Db) {}

  async listRange(base: string, quote: string, from: string, to: string): Promise<StoredRate[]> {
    const rows = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, base),
          eq(exchangeRates.quoteCurrency, quote),
          gte(exchangeRates.date, from),
          lte(exchangeRates.date, to),
        ),
      )
      .orderBy(exchangeRates.date)
    return rows.map(toStoredRate)
  }

  async upsertMany(rows: StoredRate[]): Promise<void> {
    for (const row of rows) {
      await this.db
        .insert(exchangeRates)
        .values({ baseCurrency: row.base, quoteCurrency: row.quote, date: row.date, rate: String(row.rate) })
        .onConflictDoUpdate({
          target: [exchangeRates.baseCurrency, exchangeRates.quoteCurrency, exchangeRates.date],
          set: { rate: String(row.rate), fetchedAt: new Date() },
        })
    }
  }
}
