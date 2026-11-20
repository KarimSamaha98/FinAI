import { useMemo, useRef } from 'react'
import type { CandidateRow, Category } from 'shared-types'
import { CategorySelect } from '../../components/CategorySelect'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { merchantKey, merchantName } from './merchantKey'

interface CategorizeListProps {
  /** The rows to categorize (the import passes the ones not filled in from earlier transactions). */
  rows: CandidateRow[]
  categories: Category[]
  /** rowIndex → chosen category (null = Uncategorized). */
  choices: Record<number, string | null>
  /** Sets one category on every row of a merchant. */
  onChange: (rowIndexes: number[], categoryId: string | null) => void
}

/** One line: a transaction, or every transaction from one merchant (shown as just the merchant). */
interface Item {
  key: string
  rows: CandidateRow[]
}

/**
 * The import's Categorize step on wide screens: the new transactions, repeat
 * merchants folded into one line so one choice covers them, each with a
 * category pill. Rows stay put once categorized (the list never reflows
 * under the pointer); picking one moves focus to the next still empty.
 * Everything is checked again on the Review step.
 */
export function CategorizeList({ rows, categories, choices, onChange }: CategorizeListProps) {
  const items = useMemo(() => groupByMerchant(rows), [rows])
  const listRef = useRef<HTMLUListElement>(null)

  const valueOf = (item: Item): string | null => {
    const values = new Set(item.rows.map((row) => choices[row.rowIndex] ?? null))
    return values.size === 1 ? [...values][0] : null
  }

  function setItem(item: Item, categoryId: string | null) {
    onChange(
      item.rows.map((row) => row.rowIndex),
      categoryId,
    )
    if (!categoryId) return
    const at = items.indexOf(item)
    const next = items.slice(at + 1).find((other) => !valueOf(other))
    if (!next) return
    // After the menu has closed (and handed focus back to its own pill). No
    // scroll jump: the next pill only scrolls into view if it's off screen.
    setTimeout(() => {
      const pill = listRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(next.key)}"] .field-select-trigger`)
      if (!pill) return
      pill.focus({ preventScroll: true })
      pill.scrollIntoView({ block: 'nearest' })
    })
  }

  return (
    <ul className="categorize-list" ref={listRef}>
      {items.map((item) => {
        const first = item.rows[0]
        const isGroup = item.rows.length > 1
        const total = item.rows.reduce((sum, row) => sum + row.amount, 0)
        // A merchant line names the merchant, not one of its stores.
        const name = (isGroup ? merchantName(first.description) : first.description) || 'Untitled'
        return (
          <li key={item.key} data-item={item.key} className="categorize-list-row">
            <div className="categorize-list-main">
              <span className="categorize-list-description">{name}</span>
              {!isGroup && <span className="categorize-list-meta">{formatDate(first.date)}</span>}
            </div>
            <div className="categorize-list-category">
              <CategorySelect categories={categories} value={valueOf(item)} variant="pill" aria-label={`Category for ${name}`} onChange={(id) => setItem(item, id)} />
            </div>
            <span className={`categorize-list-amount${total > 0 ? ' is-income' : ''}`}>{formatCurrency(total, first.currencyCode)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Rows grouped by merchant, in the file's order (a group sits where its first row was). */
function groupByMerchant(rows: CandidateRow[]): Item[] {
  const byKey = new Map<string, Item>()
  for (const row of rows) {
    const key = merchantKey(row.description)
    const item = byKey.get(key)
    if (item) item.rows.push(row)
    else byKey.set(key, { key, rows: [row] })
  }
  return [...byKey.values()]
}
