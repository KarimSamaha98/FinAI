import { SelectDropdown } from './SelectDropdown'
import { ArrowDownIcon, ArrowUpIcon } from './icons'
import type { SortDirection, SortField } from '../lib/transactionSort'

interface SortControlProps {
  field: SortField
  direction: SortDirection
  onFieldChange: (field: SortField) => void
  onDirectionChange: (direction: SortDirection) => void
}

const FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'description', label: 'Description' },
  { value: 'account', label: 'Account' },
]

/** Field picker plus an asc/desc toggle, sized to match the other filter-bar controls. */
export function SortControl({ field, direction, onFieldChange, onDirectionChange }: SortControlProps) {
  const next: SortDirection = direction === 'asc' ? 'desc' : 'asc'
  return (
    <div className="sort-control">
      <SelectDropdown<SortField> label="Sort" value={field} options={FIELD_OPTIONS} onChange={onFieldChange} />
      <button
        type="button"
        className="dropdown-trigger sort-direction-button"
        aria-label={`Sort ${direction === 'asc' ? 'ascending' : 'descending'}. Activate to sort ${next === 'asc' ? 'ascending' : 'descending'}.`}
        title={direction === 'asc' ? 'Ascending' : 'Descending'}
        onClick={() => onDirectionChange(next)}
      >
        {direction === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
      </button>
    </div>
  )
}
