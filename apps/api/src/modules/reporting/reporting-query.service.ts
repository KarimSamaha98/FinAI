import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { groupNet, shareOutstanding, type DateRangeFilter, type DisplayRow, type TransactionView } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { monthSplits, reconciliationGroupMembers, transactions } from '../../db/schema.js'
import { roundMoney } from '../exchange-rates/conversion.js'
import { anchorOf, contactNames, loadGroups, memberAmount, paidByContact, transferNet, transferSides, type LoadedMember } from '../groups/group-store.js'

type TransactionRow = typeof transactions.$inferSelect

function toPlainDisplayRow(
  row: TransactionRow,
  reconciliationGroupId: string | null,
  monthSplitId: string | null,
): DisplayRow {
  return {
    kind: 'plain',
    date: row.date,
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    description: row.description,
    categoryId: row.categoryId,
    accountIds: row.accountId ? [row.accountId] : [],
    anchorAccountId: row.accountId,
    sourceTransactionIds: [row.id],
    reconciliationGroupId,
    monthSplitId,
    convertedValue: row.convertedValue != null ? Number(row.convertedValue) : null,
    rateSource: row.rateSource,
    flagged: row.flaggedAt != null,
    people: null,
    transfer: null,
  }
}

/** A member's home-currency value: its transaction's, scaled to the part in the group. Null without a rate. */
function memberConverted({ member, transaction }: LoadedMember): number | null {
  if (transaction.convertedValue == null) return null
  if (member.amount == null) return Number(transaction.convertedValue)
  const amount = Number(transaction.amount)
  return amount === 0 ? 0 : (Number(transaction.convertedValue) * Number(member.amount)) / amount
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
  /** Only transactions with no category yet. Honoured by TransactionsService.list only. */
  uncategorizedOnly?: boolean
  /**
   * Only what's flagged as needing attention. A display row counts as flagged
   * when any of its transactions is (a linked group's member, a split's original).
   */
  flaggedOnly?: boolean
}

@Injectable()
export class ReportingQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Real view collapses each group into one synthetic net row (its own money
   * plus what people owe for it; their payments settle shares and don't
   * show), shows what's left of a transaction only partly in groups, and
   * expands each month-split into one synthetic row per covered month.
   * Extracted from TransactionsService in M6 so Review and Charts share the
   * exact same nominal/real logic. Does not yet do FX conversion — see
   * ChartAggregationService, which layers currency conversion + bucketing on
   * top of this service's row-level output for the reporting endpoints.
   */
  async listDisplayRows(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<DisplayRow[]> {
    const rows = await this.buildDisplayRows(userId, filter, view)
    if (!filter.flaggedOnly) return rows
    // Applied to the finished rows, so a linked group or split is kept when any
    // of its transactions is flagged, whichever one that is. One row per
    // flagged item: a split shows once (its first month), not once per month.
    const seenSplits = new Set<string>()
    return rows
      .filter((row) => row.flagged)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .filter((row) => {
        if (!row.monthSplitId || row.kind !== 'month_split_portion') return true
        if (seenSplits.has(row.monthSplitId)) return false
        seenSplits.add(row.monthSplitId)
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  private async buildDisplayRows(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<DisplayRow[]> {
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
        return windowRows.map((row) => toPlainDisplayRow(row, groupByTransactionId.get(row.id) ?? null, splitByTransactionId.get(row.id) ?? null))
      }

      // Groups: a group is "touched" if any member's own transaction date
      // falls in the requested window; then every member (regardless of date)
      // is loaded to compute the net, and the whole group is re-filtered by
      // its anchor (biggest own transaction).
      const touchedGroupIds = [...new Set(touchedMemberships.map((m) => m.groupId))]
      const loadedGroups = await loadGroups(tx, touchedGroupIds)
      const names = loadedGroups.some((g) => g.shares.length > 0) ? await contactNames(tx) : new Map<string, string>()

      const netRows: DisplayRow[] = []
      for (const loaded of loadedGroups) {
        const anchorMember = anchorOf(loaded)
        if (!anchorMember) continue
        const anchor = anchorMember.transaction
        if (filter.dateRange?.from && anchor.date < filter.dateRange.from) continue
        if (filter.dateRange?.to && anchor.date > filter.dateRange.to) continue
        if (filter.categoryIds?.length && (!anchor.categoryId || !filter.categoryIds.includes(anchor.categoryId))) continue
        if (filter.accountIds?.length && (!anchor.accountId || !filter.accountIds.includes(anchor.accountId))) continue

        const base = {
          kind: 'reconciliation_net' as const,
          date: anchor.date,
          currencyCode: anchor.currencyCode,
          description: loaded.group.label || anchor.description,
          categoryId: anchor.categoryId,
          accountIds: [...new Set(loaded.members.map((m) => m.transaction.accountId).filter((id): id is string => id !== null))],
          anchorAccountId: anchor.accountId,
          sourceTransactionIds: [anchor.id, ...loaded.members.map((m) => m.transaction.id).filter((id) => id !== anchor.id)],
          reconciliationGroupId: loaded.group.id,
          monthSplitId: null,
          rateSource: 'auto' as const,
          flagged: loaded.members.some((m) => m.transaction.flaggedAt != null),
        }

        // A transfer only moved money between the user's accounts: what's
        // left is an FX difference or a fee (usually nothing).
        if (loaded.group.kind === 'transfer') {
          const net = transferNet(loaded, anchor)
          netRows.push({ ...base, amount: net.amount ?? 0, convertedValue: net.convertedValue, people: null, transfer: transferSides(loaded) })
          continue
        }

        const own = loaded.members.filter((m) => m.member.contactId === null)
        const shares = loaded.shares.map((s) => ({ contactId: s.contactId, amount: Number(s.amount), forgiven: Number(s.forgiven) }))
        const amount = groupNet(
          own.map((m) => memberAmount(m.member, m.transaction)),
          shares,
        )
        // A loan, or money borrowed, nets to nothing: it only moved a balance.
        if (shares.length > 0 && Math.abs(amount) < 0.005) continue

        const paid = paidByContact(loaded)
        const owedByPeople = amount - own.reduce((sum, m) => sum + memberAmount(m.member, m.transaction), 0)
        const ownConverted = own.map(memberConverted)
        const rate = anchor.exchangeRate != null ? Number(anchor.exchangeRate) : null
        const convertedValue =
          ownConverted.every((v) => v != null) && (shares.length === 0 || rate != null)
            ? roundMoney(ownConverted.reduce((sum: number, v) => sum + v!, 0) + owedByPeople * (rate ?? 0))
            : null

        netRows.push({
          ...base,
          amount: roundMoney(amount),
          convertedValue,
          people: shares.length
            ? {
                names: shares.map((s) => names.get(s.contactId) ?? 'Someone'),
                contactIds: shares.map((s) => s.contactId),
                outstanding: roundMoney(shares.reduce((sum, s) => sum + shareOutstanding(s, paid.get(s.contactId) ?? 0), 0)),
              }
            : null,
          transfer: null,
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
            anchorAccountId: original.accountId,
            sourceTransactionIds: [original.id],
            reconciliationGroupId: null,
            monthSplitId: split.id,
            convertedValue: original.convertedValue != null ? roundMoney(Number(original.convertedValue) / split.numMonths) : null,
            rateSource: original.rateSource,
            flagged: original.flaggedAt != null,
            people: null,
            transfer: null,
          })
        }
      }

      // Transactions in no group pass through; one only partly in groups
      // (an e-transfer paying for one dinner out of two) shows what's left.
      const membershipsByTransaction = new Map<string, typeof touchedMemberships>()
      for (const m of touchedMemberships) membershipsByTransaction.set(m.transactionId, [...(membershipsByTransaction.get(m.transactionId) ?? []), m])
      const ungroupedRows = windowRows
        .filter((row) => !splitTransactionIds.has(row.id))
        .flatMap((row) => {
          const memberships = membershipsByTransaction.get(row.id)
          if (!memberships) return [toPlainDisplayRow(row, null, null)]
          const inGroups = memberships.reduce((sum, m) => sum + Math.round(memberAmount(m, row) * 100), 0) / 100
          const left = roundMoney(Number(row.amount) - inGroups)
          if (Math.abs(left) < 0.005) return []
          const display = toPlainDisplayRow(row, memberships[0].groupId, null)
          const amount = Number(row.amount)
          return [
            {
              ...display,
              amount: left,
              convertedValue: display.convertedValue != null && amount !== 0 ? roundMoney((display.convertedValue * left) / amount) : null,
            },
          ]
        })

      return [...ungroupedRows, ...netRows, ...splitRows].sort((a, b) => (a.date < b.date ? 1 : -1))
    })
  }
}
