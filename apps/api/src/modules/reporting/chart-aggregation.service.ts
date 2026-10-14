import { Inject, Injectable } from '@nestjs/common'
import { format, parseISO } from 'date-fns'
import type {
  AmountKind,
  BucketGranularity,
  CategoryBreakdownResponse,
  DashboardSummary,
  DisplayRow,
  ExcludedCurrency,
  TimeseriesResponse,
  TransactionView,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { categories } from '../../db/schema.js'
import { ReportingQueryService, type ListTransactionsFilter } from './reporting-query.service.js'
import { buildBuckets, resolveGranularity, type Bucket } from './buckets.js'

interface ConversionResult {
  converted: { row: DisplayRow; convertedAmount: number }[]
  excludedCurrencies: ExcludedCurrency[]
}

function bucketKeyFor(dateISO: string, granularity: BucketGranularity, buckets: Bucket[]): string | undefined {
  if (granularity === 'monthly') return dateISO.slice(0, 7)
  if (granularity === 'daily') return dateISO
  const d = parseISO(dateISO)
  return buckets.find((b) => d >= b.start && d <= b.end)?.key
}

const MOVING_AVERAGE_WINDOW: Record<BucketGranularity, number> = {
  daily: 7,
  weekly: 4,
  monthly: 3,
}

@Injectable()
export class ChartAggregationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ReportingQueryService) private readonly reportingQueryService: ReportingQueryService,
  ) {}

  async getCategoryBreakdown(
    userId: string,
    filter: ListTransactionsFilter,
    view: TransactionView,
    kind: AmountKind,
  ): Promise<CategoryBreakdownResponse> {
    const { converted, excludedCurrencies } = await this.getConvertedRows(userId, filter, view)

    return runInTenantContext(this.db, userId, async (tx) => {
      const categoryRows = await tx.select().from(categories)
      const nameById = new Map(categoryRows.map((c) => [c.id, c.name]))

      const totals = new Map<string | null, number>()
      for (const { row, convertedAmount } of converted) {
        const isExpense = convertedAmount < 0
        if ((kind === 'expense') !== isExpense) continue
        totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + Math.abs(convertedAmount))
      }

      const points = [...totals.entries()]
        .filter(([, total]) => total !== 0)
        .map(([categoryId, total]) => ({
          categoryId,
          categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorized',
          total,
        }))
        .sort((a, b) => b.total - a.total)

      return { points, excludedCurrencies }
    })
  }

  async getTimeseries(
    userId: string,
    filter: ListTransactionsFilter,
    view: TransactionView,
    kind: AmountKind,
  ): Promise<TimeseriesResponse> {
    const { converted, excludedCurrencies } = await this.getConvertedRows(userId, filter, view)

    const from = filter.dateRange!.from!
    const to = filter.dateRange!.to!
    const granularity = resolveGranularity(from, to)
    const buckets = buildBuckets(from, to, granularity)
    const totalsByKey = new Map(buckets.map((b) => [b.key, 0]))

    for (const { row, convertedAmount } of converted) {
      const isExpense = convertedAmount < 0
      if ((kind === 'expense') !== isExpense) continue
      const key = bucketKeyFor(row.date, granularity, buckets)
      if (key === undefined || !totalsByKey.has(key)) continue
      totalsByKey.set(key, totalsByKey.get(key)! + Math.abs(convertedAmount))
    }

    const totals = buckets.map((b) => totalsByKey.get(b.key)!)
    const windowSize = MOVING_AVERAGE_WINDOW[granularity]

    const points = buckets.map((b, i) => ({
      bucketStart: format(b.start, 'yyyy-MM-dd'),
      bucketLabel: b.label,
      total: totals[i],
      movingAverage:
        i < windowSize - 1 ? null : totals.slice(i - windowSize + 1, i + 1).reduce((s, v) => s + v, 0) / windowSize,
    }))

    return { granularity, points, excludedCurrencies }
  }

  async getDashboardSummary(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<DashboardSummary> {
    const { converted, excludedCurrencies } = await this.getConvertedRows(userId, filter, view)

    let totalExpense = 0
    let totalIncome = 0
    for (const { convertedAmount } of converted) {
      if (convertedAmount < 0) totalExpense += Math.abs(convertedAmount)
      else totalIncome += convertedAmount
    }

    const netIncome = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? netIncome / totalIncome : null

    return { totalExpense, totalIncome, netIncome, savingsRate, excludedCurrencies }
  }

  /**
   * Home-currency values are materialized on each transaction at write time
   * (see ExchangeRatesService), so aggregating is a plain sum of the stored
   * converted_value. A row whose value could not be resolved is tallied as an
   * excluded currency rather than thrown.
   */
  private async getConvertedRows(userId: string, filter: ListTransactionsFilter, view: TransactionView): Promise<ConversionResult> {
    const rows = await this.reportingQueryService.listDisplayRows(userId, filter, view)
    const excluded = new Map<string, number>()
    const converted: ConversionResult['converted'] = []
    for (const row of rows) {
      if (row.convertedValue == null) {
        excluded.set(row.currencyCode, (excluded.get(row.currencyCode) ?? 0) + 1)
        continue
      }
      converted.push({ row, convertedAmount: row.convertedValue })
    }
    return {
      converted,
      excludedCurrencies: [...excluded.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount })),
    }
  }
}
