import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import type { ReconciliationGroupWithComputed } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { monthSplits, reconciliationGroupMembers, reconciliationGroups, transactions } from '../../db/schema.js'

type TransactionRow = typeof transactions.$inferSelect

function computeGroup(
  group: typeof reconciliationGroups.$inferSelect,
  members: TransactionRow[],
): ReconciliationGroupWithComputed {
  const anchor = members.reduce((biggest, row) => (Math.abs(Number(row.amount)) > Math.abs(Number(biggest.amount)) ? row : biggest))
  return {
    id: group.id,
    userId: group.userId,
    label: group.label,
    createdAt: group.createdAt.toISOString(),
    memberTransactionIds: members.map((m) => m.id),
    netAmountHomeCurrency: members.reduce((sum, row) => sum + Number(row.amount), 0),
    anchorTransactionId: anchor.id,
    anchorCategoryId: anchor.categoryId,
  }
}

@Injectable()
export class ReconciliationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<ReconciliationGroupWithComputed[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const groups = await tx.select().from(reconciliationGroups)
      if (!groups.length) return []

      const members = await tx
        .select({ member: reconciliationGroupMembers, transaction: transactions })
        .from(reconciliationGroupMembers)
        .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
        .where(
          inArray(
            reconciliationGroupMembers.groupId,
            groups.map((g) => g.id),
          ),
        )

      return groups.map((group) =>
        computeGroup(
          group,
          members.filter((m) => m.member.groupId === group.id).map((m) => m.transaction),
        ),
      )
    })
  }

  async create(userId: string, label: string | null | undefined, transactionIds: string[]): Promise<ReconciliationGroupWithComputed> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const members = await this.loadAndValidateCandidates(tx, transactionIds)
      await this.assertNoneAlreadyGrouped(tx, transactionIds)
      await this.assertNoneMonthSplit(tx, transactionIds)

      const [group] = await tx.insert(reconciliationGroups).values({ userId, label: label ?? null }).returning()
      await tx.insert(reconciliationGroupMembers).values(transactionIds.map((transactionId) => ({ groupId: group.id, transactionId })))

      return computeGroup(group, members)
    })
  }

  async addMember(userId: string, groupId: string, transactionId: string): Promise<ReconciliationGroupWithComputed> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [group] = await tx.select().from(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
      if (!group) {
        throw new NotFoundException('Reconciliation group not found')
      }

      const existingMembers = await tx
        .select({ transaction: transactions })
        .from(reconciliationGroupMembers)
        .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
        .where(eq(reconciliationGroupMembers.groupId, groupId))
      const existingRows = existingMembers.map((m) => m.transaction)

      const [candidate] = await this.loadAndValidateCandidates(tx, [transactionId])
      if (candidate.currencyCode !== existingRows[0].currencyCode) {
        throw new BadRequestException('Cannot mix currencies within a reconciliation group')
      }
      await this.assertNoneAlreadyGrouped(tx, [transactionId])
      await this.assertNoneMonthSplit(tx, [transactionId])

      await tx.insert(reconciliationGroupMembers).values({ groupId, transactionId })

      return computeGroup(group, [...existingRows, candidate])
    })
  }

  async removeMember(userId: string, groupId: string, transactionId: string): Promise<ReconciliationGroupWithComputed | null> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [group] = await tx.select().from(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
      if (!group) {
        throw new NotFoundException('Reconciliation group not found')
      }

      const [removed] = await tx
        .delete(reconciliationGroupMembers)
        .where(eq(reconciliationGroupMembers.transactionId, transactionId))
        .returning()
      if (!removed || removed.groupId !== groupId) {
        throw new NotFoundException('Transaction is not a member of this group')
      }

      const remainingMembers = await tx
        .select({ transaction: transactions })
        .from(reconciliationGroupMembers)
        .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
        .where(eq(reconciliationGroupMembers.groupId, groupId))

      if (remainingMembers.length < 2) {
        await tx.delete(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.groupId, groupId))
        await tx.delete(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
        return null
      }

      return computeGroup(
        group,
        remainingMembers.map((m) => m.transaction),
      )
    })
  }

  async delete(userId: string, groupId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      await tx.delete(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.groupId, groupId))
      const [row] = await tx.delete(reconciliationGroups).where(eq(reconciliationGroups.id, groupId)).returning()
      if (!row) {
        throw new NotFoundException('Reconciliation group not found')
      }
    })
  }

  private async loadAndValidateCandidates(tx: Db, transactionIds: string[]): Promise<TransactionRow[]> {
    const rows = await tx.select().from(transactions).where(inArray(transactions.id, transactionIds))
    if (rows.length !== transactionIds.length) {
      throw new BadRequestException('One or more transactions were not found')
    }
    const currencyCode = rows[0].currencyCode
    if (rows.some((row) => row.currencyCode !== currencyCode)) {
      throw new BadRequestException('Cannot mix currencies within a reconciliation group')
    }
    return transactionIds.map((id) => rows.find((row) => row.id === id)!)
  }

  private async assertNoneAlreadyGrouped(tx: Db, transactionIds: string[]): Promise<void> {
    const [existing] = await tx
      .select({ id: reconciliationGroupMembers.id })
      .from(reconciliationGroupMembers)
      .where(inArray(reconciliationGroupMembers.transactionId, transactionIds))
      .limit(1)
    if (existing) {
      throw new ConflictException('One or more transactions are already part of a reconciliation group')
    }
  }

  private async assertNoneMonthSplit(tx: Db, transactionIds: string[]): Promise<void> {
    const [existing] = await tx
      .select({ id: monthSplits.id })
      .from(monthSplits)
      .where(inArray(monthSplits.transactionId, transactionIds))
      .limit(1)
    if (existing) {
      throw new ConflictException('One or more transactions are already month-split and cannot be reconciled')
    }
  }
}
