import { useState } from 'react'
import type { Category, CandidateRow } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { CategoryIcon } from '../../components/categoryIcons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

export interface CategorizedRow {
  rowIndex: number
  /** null = import as Uncategorized (categorization skipped). */
  categoryId: string | null
}

interface CategorizationDeckProps {
  rows: CandidateRow[]
  categories: Category[]
  onDone: (categorized: CategorizedRow[]) => void
  /** Called after every choice with the rows so far, so a parent can save them if the deck is closed early. */
  onProgress?: (categorized: CategorizedRow[]) => void
  /** Hide Skip All where closing the deck already does the same (default: shown). */
  showSkipAll?: boolean
  /** Note under the Skip buttons; defaults to the import wording. */
  skipHint?: string
}

export function CategorizationDeck({ rows, categories, onDone, onProgress, showSkipAll = true, skipHint }: CategorizationDeckProps) {
  const [cursor, setCursor] = useState(0)
  const [choices, setChoices] = useState<Record<number, string | null>>({})

  const currentRow = rows[cursor]
  // Every category is shown, in the order the user arranged them in Settings.
  const allCategories = categories
  const selectedCategoryId = currentRow ? choices[currentRow.rowIndex] : undefined

  function toCategorized(next: Record<number, string | null>): CategorizedRow[] {
    return rows.map((row) => ({ rowIndex: row.rowIndex, categoryId: next[row.rowIndex] ?? null }))
  }

  function finish(next: Record<number, string | null>) {
    onDone(toCategorized(next))
  }

  function choose(categoryId: string | null) {
    const next = { ...choices, [currentRow.rowIndex]: categoryId }
    setChoices(next)
    onProgress?.(toCategorized(next))
    if (cursor + 1 >= rows.length) {
      finish(next)
      return
    }
    setCursor(cursor + 1)
  }

  function goBack() {
    if (cursor > 0) setCursor(cursor - 1)
  }

  /** Import this row and every remaining one as Uncategorized, keeping choices already made for earlier rows. */
  function skipRemaining() {
    const next = { ...choices }
    for (const row of rows.slice(cursor)) next[row.rowIndex] = null
    finish(next)
  }

  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Nothing to categorize — every row in this file was already in your transactions.</p>
  }

  const isIncome = currentRow.amount >= 0
  const remaining = rows.length - cursor

  return (
    <div className="categorize-deck">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="text-button" onClick={goBack} disabled={cursor === 0}>
          ← Previous
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Transaction {cursor + 1} of {rows.length}
        </span>
      </div>

      <Card className="categorize-deck-txn">
        <div className="mono categorize-deck-amount" style={{ color: isIncome ? 'var(--amount-positive)' : 'var(--outflow)' }}>
          {formatCurrency(currentRow.amount, currentRow.currencyCode)}
        </div>
        <div className="categorize-deck-date">{formatDate(currentRow.date)}</div>
        <div className="categorize-deck-description">{currentRow.description || 'Untitled'}</div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2 className="categorize-deck-heading">Categorize this transaction</h2>
        <div role="group" aria-label="Categories" className="categorize-deck-options">
          {allCategories.map((category) => {
            const isSelected = category.id === selectedCategoryId
            return (
              <Button
                key={category.id}
                variant="secondary"
                className={`categorize-deck-option${isSelected ? ' chip-selected' : ''}`}
                aria-label={isSelected ? `${category.name} (selected)` : undefined}
                onClick={() => choose(category.id)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CategoryIcon name={category.icon} />
                  {category.name}
                </span>
              </Button>
            )
          })}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0, width: '100%' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="primary" style={{ flex: 1 }} onClick={() => choose(null)}>
            Skip
          </Button>
          {showSkipAll && remaining > 1 && (
            <Button variant="secondary" style={{ flex: 1 }} onClick={skipRemaining}>
              Skip All
            </Button>
          )}
        </div>
        <p className="categorize-deck-hint">
          {skipHint ?? 'Skipped rows import as Uncategorized — you can recategorize them anytime.'}
        </p>
      </div>
    </div>
  )
}
