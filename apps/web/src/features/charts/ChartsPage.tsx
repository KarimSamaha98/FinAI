import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { InsightMode } from 'shared-types'
import { ModeToggle } from '../../components/ModeToggle'
import { PeriodSelector } from '../../components/PeriodSelector'
import { formatPeriod, periodRange, shiftPeriod } from '../../lib/period'
import { SectionNav } from '../../components/SectionNav'
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
import { useDrawer } from '../../context/DrawerContext'
import { CategoryBarChart } from './CategoryBarChart'
import { CalendarHeatmap } from './CalendarHeatmap'
import { MonthlyBarChart } from './MonthlyBarChart'
import { DashboardMetrics } from './DashboardMetrics'
import { IncomeExpenseChart } from './IncomeExpenseChart'
import { InsightDrillPanel } from './InsightDrillPanel'
import { categoryKey, rowKind, type DrillSelection } from './drillDown'
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
  // The currently-selected drill item — used for highlighting and toggling the drawer.
  const [drill, setDrill] = useState<DrillSelection | null>(null)
  const { profile } = useProfile()
  const { categories } = useCategories()
  const { accounts } = useAccounts()
  const { openDrawer, closeDrawer, open: drawerOpen } = useDrawer()

  // When the drawer closes externally (backdrop click, Escape, >> button),
  // clear the drill selection so the chart item is deselected.
  useEffect(() => {
    if (!drawerOpen && drill) {
      setDrill(null)
    }
  }, [drawerOpen, drill])

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
    setDrill(null)
    closeDrawer()
  }

  const handlePeriodChange = (nextPeriod: string) => {
    setPeriod(nextPeriod)
    if (!trend.points.some((p) => p.period === nextPeriod)) setTrendAnchor(nextPeriod)
    setDrill(null)
    closeDrawer()
  }

  const handleSectionChange = (nextSection: string) => {
    setActiveSection(nextSection)
    setDrill(null)
    closeDrawer()
  }

  const currencyCode = profile?.homeCurrencyCode ?? 'USD'

  const periodLabel = formatPeriod(mode, period)
  const currentRange = periodRange(mode, period)
  // Recurring payments are detected over the period's last month and the 3 before it.
  const recurringEndMonth = mode === 'monthly' ? period : `${period}-12`
  const recurringRange = { from: periodRange('monthly', shiftPeriod('monthly', recurringEndMonth, -3)).from, to: periodRange('monthly', recurringEndMonth).to }

  // Clicking the selected item again closes the drawer.
  // InsightDrillPanel fetches its own transactions — no stale snapshot problem.
  const toggleDrill = (selection: DrillSelection) => {
    if (drill && drill.cardId === selection.cardId && drill.itemKey === selection.itemKey) {
      setDrill(null)
      closeDrawer()
    } else {
      setDrill(selection)
      openDrawer(
        <InsightDrillPanel
          range={selection.range}
          match={selection.match}
          categories={categories}
          accounts={accounts}
          currencyCode={currencyCode}
        />,
        selection.title,
      )
    }
  }

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

  const selectedIn = (cardId: string) => (drill?.cardId === cardId ? drill.itemKey : null)

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
            onSelectPeriod={handlePeriodChange}
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
          onChange={handleSectionChange}
        />
      </div>

      {(activeSection === 'expense' || activeSection === 'income') && (() => {
        const kind = activeSection
        const byCategory = kind === 'expense' ? expenseByCategory : incomeByCategory
        const heatmap = kind === 'expense' ? expenseHeatmap : incomeHeatmap
        return (
          <section style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Card style={{ padding: 'var(--space-4)' }}>
                <CategoryBarChart
                  title="By Category"
                  points={byCategory.points}
                  kind={kind}
                  currencyCode={currencyCode}
                  selectedKey={selectedIn('category')}
                  onSelect={(key) => {
                    const point = byCategory.points.find((p) => categoryKey(p.categoryId) === key)
                    toggleDrill({ cardId: 'category', itemKey: key, title: `${point?.categoryName ?? 'Uncategorized'} · ${periodLabel}`, range: currentRange, match: (row) => rowKind(row) === kind && categoryKey(row.categoryId) === key })
                  }}
                />
              </Card>
              <Card style={{ padding: 'var(--space-4)' }}>
                {mode === 'yearly' ? (
                  <MonthlyBarChart
                    title="By Month"
                    days={heatmap.days}
                    kind={kind}
                    currencyCode={currencyCode}
                    selectedKey={selectedIn('calendar')}
                    onSelect={(monthKey) =>
                      toggleDrill({ cardId: 'calendar', itemKey: monthKey, title: formatPeriod('monthly', monthKey), range: currentRange, match: (row) => rowKind(row) === kind && row.date.startsWith(monthKey) })
                    }
                  />
                ) : (
                  <CalendarHeatmap
                    title="By Date"
                    days={heatmap.days}
                    kind={kind}
                    currencyCode={currencyCode}
                    period={period}
                    mode={mode}
                    selectedKey={selectedIn('calendar')}
                    onSelect={(date) =>
                      toggleDrill({ cardId: 'calendar', itemKey: date, title: format(parseISO(date), 'EEEE, MMMM d'), range: currentRange, match: (row) => rowKind(row) === kind && row.date === date })
                    }
                  />
                )}
              </Card>
              <CategoryChangesCard
                changes={importantThings.categoryChanges}
                filterKind={kind}
                title="Changes"
                selectedKey={selectedIn('changes')}
                onSelect={(key) => {
                  const change = importantThings.categoryChanges.find((c) => c.kind === kind && categoryKey(c.categoryId) === key)
                  toggleDrill({ cardId: 'changes', itemKey: key, title: `${change?.categoryName ?? 'Uncategorized'} · ${periodLabel}`, range: currentRange, match: (row) => rowKind(row) === kind && categoryKey(row.categoryId) === key })
                }}
              />
              {kind === 'expense' ? (
                <TopExpensesCard
                  expenses={importantThings.topExpenses}
                  selectedKey={selectedIn('top')}
                  onSelect={(description) =>
                    toggleDrill({ cardId: 'top', itemKey: description, title: `${description} · ${periodLabel}`, range: currentRange, match: (row) => rowKind(row) === kind && row.description === description })
                  }
                />
              ) : (
                <TopIncomeCard
                  income={importantThings.topIncome}
                  selectedKey={selectedIn('top')}
                  onSelect={(description) =>
                    toggleDrill({ cardId: 'top', itemKey: description, title: `${description} · ${periodLabel}`, range: currentRange, match: (row) => rowKind(row) === kind && row.description === description })
                  }
                />
              )}
              {kind === 'expense' && (
                <RecurringPaymentsCard
                  payments={importantThings.recurringPayments}
                  selectedKey={selectedIn('recurring')}
                  onSelect={(description) =>
                    toggleDrill({ cardId: 'recurring', itemKey: description, title: `${description} · last 4 months`, range: recurringRange, match: (row) => rowKind(row) === 'expense' && row.description === description })
                  }
                />
              )}
            </div>
          </section>
        )
      })()}
    </main>
  )
}
