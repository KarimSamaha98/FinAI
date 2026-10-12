import { useDropdown } from '../hooks/useDropdown'

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
  const { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef } = useDropdown()

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  return (
    <div className="dropdown" ref={rootRef}>
      <button ref={triggerRef} type="button" className="dropdown-trigger" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {triggerLabel(label, options, selectedIds)}
        <span className="dropdown-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div ref={panelRef} className={`dropdown-panel${alignEnd ? ' is-align-end' : ''}`}>
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
              <button type="button" onClick={close}>
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
