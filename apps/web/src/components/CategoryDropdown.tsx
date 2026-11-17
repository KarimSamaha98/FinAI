import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Category } from 'shared-types'
import { useDropdown } from '../hooks/useDropdown'
import { CategoryIcon } from './categoryIcons'

interface CategoryDropdownProps {
  categories: Category[]
  /** null = Uncategorized. */
  value: string | null
  onChange: (id: string | null) => void
  'aria-label'?: string
}

interface CategoryOption {
  /** '' = Uncategorized. */
  value: string
  label: string
  icon: Category['icon'] | null
}

/**
 * Single-choice category picker in the Transactions view's filter-bar style:
 * a gray capsule trigger opening the glass popover, with an icon per option.
 * Picking closes the panel; arrows move, Enter/Space picks, Escape closes.
 */
export function CategoryDropdown({ categories, value, onChange, 'aria-label': ariaLabel }: CategoryDropdownProps) {
  const { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef } = useDropdown()
  const options: CategoryOption[] = [
    { value: '', label: 'Uncategorized', icon: null },
    ...categories.map((category) => ({ value: category.id, label: category.name, icon: category.icon })),
  ]
  const selectedValue = value ?? ''
  const current = options.find((option) => option.value === selectedValue) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue))
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

  function pick(next: string) {
    onChange(next || null)
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

  return (
    <div className="dropdown category-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="option-icon" aria-hidden="true">
          <CategoryIcon name={current.icon} />
        </span>
        <span className="category-dropdown-label">{current.label}</span>
        <span className="dropdown-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={panelRef}
          className={`dropdown-panel${alignEnd ? ' is-align-end' : ''}`}
          role="listbox"
          aria-label={ariaLabel ?? 'Category'}
          onKeyDown={handleKey}
        >
          {options.map((option, index) => {
            const selected = option.value === selectedValue
            return (
              <button
                key={option.value || 'uncategorized'}
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
                <span className="option-icon" aria-hidden="true">
                  <CategoryIcon name={option.icon} />
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
