import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Account, AccountSummary, CreateAccountInput, UpdateAccountInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, importProfiles, transactions } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { convertToTargetCurrency } from '../reporting/fx-conversion.js'

type AccountRow = typeof accounts.$inferSelect

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    currencyCode: row.currencyCode,
    startingBalance: Number(row.startingBalance),
    balanceAsOf: row.balanceAsOf,
    balanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class AccountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string, filter?: { includeArchived?: boolean }): Promise<AccountSummary[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(accounts)
        .where(filter?.includeArchived ? undefined : eq(accounts.isArchived, false))
        .orderBy(accounts.name)
      return Promise.all(rows.map((row) => this.toSummary(tx, row)))
    })
  }

  async getById(userId: string, id: string): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(accounts).where(eq(accounts.id, id))
      if (!row) throw new NotFoundException('Account not found')
      return this.toSummary(tx, row)
    })
  }

  async create(userId: string, input: CreateAccountInput): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .insert(accounts)
          .values({ ...input, startingBalance: String(input.startingBalance), userId })
          .returning()
        return this.toSummary(tx, row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: Omit<UpdateAccountInput, 'id'>): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const { startingBalance, ...rest } = input
        const touchesBalance = startingBalance !== undefined || input.balanceAsOf !== undefined
        const [row] = await tx
          .update(accounts)
          .set({
            ...rest,
            ...(startingBalance !== undefined ? { startingBalance: String(startingBalance) } : {}),
            updatedAt: new Date(),
            ...(touchesBalance ? { balanceUpdatedAt: new Date() } : {}),
          })
          .where(eq(accounts.id, id))
          .returning()
        if (!row) throw new NotFoundException('Account not found')
        return this.toSummary(tx, row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [usedByTransaction] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.accountId, id))
        .limit(1)
      const [usedByProfile] = await tx
        .select({ id: importProfiles.id })
        .from(importProfiles)
        .where(eq(importProfiles.accountId, id))
        .limit(1)
      if (usedByTransaction || usedByProfile) {
        throw new ConflictException('Account has existing transactions or an import profile; archive it instead')
      }

      const [row] = await tx.delete(accounts).where(eq(accounts.id, id)).returning()
      if (!row) throw new NotFoundException('Account not found')
    })
  }

  /**
   * Balance = starting_balance + the sum of every transaction (manual or
   * imported alike) dated *strictly after* balance_as_of, converted to the
   * account's own currency. balance_as_of is a plain date (no time-of-day) —
   * the starting balance is assumed to already reflect everything up to and
   * including that date, so only transactions dated later count. In
   * practice, set balance_as_of to the day *before* you want counting to
   * start (e.g. yesterday, if you want today's activity to count) — a
   * transaction dated exactly on balance_as_of is treated as already
   * reflected in the snapshot, same as anything earlier.
   * lastTransactionDate/lastTransactionUpdatedAt reflect ALL of the account's
   * transactions, regardless of whether they count toward the balance.
   * lastBalanceUpdatedAt is the account row's own balanceUpdatedAt — kept
   * separate from lastTransactionUpdatedAt so a manual "Update balance" and a
   * transaction add/import don't get conflated into one ambiguous "last
   * updated" timestamp.
   */
  private async toSummary(tx: Db, row: AccountRow): Promise<AccountSummary> {
    const txRows = await tx
      .select({
        date: transactions.date,
        amount: transactions.amount,
        currencyCode: transactions.currencyCode,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .where(eq(transactions.accountId, row.id))

    const balanceRows = txRows
      .filter((t) => t.date > row.balanceAsOf)
      .map((t) => ({ currencyCode: t.currencyCode, amount: Number(t.amount) }))
    const { converted, excludedCurrencies } = await convertToTargetCurrency(tx, balanceRows, row.currencyCode)
    const balance = Number(row.startingBalance) + converted.reduce((sum, c) => sum + c.convertedAmount, 0)

    const lastTransactionDate = txRows.length ? txRows.reduce((max, t) => (t.date > max ? t.date : max), txRows[0].date) : null
    const lastTransactionUpdatedAt = txRows.length
      ? txRows.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), txRows[0].updatedAt).toISOString()
      : null

    return {
      ...toAccount(row),
      balance,
      lastTransactionDate,
      lastTransactionUpdatedAt,
      lastBalanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
      excludedCurrencies,
    }
  }
}
