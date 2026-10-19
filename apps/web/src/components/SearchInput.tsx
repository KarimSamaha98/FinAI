import { CloseIcon, SearchIcon } from './icons'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  'aria-label': string
}

/** Plain text field for filtering a list, with a leading magnifier and a clear button once it has a value. */
export function SearchInput({ value, onChange, 'aria-label': ariaLabel }: SearchInputProps) {
  return (
    <div className="search-input">
      <span className="search-input-icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="search-input-clear"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
