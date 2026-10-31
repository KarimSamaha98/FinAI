import { type KeyboardEvent } from 'react'
import type { InsightMode } from 'shared-types'

interface ModeToggleProps {
  mode: InsightMode
  onChange: (mode: InsightMode) => void
}

const MODES: { value: InsightMode; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const handleKey = (e: KeyboardEvent) => {
    const idx = MODES.findIndex((m) => m.value === mode)
    if (e.key === 'ArrowRight' && idx < MODES.length - 1) {
      e.preventDefault()
      onChange(MODES[idx + 1].value)
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault()
      onChange(MODES[idx - 1].value)
    }
  }

  return (
    <div
      className="insight-mode-toggle"
      style={{
        display: 'inline-flex',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}
      role="tablist"
      onKeyDown={handleKey}
    >
      {MODES.map(({ value, label }) => {
        const active = value === mode
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(value)}
            style={{
              padding: '0.5rem 1.25rem',
              font: 'inherit',
              fontSize: '0.85rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-contrast)' : 'var(--text-muted)',
              transition: 'background var(--transition), color var(--transition)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
