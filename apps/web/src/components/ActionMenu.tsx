import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

export interface ActionMenuItem {
  label: string
  /** One line saying what the action does. */
  detail?: string
  icon?: ReactNode
  onClick: () => void
  variant?: 'default' | 'danger'
  /** Ask before running (destructive actions): the menu turns into this confirmation. */
  confirm?: { title: string; message: string; confirmLabel: string }
}

interface ActionMenuProps {
  open: boolean
  onClose: () => void
  title: string
  /** A summary line under the title: details on the left (e.g. date · account), a value on the right (e.g. the amount). */
  summary?: { detail: string; value: string; tone?: 'positive' | 'negative' }
  actions: ActionMenuItem[]
}

/**
 * A compact action sheet, opened by clicking a transaction row: each action is
 * a card with an icon and a one-line description (the same cards as the wizard
 * choosers). Destructive actions confirm in place before running.
 */
export function ActionMenu({ open, onClose, title, summary, actions }: ActionMenuProps) {
  const [confirming, setConfirming] = useState<ActionMenuItem | null>(null)

  function run(action: ActionMenuItem) {
    onClose()
    action.onClick()
  }

  if (confirming?.confirm) {
    return (
      <Modal open={open} onClose={onClose} title={confirming.confirm.title} size="sm">
        <p className="action-menu-subtitle">{confirming.confirm.message}</p>
        <div className="action-menu-confirm">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => run(confirming)} autoFocus>
            {confirming.confirm.confirmLabel}
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {summary && (
        <div className="action-menu-summary">
          <span className="action-menu-summary-detail">{summary.detail}</span>
          <span className={`mono action-menu-summary-value${summary.tone ? ` is-${summary.tone}` : ''}`}>{summary.value}</span>
        </div>
      )}
      <div className="action-menu-list">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`wizard-choice has-icon action-choice${action.variant === 'danger' ? ' is-danger' : ''}`}
            onClick={() => (action.confirm ? setConfirming(action) : run(action))}
          >
            {action.icon && (
              <span className="wizard-choice-icon" aria-hidden="true">
                {action.icon}
              </span>
            )}
            <span className="wizard-choice-text">
              <span className="wizard-choice-title">{action.label}</span>
              {action.detail && <span className="wizard-choice-detail">{action.detail}</span>}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
