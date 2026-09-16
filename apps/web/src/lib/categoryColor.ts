import type { Category } from 'shared-types'

const SERIES_COUNT = 8

/** Stable per-category color, reusing the validated 8-hue chart palette so a category's color matches between the ledger and Insights charts. */
export function categoryColor(categoryId: string | null, categories: Category[]): string | undefined {
  if (!categoryId) return undefined
  const index = categories.findIndex((c) => c.id === categoryId)
  if (index === -1) return undefined
  return `var(--series-${(index % SERIES_COUNT) + 1})`
}
