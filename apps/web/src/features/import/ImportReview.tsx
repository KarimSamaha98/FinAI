import type { CandidateRow, Category } from 'shared-types'
import { Badge } from '../../components/Badge'
import { CategorySelect } from '../../components/CategorySelect'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface ImportReviewProps {
  rows: CandidateRow[]
  categories: Category[]
  /** rowIndex → chosen category (null = Uncategorized). */
  choices: Record<number, string | null>
  onChange: (rowIndex: number, categoryId: string | null) => void
}

/**
 * The last step of an import: every row with the category it will be saved
 * with — picked in the deck, or filled in from an earlier transaction with
 * the same name ("Auto") — each still changeable before the import is approved.
 * The Import button lives in the wizard footer.
 */
export function ImportReview({ rows, categories, choices, onChange }: ImportReviewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="wizard-hint" style={{ margin: 0 }}>
        Check the categories below, change any that look wrong, then import.
      </p>

      <ul className="import-review-list">
        {rows.map((row) => {
          const categoryId = choices[row.rowIndex] ?? null
          const isAuto = !!row.suggestedCategoryId && categoryId === row.suggestedCategoryId
          return (
            <li key={row.rowIndex} className="import-review-row">
              <div className="import-review-main">
                <span className="import-review-description">{row.description || 'Untitled'}</span>
                <span className="import-review-date">{formatDate(row.date)}</span>
              </div>
              <span className="mono import-review-amount" style={{ color: row.amount >= 0 ? 'var(--amount-positive)' : 'var(--outflow)' }}>
                {formatCurrency(row.amount, row.currencyCode)}
              </span>
              <div className="import-review-category">
                <CategorySelect categories={categories} value={categoryId} variant="pill" aria-label={`Category for ${row.description}`} onChange={(id) => onChange(row.rowIndex, id)} />
                {isAuto ? (
                  <Badge variant="accent" title="Filled in from an earlier transaction with the same name">
                    Auto
                  </Badge>
                ) : (
                  <span />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
