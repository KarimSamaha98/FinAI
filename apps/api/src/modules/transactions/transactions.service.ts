import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import type { CategorizeTransactionsInput, CreateTransactionInput, Transaction, UpdateTransactionInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { transactions } from '../../db/schema.js'
import { loadHomeCurrency } from '../../common/profile.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import type { ListTransactionsFilter } from '../reporting/reporting-query.service.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { type TransactionConversion } from '../exchange-rates/conversion.js'

type TransactionRow = typeof transactions.$inferSelect

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    description: row.description,
    categoryId: row.categoryId,
    accountId: row.accountId,
    sourceType: row.sourceType,
    importProfileId: row.importProfileId,
    importRunId: row.importRunId,
    exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
    convertedValue: row.convertedValue != null ? Number(row.convertedValue) : null,
    rateSource: row.rateSource,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function conversionColumns(conversion: TransactionConversion) {
  return {
    exchangeRate: conversion.exchangeRate != null ? String(conversion.exchangeRate) : null,
    convertedValue: conversion.convertedValue != null ? String(conversion.convertedValue) : null,
    rateSource: conversion.rateSource,
  }
}

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ExchangeRatesService) private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async list(userId: string, filter: ListTransactionsFilter): Promise<Transaction[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const conditions = []
      if (filter.dateRange?.from) conditions.push(gte(transactions.date, filter.dateRange.from))
      if (filter.dateRange?.to) conditions.push(lte(transactions.date, filter.dateRange.to))
      if (filter.categoryIds?.length) conditions.push(inArray(transactions.categoryId, filter.categoryIds))
      if (filter.accountIds?.length) conditions.push(inArray(transactions.accountId, filter.accountIds))
      if (filter.uncategorizedOnly) conditions.push(isNull(transactions.categoryId))

      const rows = await tx
        .select()
        .from(transactions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(transactions.date))
      return rows.map(toTransaction)
    })
  }

  async getById(userId: string, id: string): Promise<Transaction> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(transactions).where(eq(transactions.id, id))
      if (!row) {
        throw new NotFoundException('Transaction not found')
      }
      return toTransaction(row)
    })
  }

  async create(userId: string, input: CreateTransactionInput): Promise<Transaction> {
    const homeCurrencyCode = await this.homeCurrencyCode(userId)
    const conversion = await this.exchangeRates.conversionFor({
      amount: input.amount,
      currencyCode: input.currencyCode,
      homeCurrencyCode,
      date: input.date,
      override: input.fxRateOverride ?? null,
    })

    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .insert(transactions)
          .values({
            userId,
            date: input.date,
            amount: String(input.amount),
            currencyCode: input.currencyCode,
            description: input.description,
            categoryId: input.categoryId,
            accountId: input.accountId,
            sourceType: 'manual',
            ...conversionColumns(conversion),
          })
          .returning()
        return toTransaction(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<Transaction> {
    // Read the current row + home currency first: the conversion needs the
    // effective date/amount/currency, and its rate fetch must not run inside
    // the write transaction.
    const current = await runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(transactions).where(eq(transactions.id, id))
      if (!row) throw new NotFoundException('Transaction not found')
      return { row, homeCurrencyCode: await loadHomeCurrency(tx, userId) }
    })

    const nextDate = input.date ?? current.row.date
    const nextAmount = input.amount ?? Number(current.row.amount)
    const nextCurrency = input.currencyCode ?? current.row.currencyCode
    // An explicit override (or explicit null) wins; otherwise a manual rate is
    // preserved only while the currency is unchanged; otherwise auto.
    const preservedManual =
      input.fxRateOverride === undefined && current.row.rateSource === 'manual' && nextCurrency === current.row.currencyCode
    const override = input.fxRateOverride !== undefined ? input.fxRateOverride : preservedManual ? Number(current.row.exchangeRate) : null
    const conversion = await this.exchangeRates.conversionFor({
      amount: nextAmount,
      currencyCode: nextCurrency,
      homeCurrencyCode: current.homeCurrencyCode,
      date: nextDate,
      override,
    })

    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const { id: _id, amount, fxRateOverride: _override, ...rest } = input
        const [row] = await tx
          .update(transactions)
          .set({
            ...rest,
            ...(amount !== undefined ? { amount: String(amount) } : {}),
            ...conversionColumns(conversion),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, id))
          .returning()
        if (!row) {
          throw new NotFoundException('Transaction not found')
        }
        return toTransaction(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  /** Sets the category on several transactions in one tenant transaction (RLS limits it to the user's own). */
  async categorize(userId: string, input: CategorizeTransactionsInput): Promise<{ updatedCount: number }> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const now = new Date()
        let updatedCount = 0
        for (const { transactionId, categoryId } of input.assignments) {
          const updated = await tx
            .update(transactions)
            .set({ categoryId, updatedAt: now })
            .where(eq(transactions.id, transactionId))
            .returning({ id: transactions.id })
          updatedCount += updated.length
        }
        return { updatedCount }
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.delete(transactions).where(eq(transactions.id, id)).returning()
      if (!row) {
        throw new NotFoundException('Transaction not found')
      }
    })
  }

  /**
   * Recompute the home-currency value of every transaction (used after a
   * home-currency change and by the backfill). A user's manual override was
   * expressed against the old home currency, so it is reset to the automatic
   * market rate here. Rates are warmed before the write, keeping network I/O
   * out of the tenant transaction.
   */
  async recomputeForUser(userId: string): Promise<number> {
    const homeCurrencyCode = await this.homeCurrencyCode(userId)
    const rows = await runInTenantContext(this.db, userId, (tx) => tx.select().from(transactions))
    if (rows.length === 0) return 0

    await this.exchangeRates.warm(rows.map((row) => row.currencyCode))

    const conversions = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        conversion: await this.exchangeRates.conversionFor({
          amount: Number(row.amount),
          currencyCode: row.currencyCode,
          homeCurrencyCode,
          date: row.date,
          override: null,
        }),
      })),
    )

    await runInTenantContext(this.db, userId, async (tx) => {
      const now = new Date()
      for (const { id, conversion } of conversions) {
        await tx.update(transactions).set({ ...conversionColumns(conversion), updatedAt: now }).where(eq(transactions.id, id))
      }
    })
    return conversions.length
  }

  /**
   * Re-materialize only the transactions whose home-currency value is missing
   * (a conversion that failed at write time, e.g. a provider outage during an
   * import). Manual overrides are never touched. Rows that still can't be
   * priced are left for the next attempt. Run opportunistically on login.
   */
  async recomputeMissingForUser(userId: string): Promise<number> {
    const homeCurrencyCode = await this.homeCurrencyCode(userId)
    const rows = await runInTenantContext(this.db, userId, (tx) => tx.select().from(transactions))
    const missing = rows.filter(
      (row) => row.currencyCode !== homeCurrencyCode && row.rateSource === 'auto' && (row.exchangeRate == null || row.convertedValue == null),
    )
    if (missing.length === 0) return 0

    await this.exchangeRates.warm(missing.map((row) => row.currencyCode))

    const conversions = await Promise.all(
      missing.map(async (row) => ({
        id: row.id,
        conversion: await this.exchangeRates.conversionFor({
          amount: Number(row.amount),
          currencyCode: row.currencyCode,
          homeCurrencyCode,
          date: row.date,
          override: null,
        }),
      })),
    )
    // A conversion can still come back unpriced (the provider is down); only
    // write the rows that resolved, and leave the rest for the next attempt.
    const resolved = conversions.filter((entry) => entry.conversion.convertedValue != null)

    await runInTenantContext(this.db, userId, async (tx) => {
      const now = new Date()
      for (const entry of resolved) {
        await tx.update(transactions).set({ ...conversionColumns(entry.conversion), updatedAt: now }).where(eq(transactions.id, entry.id))
      }
    })
    return resolved.length
  }

  private async homeCurrencyCode(userId: string): Promise<string> {
    return runInTenantContext(this.db, userId, (tx) => loadHomeCurrency(tx, userId))
  }
}
