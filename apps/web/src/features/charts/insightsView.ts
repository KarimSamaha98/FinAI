import { format, parseISO } from 'date-fns'
import type { Category, DisplayRow, InsightMode } from 'shared-types'
import { pickParam } from '../../hooks/useUrlState'
import { formatPeriod, periodRange } from '../../lib/period'
import { categoryKey, rowKind } from './drillDown'

/**
 * The Insights view as kept in the URL, shared by the Insights page and its
 * "Show all" sub-page (/insights/transactions, same params), so both read a
 * breakdown the same way:
 * ?mode=yearly&period=2025&trend=2024&tab=income&drill=category:<id>.
 * Defaults (this month, the trend window ending on it, Expenses, no
 * breakdown open) are left out.
 */

export type FlowTab = 'expense' | 'income'

/** An open breakdown: a category bar, or a day (monthly) / month (yearly) on the By Date chart. */
export interface ActiveSplit {
  type: 'category' | 'calendar'
  itemKey: string
  kind: FlowTab
}

export interface InsightsView {
  mode: InsightMode
  period: string
  /** The trend chart's window ends here; by default on the selected period. */
  trendAnchor: string
  flowTab: FlowTab
  activeSplit: ActiveSplit | null
}

/** Today's period: this month ('yyyy-MM') or this year ('yyyy'). */
export function currentPeriod(mode: InsightMode): string {
  return format(new Date(), mode === 'monthly' ? 'yyyy-MM' : 'yyyy')
}

/** The param when it's a period of this mode's shape, else null. */
function periodParam(value: string | null, mode: InsightMode): string | null {
  if (!value) return null
  return (mode === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}$/).test(value) ? value : null
}

/** ?drill=calendar:2026-09-14 → the open breakdown; its side is the selected tab. */
function drillParam(value: string | null, kind: FlowTab): ActiveSplit | null {
  const match = value?.match(/^(category|calendar):(.+)$/)
  return match ? { type: match[1] as ActiveSplit['type'], itemKey: match[2], kind } : null
}

export function readInsightsView(params: URLSearchParams): InsightsView {
  const mode = pickParam<InsightMode>(params, 'mode', ['monthly', 'yearly'], 'monthly')
  const period = periodParam(params.get('period'), mode) ?? currentPeriod(mode)
  const flowTab = pickParam<FlowTab>(params, 'tab', ['expense', 'income'], 'expense')
  return {
    mode,
    period,
    trendAnchor: periodParam(params.get('trend'), mode) ?? period,
    flowTab,
    activeSplit: drillParam(params.get('drill'), flowTab),
  }
}

export interface BreakdownDetails {
  /** The dates to fetch: the month for a yearly By Date bar, else the selected period. */
  range: { from: string; to: string }
  /** Which fetched rows belong to the breakdown. */
  match: (row: DisplayRow) => boolean
  title: string
  /** The Transactions view with the same range and category, for editing. */
  ledgerHref: string
}

export function breakdownDetails(split: ActiveSplit, mode: InsightMode, period: string, categories: Category[]): BreakdownDetails {
  const { type, itemKey, kind } = split
  // In yearly mode the By Date chart targets a month ('yyyy-MM'); in monthly mode a day ('yyyy-MM-dd').
  const isMonth = type === 'calendar' && itemKey.length === 7
  const range = isMonth ? periodRange('monthly', itemKey) : periodRange(mode, period)
  const match = (row: DisplayRow) => {
    if (rowKind(row) !== kind) return false
    if (type === 'category') return categoryKey(row.categoryId) === itemKey
    return isMonth ? row.date.startsWith(itemKey) : row.date === itemKey
  }
  const title =
    type === 'category'
      ? `${categories.find((c) => c.id === itemKey)?.name ?? 'Uncategorized'} · ${formatPeriod(mode, period)}`
      : isMonth
        ? formatPeriod('monthly', itemKey)
        : format(parseISO(itemKey), 'EEEE, MMMM do')
  const ledgerParams = new URLSearchParams({ from: range.from, to: range.to })
  if (type === 'category' && itemKey !== categoryKey(null)) ledgerParams.set('category', itemKey)
  return { range, match, title, ledgerHref: `/accounts?${ledgerParams.toString()}` }
}

/** Largest first, by home-currency value: the order a breakdown lists its transactions in. */
export function byHomeValue(a: DisplayRow, b: DisplayRow): number {
  return Math.abs(b.convertedValue ?? b.amount) - Math.abs(a.convertedValue ?? a.amount)
}
