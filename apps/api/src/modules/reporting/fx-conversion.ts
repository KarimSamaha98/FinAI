import { eq } from 'drizzle-orm'
import type { ExcludedCurrency } from 'shared-types'
import type { Db } from '../../db/client.js'
import { fxRates } from '../../db/schema.js'

export interface ConvertedRow<T> {
  row: T
  convertedAmount: number
}

export interface ConversionResult<T> {
  converted: ConvertedRow<T>[]
  excludedCurrencies: ExcludedCurrency[]
}

/**
 * Converts each row's amount into `targetCurrency` using the user's manually
 * maintained fx_rates (flat current-rate multiply, no historical lookup).
 * Rows in a currency with no rate to the target are dropped and tallied into
 * excludedCurrencies rather than thrown — callers surface that as a warning.
 * Shared by ChartAggregationService (target = home currency) and
 * AccountsService (target = the account's own currency) so there's one FX
 * lookup routine instead of two copies. Must run inside a tenant-context
 * transaction — relies on RLS to scope the fx_rates read to the caller.
 */
export async function convertToTargetCurrency<T extends { currencyCode: string; amount: number }>(
  tx: Db,
  rows: T[],
  targetCurrency: string,
): Promise<ConversionResult<T>> {
  const rateRows = await tx.select().from(fxRates).where(eq(fxRates.quoteCurrency, targetCurrency))
  const rateByBase = new Map(rateRows.map((r) => [r.baseCurrency, Number(r.rate)]))

  const excluded = new Map<string, number>()
  const converted: ConvertedRow<T>[] = []
  for (const row of rows) {
    if (row.currencyCode === targetCurrency) {
      converted.push({ row, convertedAmount: row.amount })
      continue
    }
    const rate = rateByBase.get(row.currencyCode)
    if (rate === undefined) {
      excluded.set(row.currencyCode, (excluded.get(row.currencyCode) ?? 0) + 1)
      continue
    }
    converted.push({ row, convertedAmount: row.amount * rate })
  }

  return {
    converted,
    excludedCurrencies: [...excluded.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount })),
  }
}
