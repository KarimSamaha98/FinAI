import type { ReactNode } from 'react'

interface ChoiceCardProps {
  title: string
  detail?: string
  icon?: ReactNode
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}

/** A large selectable option for a wizard question ("Yes / No", "Import a CSV / Enter manually"). */
export function ChoiceCard({ title, detail, icon, selected, onSelect, disabled }: ChoiceCardProps) {
  return (
    <button
      type="button"
      className={`wizard-choice${selected ? ' is-selected' : ''}${icon ? ' has-icon' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon && (
        <span className="wizard-choice-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="wizard-choice-text">
        <span className="wizard-choice-title">{title}</span>
        {detail && <span className="wizard-choice-detail">{detail}</span>}
      </span>
    </button>
  )
}
