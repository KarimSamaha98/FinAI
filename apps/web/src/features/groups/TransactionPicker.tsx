import { useState } from 'react'
import { SearchInput } from '../../components/SearchInput'
import { SkeletonBlock } from '../../components/Skeleton'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

export interface PickableTransaction {
  id: string
  date: string
  description: string
  amount: number
  /** What's not in a group yet, signed like amount. */
  available: number
  currencyCode: string
  accountName: string | null
  /** Shown with a "Likely match" chip. */
  likely?: boolean
}

interface TransactionPickerProps {
  items: PickableTransaction[]
  loading: boolean
  selectedId?: string | null
  onPick: (item: PickableTransaction) => void
  emptyText: string
}

/** Search the user's transactions and pick one. A transaction partly in another group shows what's left of it. */
export function TransactionPicker({ items, loading, selectedId = null, onPick, emptyText }: TransactionPickerProps) {
  const [query, setQuery] = useState('')
  const term = query.trim().toLowerCase()
  const visible = term ? items.filter((c) => c.description.toLowerCase().includes(term)) : items

  return (
    <>
      <SearchInput value={query} onChange={setQuery} aria-label="Search transactions" />
      {loading ? (
        <SkeletonBlock height="12rem" />
      ) : visible.length === 0 ? (
        <p className="wizard-hint">{emptyText}</p>
      ) : (
        <ul className="settle-candidates" role="listbox" aria-label="Transactions">
          {visible.slice(0, 100).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={selectedId === c.id}
                className={`settle-candidate${selectedId === c.id ? ' is-selected' : ''}`}
                onClick={() => onPick(c)}
              >
                <span className="settle-candidate-main">
                  <span className="settle-candidate-title">
                    {c.description || 'Untitled'}
                    {c.likely && <span className="likely-chip">Likely match</span>}
                  </span>
                  <span className="settle-candidate-sub">
                    {formatDate(c.date)}
                    {c.accountName && ` · ${c.accountName}`}
                    {c.available !== c.amount && ` · ${formatCurrency(Math.abs(c.available), c.currencyCode)} left`}
                  </span>
                </span>
                <span className="mono">{formatCurrency(c.amount, c.currencyCode)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
