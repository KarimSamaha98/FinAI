import { useState } from 'react'
import type { Category, CandidateRow } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { useTopCategories } from '../../hooks/useTopCategories'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

const TOP_CATEGORY_COUNT = 6

export interface CategorizedRow {
  rowIndex: number
  /** null = import as Uncategorized (categorization skipped). */
  categoryId: string | null
}

interface CategorizationDeckProps {
  rows: CandidateRow[]
  categories: Category[]
  onDone: (categorized: CategorizedRow[]) => void
}

export function CategorizationDeck({ rows, categories, onDone }: CategorizationDeckProps) {
  const [cursor, setCursor] = useState(0)
  const [choices, setChoices] = useState<Record<number, string | null>>({})
  const topCategories = useTopCategories(categories, TOP_CATEGORY_COUNT)

  const currentRow = rows[cursor]
  // Every category is always shown: the user's most-used ones first, then the
  // rest alphabetically.
  const topIds = new Set(topCategories.map((c) => c.id))
  const restCategories = categories.filter((c) => !topIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  const allCategories = [...topCategories, ...restCategories]
  const selectedCategoryId = currentRow ? choices[currentRow.rowIndex] : undefined

  function finish(next: Record<number, string | null>) {
    onDone(rows.map((row) => ({ rowIndex: row.rowIndex, categoryId: next[row.rowIndex] ?? null })))
  }

  function choose(categoryId: string | null) {
    const next = { ...choices, [currentRow.rowIndex]: categoryId }
    setChoices(next)
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
    <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="text-button" onClick={goBack} disabled={cursor === 0}>
          ← Back
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Transaction {cursor + 1} of {rows.length}
        </span>
      </div>

      <Card style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: isIncome ? 'var(--accent)' : 'var(--outflow)' }}>
          {formatCurrency(currentRow.amount, currentRow.currencyCode)}
        </div>
        <div style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>{formatDate(currentRow.date)}</div>
        <div style={{ marginTop: 'var(--space-1)', overflowWrap: 'anywhere' }}>{currentRow.description || 'Untitled'}</div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          Categorize this transaction
        </h2>
        <div role="group" aria-label="Categories" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center' }}>
          {allCategories.map((category) => {
            const isSelected = category.id === selectedCategoryId
            return (
              <Button
                key={category.id}
                variant="secondary"
                className={isSelected ? 'chip-selected' : undefined}
                aria-label={isSelected ? `${category.name} (selected)` : undefined}
                onClick={() => choose(category.id)}
              >
                {category.name}
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
          {remaining > 1 && (
            <Button variant="secondary" style={{ flex: 1 }} onClick={skipRemaining}>
              Skip All
            </Button>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', margin: 0 }}>
          Skipped rows import as Uncategorized — you can recategorize them anytime.
        </p>
      </div>
    </div>
  )
}
