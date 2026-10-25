import type { AmountKind, DisplayRow } from 'shared-types'

/** One clicked item on the Insights page, and which transactions make it up. */
export interface DrillSelection {
  /** Which card the panel opens beside. */
  cardId: string
  /** Which item inside that card is selected (for highlighting and toggling). */
  itemKey: string
  title: string
  range: { from: string; to: string }
  match: (row: DisplayRow) => boolean
}

/** Expense vs income by the row's home-currency value, as the Insights aggregates count it. */
export function rowKind(row: DisplayRow): AmountKind {
  return (row.convertedValue ?? row.amount) < 0 ? 'expense' : 'income'
}

/** Props every clickable Insights card takes. */
export interface DrillableProps {
  selectedKey?: string | null
  onSelect?: (itemKey: string) => void
}

/** Drill-down key for a category; null (uncategorized) gets a fixed key. */
export function categoryKey(categoryId: string | null): string {
  return categoryId ?? 'uncategorized'
}
