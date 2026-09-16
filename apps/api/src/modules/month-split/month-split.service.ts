import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import type { MonthSplit } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { monthSplits, reconciliationGroupMembers, transactions } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'

function toMonthSplit(row: typeof monthSplits.$inferSelect): MonthSplit {
  return {
    id: row.id,
    transactionId: row.transactionId,
    startMonth: row.startMonth,
    numMonths: row.numMonths,
  }
}

@Injectable()
export class MonthSplitService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<MonthSplit[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx.select().from(monthSplits)
      return rows.map(toMonthSplit)
    })
  }

  async create(userId: string, transactionId: string, startMonth: string, numMonths: number): Promise<MonthSplit> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, transactionId))
      if (!transaction) {
        throw new BadRequestException('Transaction not found')
      }
      await this.assertNotReconciled(tx, transactionId)

      try {
        const [row] = await tx.insert(monthSplits).values({ transactionId, startMonth, numMonths }).returning()
        return toMonthSplit(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, startMonth: string | undefined, numMonths: number | undefined): Promise<MonthSplit> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx
          .update(monthSplits)
          .set({ ...(startMonth !== undefined ? { startMonth } : {}), ...(numMonths !== undefined ? { numMonths } : {}) })
          .where(eq(monthSplits.id, id))
          .returning()
        if (!row) {
          throw new NotFoundException('Month split not found')
        }
        return toMonthSplit(row)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.delete(monthSplits).where(eq(monthSplits.id, id)).returning()
      if (!row) {
        throw new NotFoundException('Month split not found')
      }
    })
  }

  private async assertNotReconciled(tx: Db, transactionId: string): Promise<void> {
    const [existing] = await tx
      .select({ id: reconciliationGroupMembers.id })
      .from(reconciliationGroupMembers)
      .where(inArray(reconciliationGroupMembers.transactionId, [transactionId]))
      .limit(1)
    if (existing) {
      throw new ConflictException('Transaction is part of a reconciliation group and cannot be month-split')
    }
  }
}
