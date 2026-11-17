import { format, parseISO } from 'date-fns'
import type { CandidateRow, Category } from 'shared-types'
import { Button } from '../../components/Button'
import { CategoryDropdown } from '../../components/CategoryDropdown'
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
 * Rows look like the ledger's transaction cards: a calendar date leaf, the
 * round category icon pill (click to change), and the colour-coded amount.
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
          const description = row.description || 'Untitled'
          return (
            <li key={row.rowIndex} className="import-review-row">
              {/* A small calendar leaf; the full date shows on hover. */}
              <span className="import-review-date has-tooltip has-tooltip--right" data-tooltip={formatDate(row.date)}>
                <span className="import-review-date-month">{format(parseISO(row.date), 'MMM')}</span>
                <span className="import-review-date-day">{format(parseISO(row.date), 'd')}</span>
              </span>

              <span className="import-review-main">
                <span className="import-review-description">{description}</span>
              </span>

              <span className="import-review-chips">
                <CategoryDropdown
                  categories={categories}
                  value={categoryId}
                  onChange={(id) => onChange(row.rowIndex, id)}
                  aria-label={`Category for ${description}`}
                />
                {isAuto && (
                  <span className="import-review-chip import-review-chip--auto" title="Filled in from an earlier transaction with the same name">
                    Auto
                  </span>
                )}
              </span>

              <span className={`import-review-amount${row.amount > 0 ? ' is-income' : ''}${row.amount === 0 ? ' is-zero' : ''}`}>
                {formatCurrency(row.amount, row.currencyCode)}
              </span>
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
