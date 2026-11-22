import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { DisplayRow, InsightMode, TopTransaction } from 'shared-types'
import { PeriodSentence } from '../../components/PeriodSentence'
import { shiftPeriod } from '../../lib/period'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { SegmentedControl } from '../../components/SegmentedControl'
import { useProfile } from '../../hooks/useProfile'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategoryBreakdown } from '../../hooks/useCategoryBreakdown'
import { useHeatmap } from '../../hooks/useHeatmap'
import { useDashboardSummary } from '../../hooks/useDashboardSummary'
import { useImportantThings } from '../../hooks/useImportantThings'
import { useTrend } from '../../hooks/useTrend'
import { useUrlState } from '../../hooks/useUrlState'
import { useScrollRestoreWhenReady } from '../../hooks/useScrollRestoreWhenReady'
import { TransactionRow } from '../accounts/TransactionRow'
import { CategoryBarChart } from './CategoryBarChart'
import { CalendarHeatmap } from './CalendarHeatmap'
import { MonthlyBarChart } from './MonthlyBarChart'
import { SummaryCard } from './DashboardMetrics'
import { IncomeExpenseChart } from './IncomeExpenseChart'
import { InsightDrillPanel } from './InsightDrillPanel'
import { SplitPanelCard } from './SplitPanelCard'
import { breakdownDetails, currentPeriod, readInsightsView, type FlowTab } from './insightsView'

const TREND_WINDOW = { monthly: 12, yearly: 5 } as const
const TREND_STEP = { monthly: 4, yearly: 1 } as const
const MIN_YEARLY_BARS = 6

/** Wraps a Top-aggregate (latest occurrence + summed amount) so it renders
    through the standard ledger `TransactionRow`. */
/** The API reports top totals as positive amounts; expenses are signed negative so the row shows them in the expense colour. */
function topTxnRow(item: TopTransaction, kind: 'expense' | 'income'): DisplayRow {
  return {
    kind: 'plain',
    date: item.mostRecentDate,
    amount: kind === 'expense' ? -Math.abs(item.amount) : Math.abs(item.amount),
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

export function ChartsPage() {
  // The whole view lives in the URL (see insightsView.ts), so leaving (e.g.
  // "Show all") and coming Back, or reloading, restores it exactly.
  const [params, updateParams] = useUrlState()
  const location = useLocation()
  const { mode, period, trendAnchor, flowTab, activeSplit } = readInsightsView(params)

  const periodPatch = (nextPeriod: string, nextMode: InsightMode) => (nextPeriod === currentPeriod(nextMode) ? null : nextPeriod)
  const trendPatch = (nextAnchor: string, forPeriod: string) => (nextAnchor === forPeriod ? null : nextAnchor)
  const closeSplit = () => updateParams({ drill: null })

  const handleFlowTabChange = (tab: FlowTab) => {
    updateParams({ tab: tab === 'expense' ? null : tab, drill: null })
  }
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

  // Back from "Show all" lands where the page was scrolled, once its sections have loaded.
  useScrollRestoreWhenReady(
    !summary.loading && !expenseByCategory.loading && !incomeByCategory.loading && !expenseHeatmap.loading && !incomeHeatmap.loading && !importantThings.loading && !trend.loading,
  )

  const error =
    summary.error ??
    expenseByCategory.error ??
    incomeByCategory.error ??
    expenseHeatmap.error ??
    incomeHeatmap.error ??
    importantThings.error ??
    trend.error

  const handleModeChange = (nextMode: InsightMode) => {
    // Picking the mode already shown changes nothing (it used to jump back to today).
    if (nextMode === mode) return
    // Monthly → Yearly keeps the selected month's year; Yearly → Monthly opens this month.
    const nextPeriod = nextMode === 'yearly' ? period.slice(0, 4) : currentPeriod('monthly')
    updateParams({
      mode: nextMode === 'monthly' ? null : nextMode,
      period: periodPatch(nextPeriod, nextMode),
      trend: null,
      drill: null,
    })
  }

  const handlePeriodChange = (nextPeriod: string) => {
    // Keep the trend window where it is if the new period is already on screen.
    const nextAnchor = trend.points.some((p) => p.period === nextPeriod) ? trendAnchor : nextPeriod
    updateParams({ period: periodPatch(nextPeriod, mode), trend: trendPatch(nextAnchor, nextPeriod), drill: null })
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
      closeSplit()
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
    // closeSplit only patches the URL; re-subscribing when it changes identity would be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSplit?.type, activeSplit?.itemKey])

  const currencyCode = profile?.homeCurrencyCode ?? 'USD'

  const handleSplitSelect = (type: 'category' | 'calendar', itemKey: string, kind: 'expense' | 'income') => {
    const isOpen = activeSplit && activeSplit.type === type && activeSplit.itemKey === itemKey && activeSplit.kind === kind
    updateParams({ drill: isOpen ? null : `${type}:${itemKey}` })
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
    updateParams({ trend: trendPatch(stepped > fullWindowFromStart ? stepped : fullWindowFromStart, period) })
  }

  const pageForward = () => {
    if (!latestPeriod) return
    const stepped = shiftPeriod(mode, trendAnchor, TREND_STEP[mode])
    updateParams({ trend: trendPatch(stepped < latestPeriod ? stepped : latestPeriod, period) })
  }

  const trendRange = trendPoints.length > 0
    ? `${trendPoints[0].label} ${trendPoints[0].period.slice(0, 4)} – ${trendPoints[trendPoints.length - 1].label} ${trendPoints[trendPoints.length - 1].period.slice(0, 4)}`
    : ''

  const isCategorySplit = (kind: string) => activeSplit?.type === 'category' && activeSplit.kind === kind
  const isCalendarSplit = (kind: string) => activeSplit?.type === 'calendar' && activeSplit.kind === kind

  const splitDetails = (type: 'category' | 'calendar', kind: FlowTab) => {
    if (!activeSplit || activeSplit.type !== type || activeSplit.kind !== kind) return null
    const { range, match, title } = breakdownDetails(activeSplit, mode, period, categories)
    return (
      <InsightDrillPanel
        range={range}
        match={match}
        categories={categories}
        currencyCode={currencyCode}
        title={title}
        // The full list, as a sub-page of Insights with the same params; its back button returns here.
        showAllHref={`/insights/transactions${location.search}`}
        onClose={closeSplit}
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

      {/* Summary: totals, then (below a keyline) the biggest category changes */}
      <SummaryCard
        current={summary}
        loading={summary.loading}
        changes={importantThings.categoryChanges}
        changesLoading={importantThings.loading}
        currencyCode={currencyCode}
      />

      {/* Expenses | Income: every section below belongs to the selected side */}
      <SegmentedControl
        value={flowTab}
        options={[
          { value: 'expense', label: 'Expenses' },
          { value: 'income', label: 'Income' },
        ]}
        onChange={handleFlowTabChange}
        ariaLabel="Show expense or income insights"
        className="insights-flow-tabs"
      />

      {flowTab === 'expense' ? (
        <>
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
                  row={topTxnRow(item, 'expense')}
                  categories={categories}
                  accounts={accounts}
                  showAccount={false}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

        </>
      ) : (
        <>
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
                  row={topTxnRow(item, 'income')}
                  categories={categories}
                  accounts={accounts}
                  showAccount={false}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

        </>
      )}
    </main>
  )
}
