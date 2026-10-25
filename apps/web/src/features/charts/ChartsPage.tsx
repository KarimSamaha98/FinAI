import { useState } from 'react'
import { format } from 'date-fns'
import type { InsightMode } from 'shared-types'
import { ModeToggle } from '../../components/ModeToggle'
import { PeriodSelector } from '../../components/PeriodSelector'
import { formatPeriod, shiftPeriod } from '../../lib/period'
import { SectionNav } from '../../components/SectionNav'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { useProfile } from '../../hooks/useProfile'
import { useCategoryBreakdown } from '../../hooks/useCategoryBreakdown'
import { useHeatmap } from '../../hooks/useHeatmap'
import { useDashboardSummary } from '../../hooks/useDashboardSummary'
import { useImportantThings } from '../../hooks/useImportantThings'
import { useTrend } from '../../hooks/useTrend'
import { CategoryBarChart } from './CategoryBarChart'
import { CalendarHeatmap } from './CalendarHeatmap'
import { MonthlyBarChart } from './MonthlyBarChart'
import { DashboardMetrics } from './DashboardMetrics'
import { IncomeExpenseChart } from './IncomeExpenseChart'
import { CategoryChangesCard, TopExpensesCard, TopIncomeCard, RecurringPaymentsCard } from './ImportantThingsCards'

// The trend chart shows 12 months (or 5 years) and pages 4 months (or 1 year) at a time.
const TREND_WINDOW = { monthly: 12, yearly: 5 } as const
const TREND_STEP = { monthly: 4, yearly: 1 } as const

const NAV_SECTIONS = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
]
export function ChartsPage() {
  const [mode, setMode] = useState<InsightMode>('monthly')
  const [period, setPeriod] = useState<string>(() => format(new Date(), 'yyyy-MM'))
  // The trend chart's window ends at this period. Clicking a bar only changes
  // `period`, so the chart stays put; picking a period outside the window moves it.
  const [trendAnchor, setTrendAnchor] = useState<string>(period)
  const [activeSection, setActiveSection] = useState<string>('expense')
  const { profile } = useProfile()

  const summary = useDashboardSummary(mode, period)
  const expenseByCategory = useCategoryBreakdown(mode, period, 'expense')
  const incomeByCategory = useCategoryBreakdown(mode, period, 'income')
  const expenseHeatmap = useHeatmap(mode, period, 'expense')
  const incomeHeatmap = useHeatmap(mode, period, 'income')
  const importantThings = useImportantThings(mode, period)
  const trend = useTrend(mode, trendAnchor)

  const loading =
    summary.loading ||
    expenseByCategory.loading ||
    incomeByCategory.loading ||
    expenseHeatmap.loading ||
    incomeHeatmap.loading ||
    importantThings.loading ||
    trend.loading

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
  }

  const handlePeriodChange = (nextPeriod: string) => {
    setPeriod(nextPeriod)
    if (!trend.points.some((p) => p.period === nextPeriod)) setTrendAnchor(nextPeriod)
  }

  const currencyCode = profile?.homeCurrencyCode ?? 'USD'

  // Columns outside the user's data are dropped rather than drawn empty, and the
  // arrows stop at the first/last period that has transactions.
  const { earliestPeriod, latestPeriod } = trend
  const trendPoints = trend.points.filter(
    (p) => (!earliestPeriod || p.period >= earliestPeriod) && (!latestPeriod || p.period <= latestPeriod),
  )
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

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Insights</h1>

      <div className="filter-bar" style={{ marginBottom: 'var(--space-5)' }}>
        <ModeToggle mode={mode} onChange={handleModeChange} />
        <PeriodSelector mode={mode} period={period} onChange={handlePeriodChange} />
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <Alert variant="error">{error}</Alert>}

      <section style={{ marginBottom: 'var(--space-5)' }}>
        <Card style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <IncomeExpenseChart
            title="Income vs Expense"
            subtitle={mode === 'monthly' ? trendRange : trendPoints.length > 0 ? `${trendPoints[0].period} – ${trendPoints[trendPoints.length - 1].period}` : ''}
            points={trendPoints}
            currencyCode={currencyCode}
            currentPeriod={period}
            onSelectPeriod={setPeriod}
            onPageBack={canPageBack ? pageBack : undefined}
            onPageForward={canPageForward ? pageForward : undefined}
            stepLabel={mode === 'monthly' ? '4 months' : '1 year'}
          />
        </Card>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{formatPeriod(mode, period)}</h2>
        <DashboardMetrics current={summary} currencyCode={currencyCode} />
      </section>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <SectionNav
          sections={NAV_SECTIONS}
          activeId={activeSection}
          onChange={setActiveSection}
        />
      </div>

      {activeSection === 'expense' && (
        <section style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card style={{ padding: 'var(--space-4)' }}>
              <CategoryBarChart
                title="By Category"
                points={expenseByCategory.points}
                kind="expense"
                currencyCode={currencyCode}
              />
            </Card>
            <Card style={{ padding: 'var(--space-4)' }}>
              {mode === 'yearly' ? (
                <MonthlyBarChart
                  title="By Month"
                  days={expenseHeatmap.days}
                  kind="expense"
                  currencyCode={currencyCode}
                />
              ) : (
                <CalendarHeatmap
                  title="By Date"
                  days={expenseHeatmap.days}
                  kind="expense"
                  currencyCode={currencyCode}
                  period={period}
                  mode={mode}
                />
              )}
            </Card>
            <CategoryChangesCard changes={importantThings.categoryChanges} filterKind="expense" title="Changes" />
            <TopExpensesCard expenses={importantThings.topExpenses} />
            <RecurringPaymentsCard payments={importantThings.recurringPayments} />
          </div>
        </section>
      )}

      {activeSection === 'income' && (
        <section style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card style={{ padding: 'var(--space-4)' }}>
              <CategoryBarChart
                title="By Category"
                points={incomeByCategory.points}
                kind="income"
                currencyCode={currencyCode}
              />
            </Card>
            <Card style={{ padding: 'var(--space-4)' }}>
              {mode === 'yearly' ? (
                <MonthlyBarChart
                  title="By Month"
                  days={incomeHeatmap.days}
                  kind="income"
                  currencyCode={currencyCode}
                />
              ) : (
                <CalendarHeatmap
                  title="By Date"
                  days={incomeHeatmap.days}
                  kind="income"
                  currencyCode={currencyCode}
                  period={period}
                  mode={mode}
                />
              )}
            </Card>
            <CategoryChangesCard changes={importantThings.categoryChanges} filterKind="income" title="Changes" />
            <TopIncomeCard income={importantThings.topIncome} />
          </div>
        </section>
      )}
    </main>
  )
}
