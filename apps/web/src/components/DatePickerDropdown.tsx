import { format, parseISO } from 'date-fns'
import { useDropdown } from '../hooks/useDropdown'
import { CalendarPanel } from './CalendarPanel'

interface DatePickerDropdownProps {
  label: string
  /** yyyy-MM-dd, or undefined for "Any". */
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Earliest / latest pickable day (yyyy-MM-dd), e.g. "To" can't be before "From". */
  min?: string
  max?: string
}

/**
 * A date filter in the filter-bar dropdown style: the trigger reads
 * "From: Oct 1, 2026" (or "Any") and opens the month calendar.
 */
export function DatePickerDropdown({ label, value, onChange, min, max }: DatePickerDropdownProps) {
  const { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef } = useDropdown()

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}: {value ? format(parseISO(value), 'MMM d, yyyy') : 'Any'}
        <span className="dropdown-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <CalendarPanel
          panelRef={panelRef}
          className={alignEnd ? 'is-align-end' : undefined}
          label={label}
          value={value}
          min={min}
          max={max}
          onPick={(next) => {
            onChange(next)
            close()
          }}
        />
      )}
    </div>
  )
}
