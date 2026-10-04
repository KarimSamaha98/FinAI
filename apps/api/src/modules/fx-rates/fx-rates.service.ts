import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { FxRate, UpsertFxRateInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { fxRates, profiles, transactions, accounts } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'

function toFxRate(row: typeof fxRates.$inferSelect): FxRate {
  return {
    id: row.id,
    userId: row.userId,
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: Number(row.rate),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class FxRatesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<FxRate[]> {
    return runInTenantContext(this.db, userId, async (tx) => (await tx.select().from(fxRates)).map(toFxRate))
  }

  /**
   * Currencies held anywhere in the user's data — non-archived account
   * currencies and transaction currencies — excluding home. Account
   * currencies matter even with zero transactions: an account whose balance
   * exists only as a starting snapshot still needs a rate to count in net
   * worth, so it must show up here.
   */
  async currenciesInUse(userId: string): Promise<string[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [profileRow] = await tx.select().from(profiles).where(eq(profiles.id, userId))
      const [txRows, accountRows] = await Promise.all([
        tx.select({ currencyCode: transactions.currencyCode }).from(transactions),
        tx.select({ currencyCode: accounts.currencyCode }).from(accounts).where(eq(accounts.isArchived, false)),
      ])
      const codes = new Set<string>()
      for (const row of [...txRows, ...accountRows]) codes.add(row.currencyCode)
      if (profileRow) codes.delete(profileRow.homeCurrencyCode)
      return [...codes].sort()
    })
  }

  async upsert(userId: string, input: UpsertFxRateInput): Promise<FxRate> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .insert(fxRates)
          .values({ userId, baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency, rate: String(input.rate) })
          .onConflictDoUpdate({
            target: [fxRates.userId, fxRates.baseCurrency, fxRates.quoteCurrency],
            set: { rate: String(input.rate), updatedAt: new Date() },
          })
          .returning()
        return toFxRate(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }
}
