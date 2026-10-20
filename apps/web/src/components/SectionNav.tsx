interface SectionNavProps {
  sections: { id: string; label: string }[]
  activeId: string
  onChange: (id: string) => void
  sticky?: boolean
}

export function SectionNav({ sections, activeId, onChange, sticky = true }: SectionNavProps) {
  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--surface)',
        ...(sticky ? { position: 'sticky', top: 'var(--space-4)', zIndex: 10 } : {}),
      }}
    >
      {sections.map(({ id, label }) => {
        const active = id === activeId
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              padding: '0.45rem 1.25rem',
              font: 'inherit',
              fontSize: '0.85rem',
              fontWeight: active ? 600 : 400,
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
