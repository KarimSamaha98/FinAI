import { Modal } from './Modal'
import { Button, type ButtonVariant } from './Button'

export interface ActionMenuItem {
  label: string
  onClick: () => void
  variant?: ButtonVariant
}

interface ActionMenuProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  actions: ActionMenuItem[]
}

/**
 * A small modal-based action sheet, triggered by clicking a transaction row —
 * lists context-appropriate actions (Split / Reconcile / Edit / Delete, or
 * "View group" / "Edit split" once one already applies). Built on the
 * existing Modal <dialog> wrapper rather than a new floating-menu system.
 */
export function ActionMenu({ open, onClose, title, subtitle, actions }: ActionMenuProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {subtitle && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? 'secondary'}
            onClick={() => {
              onClose()
              action.onClick()
            }}
            style={{ textAlign: 'left' }}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
