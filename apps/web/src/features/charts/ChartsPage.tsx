import { useState } from 'react'
import type { TransactionView } from 'shared-types'
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker'
import { type DateRange } from '../../components/DateRangePicker'
import { getPresetRange } from '../../lib/dateRangePresets'
import { CategoryMultiSelect } from '../../components/CategoryMultiSelect'
import { Alert } from '../../components/Alert'
import { Card } from '../../components/Card'
import { useCategories } from '../../hooks/useCategories'
import { useProfile } from '../../hooks/useProfile'
import { useCategoryBreakdown } from '../../hooks/useCategoryBreakdown'
import { useTimeseries } from '../../hooks/useTimeseries'
import { useDashboardSummary } from '../../hooks/useDashboardSummary'
import { CategoryPieChart } from './CategoryPieChart'
import { TimeseriesChart } from './TimeseriesChart'
import { DashboardMetrics } from './DashboardMetrics'
import { ExcludedCurrenciesWarning } from './ExcludedCurrenciesWarning'

export function ChartsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('current-month'))
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [view, setView] = useState<TransactionView>('real')
  const { categories } = useCategories()
  const { profile } = useProfile()

  const expenseByCategory = useCategoryBreakdown(dateRange, categoryIds, view, 'expense')
  const incomeByCategory = useCategoryBreakdown(dateRange, categoryIds, view, 'income')
  const expenseTimeseries = useTimeseries(dateRange, categoryIds, view, 'expense')
  const incomeTimeseries = useTimeseries(dateRange, categoryIds, view, 'income')
  const summary = useDashboardSummary(dateRange, categoryIds, view)

  const loading =
    expenseByCategory.loading || incomeByCategory.loading || expenseTimeseries.loading || incomeTimeseries.loading || summary.loading
  const error = expenseByCategory.error ?? incomeByCategory.error ?? expenseTimeseries.error ?? incomeTimeseries.error ?? summary.error

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <h1>Insights</h1>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <DateRangePresetPicker value={dateRange} onChange={setDateRange} />
        <CategoryMultiSelect categories={categories} selectedIds={categoryIds} onChange={setCategoryIds} />
        <label>
          View
          <select value={view} onChange={(e) => setView(e.target.value as TransactionView)}>
            <option value="real">Real</option>
            <option value="nominal">Nominal</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <Alert variant="error">{error}</Alert>}

      <ExcludedCurrenciesWarning excludedCurrencies={summary.excludedCurrencies} />

      <DashboardMetrics
        totalExpense={summary.totalExpense}
        totalIncome={summary.totalIncome}
        netIncome={summary.netIncome}
        savingsRate={summary.savingsRate}
        currencyCode={profile?.homeCurrencyCode ?? 'USD'}
      />

      <h2 style={{ fontSize: '1.1rem', marginTop: 'var(--space-5)' }}>Income</h2>
      <Card style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <CategoryPieChart
          title="Income by category"
          points={incomeByCategory.points}
          categories={categories}
          currencyCode={profile?.homeCurrencyCode ?? 'USD'}
        />
        <TimeseriesChart
          title="Income over time"
          seriesName="Income"
          kind="income"
          granularity={incomeTimeseries.granularity}
          points={incomeTimeseries.points}
          currencyCode={profile?.homeCurrencyCode ?? 'USD'}
        />
      </Card>

      <h2 style={{ fontSize: '1.1rem', marginTop: 'var(--space-5)' }}>Expense</h2>
      <Card style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <CategoryPieChart
          title="Expenses by category"
          points={expenseByCategory.points}
          categories={categories}
          currencyCode={profile?.homeCurrencyCode ?? 'USD'}
        />
        <TimeseriesChart
          title="Expenses over time"
          seriesName="Expenses"
          kind="expense"
          granularity={expenseTimeseries.granularity}
          points={expenseTimeseries.points}
          currencyCode={profile?.homeCurrencyCode ?? 'USD'}
        />
      </Card>
    </main>
  )
}
