import { useRef, useState, type KeyboardEvent } from 'react'
import { useDropdown } from '../hooks/useDropdown'
import { useFloatingPanel } from '../hooks/useFloatingPanel'

interface SuggestInputProps {
  value: string
  onChange: (value: string) => void
  /** Values to offer as the user types; anything else can still be typed. */
  suggestions: string[]
  placeholder?: string
  'aria-label'?: string
}

/** A text field with our own suggestion list underneath (in place of the browser's datalist). */
export function SuggestInput({ value, onChange, suggestions, placeholder, 'aria-label': ariaLabel }: SuggestInputProps) {
  const { open, setOpen, rootRef, panelRef } = useDropdown()
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const query = value.trim().toLowerCase()
  const matches = suggestions.filter((s) => s.toLowerCase().includes(query) && s !== value)
  const showPanel = open && matches.length > 0
  const { style } = useFloatingPanel(showPanel, inputRef, panelRef)

  function choose(next: string) {
    onChange(next)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (matches.length === 0 ? -1 : (i + step + matches.length) % matches.length))
    } else if (event.key === 'Enter' && showPanel && activeIndex >= 0) {
      event.preventDefault()
      choose(matches[activeIndex])
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="field-select" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        style={{ width: '100%' }}
      />
      {showPanel && (
        <div ref={panelRef} className="dropdown-panel field-select-panel" role="listbox" style={style}>
          {matches.map((match, index) => (
            <button
              key={match}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              className={`dropdown-item dropdown-option${index === activeIndex ? ' is-active' : ''}`}
              // mousedown keeps focus in the input, so the list doesn't close before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(match)}
            >
              {match}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
