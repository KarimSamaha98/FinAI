import { Inject, Injectable } from '@nestjs/common'
import { and, gte, lte, max, min } from 'drizzle-orm'
import { format, parseISO, subMonths, startOfMonth, endOfMonth, endOfYear } from 'date-fns'
import type {
  AmountKind,
  BucketGranularity,
  CategoryBreakdownResponse,
  CategoryChange,
  CategoryIconKey,
  DashboardSummary,
  DisplayRow,
  HeatmapResponse,
  ImportantThingsResponse,
  InsightMode,
  RecurringPayment,
  TimeseriesResponse,
  TopTransaction,
  TransactionView,
  TrendResponse,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { categories, transactions } from '../../db/schema.js'
import { FxUnavailableError } from '../exchange-rates/fx-unavailable.error.js'
import { ReportingQueryService, type ListTransactionsFilter } from './reporting-query.service.js'
import { buildBuckets, computePeriodRange, resolveModeGranularity, type Bucket } from './buckets.js'

function bucketKeyFor(dateISO: string, granularity: BucketGranularity, buckets: Bucket[]): string | undefined {
  if (granularity === 'monthly') return dateISO.slice(0, 7)
  if (granularity === 'yearly') return dateISO.slice(0, 4)
  if (granularity === 'daily') return dateISO
  const d = parseISO(dateISO)
  return buckets.find((b) => d >= b.start && d <= b.end)?.key
}

@Injectable()
export class ChartAggregationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ReportingQueryService) private readonly reportingQueryService: ReportingQueryService,
  ) {}

  async getCategoryBreakdown(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
    kind: AmountKind,
  ): Promise<CategoryBreakdownResponse> {
    const range = computePeriodRange(mode, period)
    const rows = await this.getRows(userId, { dateRange: range }, view)

    const categoryPoints = await runInTenantContext(this.db, userId, async (tx) => {
      const categoryRows = await tx.select().from(categories)
      const nameById = new Map(categoryRows.map((c) => [c.id, c.name]))

      const totals = new Map<string | null, number>()
      for (const row of rows) {
        if (row.convertedValue == null) continue
        const isExpense = row.convertedValue < 0
        if ((kind === 'expense') !== isExpense) continue
        totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + Math.abs(row.convertedValue))
      }

      return [...totals.entries()]
        .filter(([, total]) => total !== 0)
        .map(([categoryId, total]) => ({
          categoryId,
          categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
          total,
        }))
        .sort((a, b) => b.total - a.total)
    })

    return { points: categoryPoints }
  }

  async getTimeseries(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
    kind: AmountKind,
  ): Promise<TimeseriesResponse> {
    const range = computePeriodRange(mode, period)
    const rows = await this.getRows(userId, { dateRange: range }, view)

    const granularity = resolveModeGranularity(mode)
    const buckets = buildBuckets(range.from, range.to, granularity)
    const totalsByKey = new Map(buckets.map((b) => [b.key, 0]))

    for (const row of rows) {
      if (row.convertedValue == null) continue
      const isExpense = row.convertedValue < 0
      if ((kind === 'expense') !== isExpense) continue
      const key = bucketKeyFor(row.date, granularity, buckets)
      if (key === undefined || !totalsByKey.has(key)) continue
      totalsByKey.set(key, totalsByKey.get(key)! + Math.abs(row.convertedValue))
    }

    const points = buckets.map((b) => ({
      bucketStart: format(b.start, 'yyyy-MM-dd'),
      bucketLabel: b.label,
      total: totalsByKey.get(b.key) ?? 0,
    }))

    return { granularity, points }
  }

  async getDashboardSummary(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
  ): Promise<DashboardSummary> {
    const range = computePeriodRange(mode, period)
    const rows = await this.getRows(userId, { dateRange: range }, view)

    let totalExpense = 0
    let totalIncome = 0
    for (const row of rows) {
      if (row.convertedValue == null) continue
      if (row.convertedValue < 0) totalExpense += Math.abs(row.convertedValue)
      else totalIncome += row.convertedValue
    }

    const netIncome = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? netIncome / totalIncome : null
    return { totalExpense, totalIncome, netIncome, savingsRate }
  }

  async getHeatmap(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
    kind: AmountKind,
  ): Promise<HeatmapResponse> {
    const range = computePeriodRange(mode, period)
    const rows = await this.getRows(userId, { dateRange: range }, view)

    const totalsByDate = new Map<string, number>()
    for (const row of rows) {
      if (row.convertedValue == null) continue
      const isExpense = row.convertedValue < 0
      if ((kind === 'expense') !== isExpense) continue
      totalsByDate.set(row.date, (totalsByDate.get(row.date) ?? 0) + Math.abs(row.convertedValue))
    }

    const days = [...totalsByDate.entries()].map(([date, total]) => ({ date, total }))
    return { days }
  }

  async getImportantThings(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
  ): Promise<ImportantThingsResponse> {
    const currentRange = computePeriodRange(mode, period)

    const lookbackCount = 6
    const lookbackPeriods: string[] = []
    let cursorPeriod = period
    for (let i = 0; i < lookbackCount; i++) {
      cursorPeriod = mode === 'monthly'
        ? format(subMonths(parseISO(cursorPeriod + '-01'), 1), 'yyyy-MM')
        : String(Number(cursorPeriod) - 1)
      lookbackPeriods.unshift(cursorPeriod)
    }

    const lookbackFrom = computePeriodRange(mode, lookbackPeriods[0]).from
    const lookbackTo = mode === 'monthly'
      ? format(endOfMonth(subMonths(parseISO(period + '-01'), 1)), 'yyyy-MM-dd')
      : format(endOfYear(new Date(Number(period) - 1, 0, 1)), 'yyyy-MM-dd')

    const currentRows = await this.getRows(userId, { dateRange: currentRange }, view)
    const lookbackRows = await this.getRows(userId, { dateRange: { from: lookbackFrom, to: lookbackTo } }, view)

    const categoryChanges = await this.detectCategoryChanges(userId, mode, currentRows, lookbackRows, lookbackPeriods)
    const topExpenses = await this.detectTopTransactions(userId, currentRows, 'expense')
    const topIncome = await this.detectTopTransactions(userId, currentRows, 'income')
    const recurringPayments = await this.detectRecurringPayments(userId, currentRange)

    return { categoryChanges, topExpenses, topIncome, recurringPayments }
  }

  async getTrend(
    userId: string,
    mode: InsightMode,
    period: string,
    view: TransactionView,
  ): Promise<TrendResponse> {
    const periodCount = mode === 'monthly' ? 12 : 5
    const periods: string[] = []
    let cursorPeriod = period

    for (let i = 0; i < periodCount; i++) {
      periods.unshift(cursorPeriod)
      cursorPeriod = mode === 'monthly'
        ? format(subMonths(parseISO(cursorPeriod + '-01'), 1), 'yyyy-MM')
        : String(Number(cursorPeriod) - 1)
    }

    const points: { period: string; label: string; totalIncome: number; totalExpense: number; savingsRate: number | null }[] = []
    for (const p of periods) {
      const range = computePeriodRange(mode, p)
      const rows = await this.getRows(userId, { dateRange: range }, view)

      let totalExpense = 0
      let totalIncome = 0
      for (const row of rows) {
        if (row.convertedValue == null) continue
        if (row.convertedValue < 0) totalExpense += Math.abs(row.convertedValue)
        else totalIncome += row.convertedValue
      }

      const netIncome = totalIncome - totalExpense
      const savingsRate = totalIncome > 0 ? netIncome / totalIncome : null

      const label = mode === 'monthly'
        ? format(parseISO(p + '-01'), 'MMM')
        : p

      points.push({ period: p, label, totalIncome, totalExpense, savingsRate })
    }

    // Lets the chart page through history without showing empty columns outside the data.
    const [bounds] = await runInTenantContext(this.db, userId, (tx) =>
      tx.select({ earliest: min(transactions.date), latest: max(transactions.date) }).from(transactions),
    )
    const earliestPeriod = bounds?.earliest ? this.periodKeyFor(mode, bounds.earliest) : null
    const latestPeriod = bounds?.latest ? this.periodKeyFor(mode, bounds.latest) : null

    return { points, earliestPeriod, latestPeriod }
  }

  private periodKeyFor(mode: InsightMode, dateISO: string): string {
    return mode === 'monthly' ? dateISO.slice(0, 7) : dateISO.slice(0, 4)
  }

  private async detectCategoryChanges(
    userId: string,
    mode: InsightMode,
    current: DisplayRow[],
    lookback: DisplayRow[],
    lookbackPeriods: string[],
  ): Promise<CategoryChange[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const categoryRows = await tx.select().from(categories)
      const nameById = new Map(categoryRows.map((c) => [c.id, c.name]))

      const currentExpenseTotals = new Map<string | null, number>()
      const currentIncomeTotals = new Map<string | null, number>()
      for (const row of current) {
        if (row.convertedValue == null) continue
        const key = row.categoryId ?? null
        if (row.convertedValue < 0) {
          currentExpenseTotals.set(key, (currentExpenseTotals.get(key) ?? 0) + Math.abs(row.convertedValue))
        } else {
          currentIncomeTotals.set(key, (currentIncomeTotals.get(key) ?? 0) + row.convertedValue)
        }
      }

      const periodExpenseTotals: Map<string | null, number>[] = []
      const periodIncomeTotals: Map<string | null, number>[] = []
      for (let i = 0; i < lookbackPeriods.length; i++) {
        periodExpenseTotals.push(new Map())
        periodIncomeTotals.push(new Map())
      }

      for (const row of lookback) {
        if (row.convertedValue == null) continue
        const periodKey = this.periodKeyFor(mode, row.date)
        const periodIndex = lookbackPeriods.indexOf(periodKey)
        if (periodIndex === -1) continue
        const key = row.categoryId ?? null
        if (row.convertedValue < 0) {
          const m = periodExpenseTotals[periodIndex]
          m.set(key, (m.get(key) ?? 0) + Math.abs(row.convertedValue))
        } else {
          const m = periodIncomeTotals[periodIndex]
          m.set(key, (m.get(key) ?? 0) + row.convertedValue)
        }
      }

      const averageExpenseTotals = new Map<string | null, number>()
      const averageIncomeTotals = new Map<string | null, number>()

      const allExpenseKeys = new Set<string | null>()
      const allIncomeKeys = new Set<string | null>()
      for (const m of periodExpenseTotals) {
        for (const k of m.keys()) allExpenseKeys.add(k)
      }
      for (const m of periodIncomeTotals) {
        for (const k of m.keys()) allIncomeKeys.add(k)
      }

      for (const key of allExpenseKeys) {
        let sum = 0
        let count = 0
        for (const m of periodExpenseTotals) {
          if (m.has(key)) {
            sum += m.get(key)!
            count++
          }
        }
        averageExpenseTotals.set(key, count > 0 ? sum / count : 0)
      }

      for (const key of allIncomeKeys) {
        let sum = 0
        let count = 0
        for (const m of periodIncomeTotals) {
          if (m.has(key)) {
            sum += m.get(key)!
            count++
          }
        }
        averageIncomeTotals.set(key, count > 0 ? sum / count : 0)
      }

      const changes: CategoryChange[] = []

      for (const [categoryId, currentTotal] of currentExpenseTotals) {
        const avgTotal = averageExpenseTotals.get(categoryId) ?? 0
        if (avgTotal === 0) continue
        const percentChange = ((currentTotal - avgTotal) / avgTotal) * 100
        if (percentChange >= 30) {
          changes.push({
            categoryId,
            categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
            kind: 'expense',
            type: 'expense_spike',
            currentTotal,
            previousTotal: avgTotal,
            percentChange,
          })
        } else if (percentChange <= -30) {
          changes.push({
            categoryId,
            categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
            kind: 'expense',
            type: 'expense_improvement',
            currentTotal,
            previousTotal: avgTotal,
            percentChange,
          })
        }
      }

      for (const [categoryId, currentTotal] of currentIncomeTotals) {
        const avgTotal = averageIncomeTotals.get(categoryId) ?? 0
        if (avgTotal === 0) continue
        const percentChange = ((currentTotal - avgTotal) / avgTotal) * 100
        if (percentChange >= 30) {
          changes.push({
            categoryId,
            categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
            kind: 'income',
            type: 'income_spike',
            currentTotal,
            previousTotal: avgTotal,
            percentChange,
          })
        } else if (percentChange <= -30) {
          changes.push({
            categoryId,
            categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
            kind: 'income',
            type: 'income_reduction',
            currentTotal,
            previousTotal: avgTotal,
            percentChange,
          })
        }
      }

      return changes.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
    })
  }

  private async detectTopTransactions(
    userId: string,
    current: DisplayRow[],
    kind: AmountKind,
  ): Promise<TopTransaction[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const categoryRows = await tx.select().from(categories)
      const categoryById = new Map(categoryRows.map((c) => [c.id, c]))

      interface GroupKey {
        description: string
        currencyCode: string
      }

      const groups = new Map<string, {
        key: GroupKey
        total: number
        count: number
        categoryId: string | null
        mostRecentDate: string
      }>()

      for (const row of current) {
        if (row.convertedValue == null) continue
        const isExpense = row.convertedValue < 0
        if ((kind === 'expense') !== isExpense) continue

        const groupKey = `${row.description.toLowerCase()}|${row.currencyCode}`
        const existing = groups.get(groupKey)
        if (existing) {
          existing.total += Math.abs(row.convertedValue)
          existing.count++
          if (row.date > existing.mostRecentDate) {
            existing.mostRecentDate = row.date
          }
        } else {
          groups.set(groupKey, {
            key: { description: row.description, currencyCode: row.currencyCode },
            total: Math.abs(row.convertedValue),
            count: 1,
            categoryId: row.categoryId,
            mostRecentDate: row.date,
          })
        }
      }

      const results: TopTransaction[] = []
      for (const group of groups.values()) {
        const category = group.categoryId ? categoryById.get(group.categoryId) : null
        results.push({
          description: group.key.description,
          amount: group.total,
          currencyCode: group.key.currencyCode,
          categoryId: group.categoryId,
          categoryName: category?.name ?? null,
          categoryIcon: (category?.icon ?? null) as CategoryIconKey | null,
          occurrenceCount: group.count,
          mostRecentDate: group.mostRecentDate,
        })
      }

      return results.sort((a, b) => b.amount - a.amount).slice(0, 5)
    })
  }

  private async detectRecurringPayments(
    userId: string,
    currentRange: { from: string; to: string },
  ): Promise<RecurringPayment[]> {
    const lookbackMonths = 3
    const [year, month] = currentRange.to.split('-').map(Number)
    const endDate = new Date(year, month - 1, 1)
    const startDate = subMonths(endDate, lookbackMonths)

    const startDateStr = format(startOfMonth(startDate), 'yyyy-MM-dd')
    const endDateStr = format(endOfMonth(endDate), 'yyyy-MM-dd')

    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(transactions)
        .where(
          and(
            gte(transactions.date, startDateStr),
            lte(transactions.date, endDateStr),
          ),
        )

      const categoryRows = await tx.select().from(categories)
      const categoryById = new Map(categoryRows.map((c) => [c.id, c]))

      const byDescAmount = new Map<string, { row: typeof rows[0]; count: number; months: Set<string>; mostRecentDate: string }[]>()
      for (const row of rows) {
        const amount = Number(row.amount)
        if (amount >= 0) continue
        const absAmount = Math.abs(amount)
        const roundedAmount = Math.round(absAmount * 100) / 100
        const key = `${row.description.toLowerCase()}|${roundedAmount}`
        const month = row.date.slice(0, 7)

        if (!byDescAmount.has(key)) {
          byDescAmount.set(key, [])
        }
        const entries = byDescAmount.get(key)!
        const existing = entries.find((e) => Math.abs(Number(e.row.amount) - amount) < 0.01)
        if (existing) {
          existing.count++
          existing.months.add(month)
          if (row.date > existing.mostRecentDate) {
            existing.mostRecentDate = row.date
          }
        } else {
          entries.push({ row, count: 1, months: new Set([month]), mostRecentDate: row.date })
        }
      }

      const recurring: RecurringPayment[] = []
      for (const entries of byDescAmount.values()) {
        for (const { row, count, months, mostRecentDate } of entries) {
          if (count >= 3 && months.size >= 3) {
            const category = row.categoryId ? categoryById.get(row.categoryId) : null
            recurring.push({
              description: row.description,
              amount: Math.abs(Number(row.amount)),
              currencyCode: row.currencyCode,
              occurrenceCount: count,
              monthCount: months.size,
              categoryId: row.categoryId,
              categoryName: category?.name ?? null,
              categoryIcon: (category?.icon ?? null) as CategoryIconKey | null,
              mostRecentDate,
            })
          }
        }
      }

      return recurring.sort((a, b) => b.amount - a.amount)
    })
  }

  private async getRows(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<DisplayRow[]> {
    const rows = await this.reportingQueryService.listDisplayRows(userId, filter, view)
    for (const row of rows) {
      if (row.convertedValue == null) throw FxUnavailableError.amount(row.currencyCode, row.date)
    }
    return rows
  }
}
