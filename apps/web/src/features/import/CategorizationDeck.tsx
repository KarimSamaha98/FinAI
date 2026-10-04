import { useState } from 'react'
import type { Category, CandidateRow } from 'shared-types'
import { CategorySelect } from '../../components/CategorySelect'
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
  const [categorized, setCategorized] = useState<CategorizedRow[]>([])
  const [showMore, setShowMore] = useState(false)
  const topCategories = useTopCategories(categories, TOP_CATEGORY_COUNT)

  const currentRow = rows[cursor]

  function choose(categoryId: string | null) {
    const next = [...categorized, { rowIndex: currentRow.rowIndex, categoryId }]
    if (cursor + 1 >= rows.length) {
      onDone(next)
      return
    }
    setCategorized(next)
    setCursor(cursor + 1)
    setShowMore(false)
  }

  /** Import this row and every remaining one as Uncategorized, keeping any categories already chosen. */
  function skipRemaining() {
    onDone([...categorized, ...rows.slice(cursor).map((row) => ({ rowIndex: row.rowIndex, categoryId: null }))])
  }

  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Nothing to categorize — every row in this file was already in your transactions.</p>
  }

  const isIncome = currentRow.amount >= 0
  const remaining = rows.length - cursor

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
        {cursor + 1} of {rows.length}
      </p>
      <Card style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: '2rem', fontWeight: 700, color: isIncome ? 'var(--accent)' : 'var(--outflow)' }}>
          {formatCurrency(currentRow.amount, currentRow.currencyCode)}
        </div>
        <div style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>{formatDate(currentRow.date)}</div>
        <div style={{ marginTop: 'var(--space-1)' }}>{currentRow.description || 'Untitled'}</div>
      </Card>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center' }}>
        {topCategories.map((category) => (
          <Button key={category.id} variant="secondary" onClick={() => choose(category.id)}>
            {category.name}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => setShowMore(true)}>
          More…
        </Button>
        <Button variant="secondary" onClick={() => choose(null)}>
          Skip
        </Button>
      </div>

      {showMore && <CategorySelect categories={categories} value={null} onChange={(id) => id && choose(id)} />}

      <div style={{ textAlign: 'center' }}>
        <button type="button" className="text-button" onClick={skipRemaining}>
          {remaining === 1
            ? 'Skip categorization — import this transaction as Uncategorized'
            : `Skip categorization — import all ${remaining} remaining as Uncategorized`}
        </button>
      </div>
    </div>
  )
}
