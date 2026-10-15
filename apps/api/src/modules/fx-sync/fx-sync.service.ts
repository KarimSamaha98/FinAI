import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, profiles, transactions } from '../../db/schema.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { TransactionsService } from '../transactions/transactions.service.js'

export interface FxSyncResult {
  /** Transactions whose home-currency value was repaired. */
  repairedCount: number
}

/**
 * Called once per login: warms the in-memory rate cache for every currency the
 * user references (so the home screen loads without hitting the provider) and
 * re-materializes any transaction whose conversion failed earlier.
 */
@Injectable()
export class FxSyncService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ExchangeRatesService) private readonly exchangeRates: ExchangeRatesService,
    @Inject(TransactionsService) private readonly transactions: TransactionsService,
  ) {}

  async sync(userId: string): Promise<FxSyncResult> {
    const currencies = await runInTenantContext(this.db, userId, async (tx) => {
      const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId))
      const [accountRows, txRows] = await Promise.all([
        tx.select({ currencyCode: accounts.currencyCode }).from(accounts).where(eq(accounts.isArchived, false)),
        tx.select({ currencyCode: transactions.currencyCode }).from(transactions),
      ])
      const codes = new Set<string>([profile?.homeCurrencyCode, ...accountRows.map((r) => r.currencyCode), ...txRows.map((r) => r.currencyCode)])
      return [...codes].filter((code): code is string => code !== null)
    })

    await this.exchangeRates.warm(currencies)
    const repairedCount = await this.transactions.recomputeMissingForUser(userId)
    return { repairedCount }
  }
}
