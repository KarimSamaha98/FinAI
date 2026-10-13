import type { CandidateRow, Category } from 'shared-types'
import { Button } from '../../components/Button'
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
  onConfirm: () => void
  committing: boolean
}

/**
 * The last step of an import: every row with the category it will be saved
 * with — picked in the deck, or filled in from an earlier transaction with
 * the same name ("Auto") — each still changeable before the import is approved.
 */
export function ImportReview({ rows, categories, choices, onChange, onConfirm, committing }: ImportReviewProps) {
  const autoCount = rows.filter((row) => row.suggestedCategoryId && choices[row.rowIndex] === row.suggestedCategoryId).length
  const uncategorizedCount = rows.filter((row) => !choices[row.rowIndex]).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="wizard-hint" style={{ margin: 0 }}>
        Check the categories below, change any that look wrong, then import.{' '}
        {autoCount > 0 && `${autoCount} ${autoCount === 1 ? 'was' : 'were'} filled in from earlier transactions with the same name. `}
        {uncategorizedCount > 0 && `${uncategorizedCount} will import as Uncategorized.`}
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
              <span className="mono import-review-amount" style={{ color: row.amount >= 0 ? 'var(--accent)' : 'var(--outflow)' }}>
                {formatCurrency(row.amount, row.currencyCode)}
              </span>
              <div className="import-review-category">
                <CategorySelect categories={categories} value={categoryId} onChange={(id) => onChange(row.rowIndex, id)} />
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

      <div className="wizard-nav" style={{ justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={onConfirm} disabled={committing}>
          {committing ? 'Importing…' : `Import ${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`}
        </Button>
      </div>
    </div>
  )
}
