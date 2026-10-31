import type { CategoryChange } from 'shared-types'
import type { StatTileItem } from './StatGrid'

const MIN_CHANGE_PERCENT = 10
const MAX_TILES = 4

/**
 * The period's most significant category changes (income and expense) as
 * stat tiles: at least ±10%, largest first, at most four. Red marks a change
 * for the worse (spending up, income down); green a change for the better.
 */
export function significantChangeTiles(changes: CategoryChange[]): StatTileItem[] {
  return changes
    .filter((c) => Math.abs(c.percentChange) >= MIN_CHANGE_PERCENT)
    .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
    .slice(0, MAX_TILES)
    .map((change) => ({
      key: `${change.categoryId ?? 'uncategorized'}-${change.type}`,
      label: change.categoryName,
      value: `${change.percentChange > 0 ? '+' : ''}${change.percentChange.toFixed(0)}%`,
      color: change.type === 'expense_spike' || change.type === 'income_reduction' ? 'var(--danger)' : 'var(--amount-positive)',
    }))
}
