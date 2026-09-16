import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { DateRangeFilter, DisplayRow, TransactionView } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { monthSplits, reconciliationGroupMembers, reconciliationGroups, transactions } from '../../db/schema.js'

type TransactionRow = typeof transactions.$inferSelect

function toPlainDisplayRow(row: TransactionRow, reconciliationGroupId: string | null, monthSplitId: string | null): DisplayRow {
  return {
    kind: 'plain',
    date: row.date,
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    description: row.description,
    categoryId: row.categoryId,
    accountIds: row.accountId ? [row.accountId] : [],
    sourceTransactionIds: [row.id],
    reconciliationGroupId,
    monthSplitId,
  }
}

/** Returns the covered months of a split as "YYYY-MM-01" strings, computed without Date/timezone math. */
function monthsCoveredBySplit(startMonth: string, numMonths: number): string[] {
  const [year, month] = startMonth.split('-').slice(0, 2).map(Number)
  return Array.from({ length: numMonths }, (_, i) => {
    const total = year * 12 + (month - 1) + i
    const coveredYear = Math.floor(total / 12)
    const coveredMonth = (total % 12) + 1
    return `${coveredYear}-${String(coveredMonth).padStart(2, '0')}-01`
  })
}

export interface ListTransactionsFilter {
  dateRange?: DateRangeFilter
  categoryIds?: string[]
  accountIds?: string[]
}

@Injectable()
export class ReportingQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Real view collapses each reconciliation group into one synthetic net row
   * and expands each month-split into one synthetic row per covered month.
   * Extracted from TransactionsService in M6 so Review and Charts share the
   * exact same nominal/real logic. Does not yet do FX conversion — see
   * ChartAggregationService, which layers currency conversion + bucketing on
   * top of this service's row-level output for the reporting endpoints.
   */
  async listDisplayRows(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<DisplayRow[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const conditions = []
      if (filter.dateRange?.from) conditions.push(gte(transactions.date, filter.dateRange.from))
      if (filter.dateRange?.to) conditions.push(lte(transactions.date, filter.dateRange.to))
      if (filter.categoryIds?.length) conditions.push(inArray(transactions.categoryId, filter.categoryIds))
      if (filter.accountIds?.length) conditions.push(inArray(transactions.accountId, filter.accountIds))

      const windowRows = await tx
        .select()
        .from(transactions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(transactions.date))

      const touchedMemberships = windowRows.length
        ? await tx
            .select()
            .from(reconciliationGroupMembers)
            .where(
              inArray(
                reconciliationGroupMembers.transactionId,
                windowRows.map((r) => r.id),
              ),
            )
        : []

      if (view === 'nominal') {
        if (!windowRows.length) return []
        const splitsForWindow = await tx
          .select()
          .from(monthSplits)
          .where(
            inArray(
              monthSplits.transactionId,
              windowRows.map((r) => r.id),
            ),
          )
        const splitByTransactionId = new Map(splitsForWindow.map((s) => [s.transactionId, s.id]))
        const groupByTransactionId = new Map(touchedMemberships.map((m) => [m.transactionId, m.groupId]))
        return windowRows.map((row) =>
          toPlainDisplayRow(row, groupByTransactionId.get(row.id) ?? null, splitByTransactionId.get(row.id) ?? null),
        )
      }

      // Reconciliation: a group is "touched" if any member's own transaction date
      // falls in the requested window; then every member (regardless of date) is
      // fetched to compute the net, and the whole group is re-filtered by anchor date.
      const touchedGroupIds = [...new Set(touchedMemberships.map((m) => m.groupId))]
      const [groups, allMembers] = touchedGroupIds.length
        ? await Promise.all([
            tx.select().from(reconciliationGroups).where(inArray(reconciliationGroups.id, touchedGroupIds)),
            tx
              .select({ member: reconciliationGroupMembers, transaction: transactions })
              .from(reconciliationGroupMembers)
              .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
              .where(inArray(reconciliationGroupMembers.groupId, touchedGroupIds)),
          ])
        : [[], []]

      const groupedTransactionIds = new Set(allMembers.map((m) => m.transaction.id))

      const netRows: DisplayRow[] = []
      for (const group of groups) {
        const members = allMembers.filter((m) => m.member.groupId === group.id).map((m) => m.transaction)
        const anchor = members.reduce((biggest, row) =>
          Math.abs(Number(row.amount)) > Math.abs(Number(biggest.amount)) ? row : biggest,
        )
        if (filter.dateRange?.from && anchor.date < filter.dateRange.from) continue
        if (filter.dateRange?.to && anchor.date > filter.dateRange.to) continue
        if (filter.categoryIds?.length && (!anchor.categoryId || !filter.categoryIds.includes(anchor.categoryId))) continue
        if (filter.accountIds?.length && (!anchor.accountId || !filter.accountIds.includes(anchor.accountId))) continue

        netRows.push({
          kind: 'reconciliation_net',
          date: anchor.date,
          amount: members.reduce((sum, row) => sum + Number(row.amount), 0),
          currencyCode: anchor.currencyCode,
          description: group.label ?? anchor.description,
          categoryId: anchor.categoryId,
          accountIds: [...new Set(members.map((m) => m.accountId).filter((id): id is string => id !== null))],
          sourceTransactionIds: members.map((m) => m.id),
          reconciliationGroupId: group.id,
          monthSplitId: null,
        })
      }

      // Month-split: a split's own transaction date can fall entirely outside the
      // requested window while a covered month is still inside it, so every split
      // is fetched up front (not just ones "touched" within windowRows) and each
      // covered month is filtered independently by year-month against the range.
      const allSplits = await tx
        .select({ split: monthSplits, transaction: transactions })
        .from(monthSplits)
        .innerJoin(transactions, eq(monthSplits.transactionId, transactions.id))

      const splitTransactionIds = new Set(allSplits.map((s) => s.transaction.id))
      const fromYearMonth = filter.dateRange?.from?.slice(0, 7)
      const toYearMonth = filter.dateRange?.to?.slice(0, 7)

      const splitRows: DisplayRow[] = []
      for (const { split, transaction: original } of allSplits) {
        if (filter.categoryIds?.length && (!original.categoryId || !filter.categoryIds.includes(original.categoryId))) {
          continue
        }
        if (filter.accountIds?.length && (!original.accountId || !filter.accountIds.includes(original.accountId))) {
          continue
        }
        for (const month of monthsCoveredBySplit(split.startMonth, split.numMonths)) {
          const yearMonth = month.slice(0, 7)
          if (fromYearMonth && yearMonth < fromYearMonth) continue
          if (toYearMonth && yearMonth > toYearMonth) continue
          splitRows.push({
            kind: 'month_split_portion',
            date: month,
            amount: Number(original.amount) / split.numMonths,
            currencyCode: original.currencyCode,
            description: original.description,
            categoryId: original.categoryId,
            accountIds: original.accountId ? [original.accountId] : [],
            sourceTransactionIds: [original.id],
            reconciliationGroupId: null,
            monthSplitId: split.id,
          })
        }
      }

      const ungroupedRows = windowRows
        .filter((row) => !groupedTransactionIds.has(row.id) && !splitTransactionIds.has(row.id))
        .map((row) => toPlainDisplayRow(row, null, null))

      return [...ungroupedRows, ...netRows, ...splitRows].sort((a, b) => (a.date < b.date ? 1 : -1))
    })
  }
}
