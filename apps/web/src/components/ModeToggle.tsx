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
    >
      {MODES.map(({ value, label }) => {
        const active = value === mode
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
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
