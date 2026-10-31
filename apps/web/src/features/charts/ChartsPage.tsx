import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { DisplayRow, InsightMode, TopTransaction } from 'shared-types'
import { PeriodSentence } from '../../components/PeriodSentence'
import { formatPeriod, periodRange, shiftPeriod } from '../../lib/period'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { useProfile } from '../../hooks/useProfile'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategoryBreakdown } from '../../hooks/useCategoryBreakdown'
import { useHeatmap } from '../../hooks/useHeatmap'
import { useDashboardSummary } from '../../hooks/useDashboardSummary'
import { useImportantThings } from '../../hooks/useImportantThings'
import { useTrend } from '../../hooks/useTrend'
import { TransactionRow } from '../accounts/TransactionRow'
import { CategoryBarChart } from './CategoryBarChart'
import { CalendarHeatmap } from './CalendarHeatmap'
import { MonthlyBarChart } from './MonthlyBarChart'
import { DashboardMetrics } from './DashboardMetrics'
import { IncomeExpenseChart } from './IncomeExpenseChart'
import { InsightDrillPanel } from './InsightDrillPanel'
import { SplitPanelCard } from './SplitPanelCard'
import { CategoryChangesCard } from './ImportantThingsCards'
import { categoryKey, rowKind } from './drillDown'

const TREND_WINDOW = { monthly: 12, yearly: 5 } as const
const TREND_STEP = { monthly: 4, yearly: 1 } as const
const MIN_YEARLY_BARS = 6

/** Wraps a Top-aggregate (latest occurrence + summed amount) so it renders
    through the standard ledger `TransactionRow`. */
function topTxnRow(item: TopTransaction): DisplayRow {
  return {
    kind: 'plain',
    date: item.mostRecentDate,
    amount: item.amount,
    currencyCode: item.currencyCode,
    description: item.description,
    categoryId: item.categoryId,
    accountIds: [],
    anchorAccountId: null,
    sourceTransactionIds: [],
    reconciliationGroupId: null,
    monthSplitId: null,
    convertedValue: null,
    rateSource: 'auto',
  }
}

interface ActiveSplit {
  type: 'category' | 'calendar'
  itemKey: string
  kind: 'expense' | 'income'
}

export function ChartsPage() {
  const [mode, setMode] = useState<InsightMode>('monthly')
  const [period, setPeriod] = useState<string>(() => format(new Date(), 'yyyy-MM'))
  const [trendAnchor, setTrendAnchor] = useState<string>(period)
  const [activeSplit, setActiveSplit] = useState<ActiveSplit | null>(null)
  const { profile } = useProfile()
  const { categories } = useCategories()
  const { accounts } = useAccounts()

  const summary = useDashboardSummary(mode, period)
  const expenseByCategory = useCategoryBreakdown(mode, period, 'expense')
  const incomeByCategory = useCategoryBreakdown(mode, period, 'income')
  const expenseHeatmap = useHeatmap(mode, period, 'expense')
  const incomeHeatmap = useHeatmap(mode, period, 'income')
  const importantThings = useImportantThings(mode, period)
  const trend = useTrend(mode, trendAnchor)

  const error =
    summary.error ??
    expenseByCategory.error ??
    incomeByCategory.error ??
    expenseHeatmap.error ??
    incomeHeatmap.error ??
    importantThings.error ??
    trend.error

  const handleModeChange = (nextMode: InsightMode) => {
    const nextPeriod = nextMode === 'monthly' ? format(new Date(), 'yyyy-MM') : format(new Date(), 'yyyy')
    setMode(nextMode)
    setPeriod(nextPeriod)
    setTrendAnchor(nextPeriod)
    setActiveSplit(null)
  }

  const handlePeriodChange = (nextPeriod: string) => {
    setPeriod(nextPeriod)
    if (!trend.points.some((p) => p.period === nextPeriod)) setTrendAnchor(nextPeriod)
    setActiveSplit(null)
  }

  // Clicking anywhere outside the open drawer (but not inside a chart, where
  // clicks belong to the select/toggle logic) closes it.
  useEffect(() => {
    if (!activeSplit) return
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.split-panel-drawer')) return
      if (target.closest('.recharts-wrapper, .insight-heatmap')) return
      setActiveSplit(null)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [activeSplit])

  const currencyCode = profile?.homeCurrencyCode ?? 'USD'
  const periodLabel = formatPeriod(mode, period)
  const currentRange = periodRange(mode, period)

  const handleSplitSelect = (type: 'category' | 'calendar', itemKey: string, kind: 'expense' | 'income') => {
    const newSplit: ActiveSplit = { type, itemKey, kind }
    if (activeSplit && activeSplit.type === type && activeSplit.itemKey === itemKey && activeSplit.kind === kind) {
      setActiveSplit(null)
    } else {
      setActiveSplit(newSplit)
    }
  }

  const { earliestPeriod, latestPeriod } = trend
  const trendPoints = trend.points.filter(
    (p) => (!earliestPeriod || p.period >= earliestPeriod) && (!latestPeriod || p.period <= latestPeriod),
  )

  const paddedTrendPoints = (() => {
    if (mode === 'monthly') {
      const months: string[] = []
      for (let i = 0; i < TREND_WINDOW[mode]; i++) {
        months.push(shiftPeriod(mode, trendAnchor, -i))
      }
      months.reverse()
      return months.map((p) => {
        const existing = trendPoints.find(pt => pt.period === p)
        if (existing) return existing
        return { period: p, label: format(parseISO(p + '-01'), 'MMM'), totalIncome: 0, totalExpense: 0, savingsRate: null }
      })
    }
    if (trendPoints.length >= MIN_YEARLY_BARS) return trendPoints
    const currentYear = new Date().getFullYear()
    const startYear = currentYear - MIN_YEARLY_BARS + 1
    const existing = new Set(trendPoints.map(p => p.period))
    const padded = [...trendPoints]
    for (let year = startYear; year <= currentYear; year++) {
      if (!existing.has(String(year))) {
        padded.push({ period: String(year), label: String(year), totalIncome: 0, totalExpense: 0, savingsRate: null })
      }
    }
    return padded.sort((a, b) => a.period.localeCompare(b.period))
  })()

  const windowStart = shiftPeriod(mode, trendAnchor, -(TREND_WINDOW[mode] - 1))
  const canPageBack = earliestPeriod !== null && windowStart > earliestPeriod
  const canPageForward = latestPeriod !== null && trendAnchor < latestPeriod

  const pageBack = () => {
    if (!earliestPeriod) return
    const stepped = shiftPeriod(mode, trendAnchor, -TREND_STEP[mode])
    const fullWindowFromStart = shiftPeriod(mode, earliestPeriod, TREND_WINDOW[mode] - 1)
    setTrendAnchor(stepped > fullWindowFromStart ? stepped : fullWindowFromStart)
  }

  const pageForward = () => {
    if (!latestPeriod) return
    const stepped = shiftPeriod(mode, trendAnchor, TREND_STEP[mode])
    setTrendAnchor(stepped < latestPeriod ? stepped : latestPeriod)
  }

  const trendRange = trendPoints.length > 0
    ? `${trendPoints[0].label} ${trendPoints[0].period.slice(0, 4)} – ${trendPoints[trendPoints.length - 1].label} ${trendPoints[trendPoints.length - 1].period.slice(0, 4)}`
    : ''

  const isCategorySplit = (kind: string) => activeSplit?.type === 'category' && activeSplit.kind === kind
  const isCalendarSplit = (kind: string) => activeSplit?.type === 'calendar' && activeSplit.kind === kind

  const buildCategoryMatch = (key: string, kind: 'expense' | 'income') =>
    (row: { convertedValue?: number; amount: number; categoryId: string | null }) =>
      rowKind(row as never) === kind && categoryKey(row.categoryId) === key

  const buildCalendarMatch = (date: string, kind: 'expense' | 'income') =>
    (row: { convertedValue?: number; amount: number; date: string }) =>
      rowKind(row as never) === kind && row.date === date

  const splitDetails = (type: 'category' | 'calendar', kind: 'expense' | 'income') => {
    if (!activeSplit || activeSplit.type !== type || activeSplit.kind !== kind) return null
    const itemKey = activeSplit.itemKey
    // In yearly mode the calendar drill targets a month ('yyyy-MM' key); in
    // monthly mode it targets a single day ('yyyy-MM-dd').
    const isMonthDrill = itemKey.length === 7
    const drillRange = isMonthDrill ? periodRange('monthly', itemKey) : currentRange
    const match = type === 'category'
      ? buildCategoryMatch(itemKey, kind)
      : isMonthDrill
        ? (row: { date: string }) => row.date.startsWith(itemKey)
        : buildCalendarMatch(itemKey, kind)
    const title = type === 'category'
      ? `${categories.find(c => c.id === itemKey)?.name ?? 'Uncategorized'} · ${periodLabel}`
      : isMonthDrill
        ? formatPeriod('monthly', itemKey)
        : format(parseISO(itemKey), 'EEEE, MMMM do')
    // Hand-off for the drawer's "Show All": the Transactions view opened with
    // this drill's exact filters (range + the selected day/month/category).
    const showAllParams = new URLSearchParams({ from: drillRange.from, to: drillRange.to })
    if (type === 'category' && itemKey !== categoryKey(null)) showAllParams.set('category', itemKey)
    const showAllHref = `/accounts?${showAllParams.toString()}`
    return (
      <InsightDrillPanel
        range={drillRange}
        match={match as never}
        categories={categories}
        currencyCode={currencyCode}
        title={title}
        showAllHref={showAllHref}
        onClose={() => setActiveSplit(null)}
      />
    )
  }

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <h1>Insights</h1>

      <PeriodSentence
        mode={mode}
        period={period}
        onModeChange={handleModeChange}
        onPeriodChange={handlePeriodChange}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {/* Trend chart */}
      <Card style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <h4 className="insights-subheader">{mode === 'monthly' ? 'Monthly trend' : 'Yearly trend'}</h4>
        <p className="insights-hint">Click a bar to select that period</p>
        <IncomeExpenseChart
          subtitle={mode === 'monthly' ? trendRange : trendPoints.length > 0 ? `${trendPoints[0].period} – ${trendPoints[trendPoints.length - 1].period}` : ''}
          points={paddedTrendPoints}
          currencyCode={currencyCode}
          currentPeriod={period}
          loading={trend.loading}
          onSelectPeriod={handlePeriodChange}
          onPageBack={canPageBack ? pageBack : undefined}
          onPageForward={canPageForward ? pageForward : undefined}
          stepLabel={mode === 'monthly' ? '4 months' : '1 year'}
        />
      </Card>

      {/* Metrics */}
      <DashboardMetrics current={summary} loading={summary.loading} currencyCode={currencyCode} />

      {/* ─ Income Section ── */}
      <h3 className="insights-section-header">Income</h3>

      {/* Income — By Category */}
      <SplitPanelCard
        subheader="By Category"
        hint="Click a category bar to see its transactions"
        isSplit={isCategorySplit('income')}
        details={splitDetails('category', 'income')}
      >
        <CategoryBarChart
          title=""
          points={incomeByCategory.points}
          kind="income"
          currencyCode={currencyCode}
          loading={incomeByCategory.loading}
          selectedKey={isCategorySplit('income') ? activeSplit?.itemKey : null}
          onSelect={(key) => handleSplitSelect('category', key, 'income')}
        />
      </SplitPanelCard>

      {/* Income — By Date */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <SplitPanelCard
          subheader="By Date"
          hint="Click a date to see its transactions"
          isSplit={isCalendarSplit('income')}
          details={splitDetails('calendar', 'income')}
        >
          {mode === 'yearly' ? (
            <MonthlyBarChart
              title=""
              days={incomeHeatmap.days}
              kind="income"
              currencyCode={currencyCode}
              loading={incomeHeatmap.loading}
              selectedKey={isCalendarSplit('income') ? activeSplit?.itemKey ?? null : null}
              onSelect={(monthKey) => handleSplitSelect('calendar', monthKey, 'income')}
            />
          ) : (
            <CalendarHeatmap
              title=""
              days={incomeHeatmap.days}
              kind="income"
              currencyCode={currencyCode}
              period={period}
              mode={mode}
              loading={incomeHeatmap.loading}
              selectedKey={isCalendarSplit('income') ? activeSplit?.itemKey : null}
              onSelect={(date) => handleSplitSelect('calendar', date, 'income')}
            />
          )}
        </SplitPanelCard>
      </div>

      {/* Income — Top Income */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <h4 className="insights-subheader">Top Income</h4>
          {importantThings.loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
          {!importantThings.loading && importantThings.topIncome.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No income for this period.</p>}
          {!importantThings.loading && importantThings.topIncome.length > 0 && (
            <ul className="txn-list">
              {importantThings.topIncome.map((item) => (
                <TransactionRow
                  key={`${item.description}-${item.mostRecentDate}`}
                  row={topTxnRow(item)}
                  categories={categories}
                  accounts={accounts}
                  showAccount={false}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Expenses Section ── */}
      <h3 className="insights-section-header" style={{ marginTop: 'var(--space-6)' }}>Expenses</h3>

      {/* Expenses — By Category */}
      <SplitPanelCard
        subheader="By Category"
        hint="Click a category bar to see its transactions"
        isSplit={isCategorySplit('expense')}
        details={splitDetails('category', 'expense')}
      >
        <CategoryBarChart
          title=""
          points={expenseByCategory.points}
          kind="expense"
          currencyCode={currencyCode}
          loading={expenseByCategory.loading}
          selectedKey={isCategorySplit('expense') ? activeSplit?.itemKey : null}
          onSelect={(key) => handleSplitSelect('category', key, 'expense')}
        />
      </SplitPanelCard>

      {/* Expenses — By Date */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <SplitPanelCard
          subheader="By Date"
          hint="Click a date to see its transactions"
          isSplit={isCalendarSplit('expense')}
          details={splitDetails('calendar', 'expense')}
        >
          {mode === 'yearly' ? (
            <MonthlyBarChart
              title=""
              days={expenseHeatmap.days}
              kind="expense"
              currencyCode={currencyCode}
              loading={expenseHeatmap.loading}
              selectedKey={isCalendarSplit('expense') ? activeSplit?.itemKey ?? null : null}
              onSelect={(monthKey) => handleSplitSelect('calendar', monthKey, 'expense')}
            />
          ) : (
            <CalendarHeatmap
              title=""
              days={expenseHeatmap.days}
              kind="expense"
              currencyCode={currencyCode}
              period={period}
              mode={mode}
              loading={expenseHeatmap.loading}
              selectedKey={isCalendarSplit('expense') ? activeSplit?.itemKey : null}
              onSelect={(date) => handleSplitSelect('calendar', date, 'expense')}
            />
          )}
        </SplitPanelCard>
      </div>

      {/* Expenses — Changes */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <CategoryChangesCard
          changes={importantThings.categoryChanges}
          filterKind="expense"
          hint="Categories with the most significant change"
          loading={importantThings.loading}
        />
      </div>

      {/* Expenses — Top Expenses */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <h4 className="insights-subheader">Top Expenses</h4>
          {importantThings.loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
          {!importantThings.loading && importantThings.topExpenses.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No expenses for this period.</p>}
          {!importantThings.loading && importantThings.topExpenses.length > 0 && (
            <ul className="txn-list">
              {importantThings.topExpenses.map((item) => (
                <TransactionRow
                  key={`${item.description}-${item.mostRecentDate}`}
                  row={topTxnRow(item)}
                  categories={categories}
                  accounts={accounts}
                  showAccount={false}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  )
}
