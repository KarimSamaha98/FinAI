import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useDropdown } from '../hooks/useDropdown'
import { useFloatingPanel } from '../hooks/useFloatingPanel'

export interface FieldSelectOption<T extends string> {
  value: T
  label: string
  /** Optional leading glyph (e.g. a category icon). */
  icon?: ReactNode
}

interface FieldSelectProps<T extends string> {
  /** '' when nothing is chosen yet (the placeholder shows). */
  value: T | ''
  options: FieldSelectOption<T>[]
  onChange: (value: T) => void
  /** Shown when nothing is chosen. */
  placeholder?: string
  /** Adds a filter box at the top of the list. Defaults on for long lists (countries, currencies). */
  searchable?: boolean
  /** Blocks form submit while empty, like a native required select. */
  required?: boolean
  disabled?: boolean
  'aria-label'?: string
  /** 'auth' is the pill style of the sign-up page. */
  variant?: 'default' | 'auth'
}

const SEARCH_THRESHOLD = 10

/**
 * The form-field dropdown: looks like the app's inputs, opens our own option
 * list (never the browser's), and works from the keyboard — arrows/Home/End
 * move, Enter/Space pick, typing jumps to a match (or filters, when
 * searchable), Escape closes.
 */
export function FieldSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  searchable = options.length > SEARCH_THRESHOLD,
  required = false,
  disabled = false,
  'aria-label': ariaLabel,
  variant = 'default',
}: FieldSelectProps<T>) {
  const { open, setOpen, close, rootRef, triggerRef, panelRef } = useDropdown()
  const { style } = useFloatingPanel(open, triggerRef, panelRef)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const normalizedQuery = query.trim().toLowerCase()
  const visible = normalizedQuery ? options.filter((o) => o.label.toLowerCase().includes(normalizedQuery)) : options
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    if (searchable) {
      searchRef.current?.focus()
    } else {
      const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
      optionRefs.current[selectedIndex]?.focus()
      optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(next: T) {
    onChange(next)
    close()
  }

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(visible.length - 1, index))
    optionRefs.current[clamped]?.focus()
  }

  function handleListKey(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (index === 0 && searchable) searchRef.current?.focus()
      else focusOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(visible.length - 1)
    } else if (event.key === 'Tab') {
      close()
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (searchable) {
        // Typing in the list goes to the filter box.
        searchRef.current?.focus()
        return
      }
      const key = event.key.toLowerCase()
      const after = [...visible.slice(index + 1), ...visible.slice(0, index + 1)]
      const match = after.find((o) => o.label.toLowerCase().startsWith(key))
      if (match) focusOption(visible.indexOf(match))
    }
  }

  return (
    <div className={`field-select${variant === 'auth' ? ' field-select--auth' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`field-select-trigger${current ? '' : ' is-empty'}`}
        // Select-only combobox (ARIA APG): named by its <label> or aria-label, its text is the value.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
            e.preventDefault()
            setQuery('')
            setOpen(true)
          }
        }}
      >
        {current?.icon && (
          <span className="option-icon" aria-hidden="true">
            {current.icon}
          </span>
        )}
        <span className="field-select-value">{current?.label ?? placeholder}</span>
        {variant === 'auth' ? (
          <img src="/dropdown-arrow.svg" alt="" aria-hidden="true" className="field-select-auth-arrow" />
        ) : (
          <span className="field-select-chevron" aria-hidden="true">
            ▾
          </span>
        )}
      </button>
      {required && (
        // Lets the browser's own required check (and its message) cover this field.
        <input className="field-select-validity" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} />
      )}
      {open && (
        <div
          ref={panelRef}
          className="dropdown-panel field-select-panel"
          style={style}
          // Inside a <label>, a click on the panel's padding would re-click the trigger and close it.
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('button, input')) e.preventDefault()
          }}
        >
          {searchable && (
            <input
              ref={searchRef}
              type="text"
              className="field-select-search"
              placeholder="Search…"
              aria-label="Search options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusOption(0)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (visible[0]) pick(visible[0].value)
                } else if (e.key === 'Tab') {
                  close()
                }
              }}
            />
          )}
          <div role="listbox" aria-label={ariaLabel}>
            {visible.length === 0 && <p className="field-select-empty">No matches</p>}
            {visible.map((option, index) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  className={`dropdown-item dropdown-option${selected ? ' is-selected' : ''}`}
                  onClick={() => pick(option.value)}
                  onKeyDown={(e) => handleListKey(e, index)}
                >
                  <span className="dropdown-option-check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  {option.icon && (
                    <span className="option-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                  )}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
