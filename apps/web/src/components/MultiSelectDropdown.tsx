import { useEffect, useRef, useState } from 'react'

export interface MultiSelectOption {
  id: string
  label: string
  icon?: string
}

interface MultiSelectDropdownProps {
  label: string
  options: MultiSelectOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

function triggerLabel(label: string, options: MultiSelectOption[], selectedIds: string[]): string {
  if (selectedIds.length === 0) return `${label}: All`
  if (selectedIds.length === 1) {
    const match = options.find((o) => o.id === selectedIds[0])
    return `${label}: ${match?.label ?? '1 selected'}`
  }
  return `${label}: ${selectedIds.length} selected`
}

/** A closed-by-default dropdown for choosing zero or more options — used for category/account filters instead of a sprawling inline checkbox list. */
export function MultiSelectDropdown({ label, options, selectedIds, onChange }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="dropdown-trigger" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {triggerLabel(label, options, selectedIds)}
        <span className="dropdown-trigger-chevron">▾</span>
      </button>
      {open && (
        <div className="dropdown-panel">
          {options.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.4rem 0.5rem', margin: 0 }}>Nothing to choose from yet.</p>
          )}
          {options.map((option) => (
            <label key={option.id} className="dropdown-item">
              <input type="checkbox" checked={selectedIds.includes(option.id)} onChange={() => toggle(option.id)} />
              {option.icon && <span aria-hidden="true">{option.icon}</span>}
              {option.label}
            </label>
          ))}
          {options.length > 0 && (
            <div className="dropdown-footer">
              <button type="button" onClick={() => onChange([])}>
                Clear
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
