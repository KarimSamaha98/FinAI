import type { AmountKind, DisplayRow } from 'shared-types'

/** Expense vs income by the row's home-currency value, as the Insights aggregates count it. */
export function rowKind(row: DisplayRow): AmountKind {
  return (row.convertedValue ?? row.amount) < 0 ? 'expense' : 'income'
}

/** Drill-down key for a category; null (uncategorized) gets a fixed key. */
export function categoryKey(categoryId: string | null): string {
  return categoryId ?? 'uncategorized'
}
