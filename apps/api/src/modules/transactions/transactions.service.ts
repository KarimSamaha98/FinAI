import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { transactions } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import type { ListTransactionsFilter } from '../reporting/reporting-query.service.js'

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class TransactionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string, filter: ListTransactionsFilter): Promise<Transaction[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const conditions = []
      if (filter.dateRange?.from) conditions.push(gte(transactions.date, filter.dateRange.from))
      if (filter.dateRange?.to) conditions.push(lte(transactions.date, filter.dateRange.to))
      if (filter.categoryIds?.length) conditions.push(inArray(transactions.categoryId, filter.categoryIds))
      if (filter.accountIds?.length) conditions.push(inArray(transactions.accountId, filter.accountIds))

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
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .insert(transactions)
          .values({ ...input, amount: String(input.amount), userId, sourceType: 'manual' })
          .returning()
        return toTransaction(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<Transaction> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const { id: _id, amount, ...rest } = input
        const [row] = await tx
          .update(transactions)
          .set({ ...rest, ...(amount !== undefined ? { amount: String(amount) } : {}), updatedAt: new Date() })
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

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.delete(transactions).where(eq(transactions.id, id)).returning()
      if (!row) {
        throw new NotFoundException('Transaction not found')
      }
    })
  }
}
