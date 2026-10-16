import type { DisplayRow } from 'shared-types'

export type SortField = 'date' | 'amount' | 'description' | 'account'
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_SORT_FIELD: SortField = 'date'
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc'

/** Case-insensitive substring match on the row's own description (what the user sees). */
export function filterRowsByDescription(rows: DisplayRow[], search: string): DisplayRow[] {
  const query = search.trim().toLowerCase()
  if (!query) return rows
  return rows.filter((row) => row.description.toLowerCase().includes(query))
}

/** Returns a sorted copy, leaving the input (and React state) untouched. */
export function sortDisplayRows(
  rows: DisplayRow[],
  field: SortField,
  direction: SortDirection,
  accountNameById: Map<string, string>,
): DisplayRow[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = compareByField(a, b, field, accountNameById)
    if (primary !== 0) return primary * factor
    // Stable, predictable tie-break: newest first.
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  })
}

function compareByField(
  a: DisplayRow,
  b: DisplayRow,
  field: SortField,
  accountNameById: Map<string, string>,
): number {
  switch (field) {
    case 'amount':
      // Absolute value so "High to low" surfaces the biggest transactions
      // regardless of direction (expenses vs income).
      return Math.abs(a.amount) - Math.abs(b.amount)
    case 'description':
      return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
    case 'account': {
      // A reconciliation net row can span accounts; its first (anchor) account
      // represents it — mirroring TransactionRow and the anchor-based filtering.
      const nameA = accountNameById.get(a.accountIds[0] ?? '') ?? ''
      const nameB = accountNameById.get(b.accountIds[0] ?? '') ?? ''
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    }
    case 'date':
    default:
      return a.date.localeCompare(b.date)
  }
}
