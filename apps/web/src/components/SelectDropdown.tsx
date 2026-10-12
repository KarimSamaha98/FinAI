import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useDropdown } from '../hooks/useDropdown'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface SelectDropdownProps<T extends string> {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
}

/**
 * Single-choice dropdown in the same style as MultiSelectDropdown — the
 * trigger reads "Label: Choice" and picking an option closes the panel.
 * Keyboard: arrows move, Enter/Space picks, Escape closes.
 */
export function SelectDropdown<T extends string>({ label, value, options, onChange }: SelectDropdownProps<T>) {
  const { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef } = useDropdown()
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex)
      optionRefs.current[selectedIndex]?.focus()
    }
    // Only when opening — moving the highlight shouldn't re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function pick(next: T) {
    onChange(next)
    close()
  }

  function handleKey(event: KeyboardEvent) {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (activeIndex + step + options.length) % options.length
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }

  const current = options.find((o) => o.value === value)

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {label}: {current?.label ?? '—'}
        <span className="dropdown-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div ref={panelRef} className={`dropdown-panel${alignEnd ? ' is-align-end' : ''}`} role="listbox" aria-label={label} onKeyDown={handleKey}>
          {options.map((option, index) => {
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
                tabIndex={index === activeIndex ? 0 : -1}
                className={`dropdown-item dropdown-option${selected ? ' is-selected' : ''}`}
                onClick={() => pick(option.value)}
              >
                <span className="dropdown-option-check" aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
