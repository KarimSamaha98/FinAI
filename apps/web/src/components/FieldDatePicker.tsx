import { format, parseISO } from 'date-fns'
import { useDropdown } from '../hooks/useDropdown'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { CalendarPanel } from './CalendarPanel'

interface FieldDatePickerProps {
  /** yyyy-MM-dd, or '' when empty. */
  value: string
  onChange: (value: string) => void
  /** Blocks form submit while empty, and hides Clear. */
  required?: boolean
  disabled?: boolean
  placeholder?: string
  min?: string
  max?: string
  'aria-label'?: string
}

/** A form date field in the app's input style that opens our month calendar instead of the browser's date picker. */
export function FieldDatePicker({
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = 'Pick a date',
  min,
  max,
  'aria-label': ariaLabel,
}: FieldDatePickerProps) {
  const { open, setOpen, close, rootRef, triggerRef, panelRef } = useDropdown()
  const { style } = useFloatingPanel(open, triggerRef, panelRef, { minWidth: 272, capHeight: false })
  const display = value ? format(parseISO(value), 'MMM d, yyyy') : placeholder

  return (
    <div className="field-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`field-select-trigger${value ? '' : ' is-empty'}`}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="field-select-value">{display}</span>
        <span className="field-select-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {required && <input className="field-select-validity" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} />}
      {open && (
        <CalendarPanel
          panelRef={panelRef}
          style={style}
          label={ariaLabel ?? 'Choose'}
          value={value || undefined}
          min={min}
          max={max}
          clearable={!required}
          onPick={(next) => {
            onChange(next ?? '')
            close()
          }}
        />
      )}
    </div>
  )
}
