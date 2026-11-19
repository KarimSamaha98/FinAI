import type { FormEvent, ReactNode } from 'react'
import { Button } from './Button'
import { useWizardModal } from './wizardModalContext'

interface FooterAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface WizardFooterProps {
  /**
   * Left-hand action. Omitted: "Cancel", which closes the wizard (asking first
   * if there's progress). `null`: nothing — e.g. after the account is created.
   */
  back?: FooterAction | null
  /** An extra action beside the primary one (e.g. "+ New account", "Done"). */
  secondary?: FooterAction
  /**
   * The step's main action. It's a submit button: inside a WizardStep with
   * `onSubmit` (or a form named by `form`), Enter in any field triggers it too.
   */
  primary?: {
    label: string
    disabled?: boolean
    loading?: boolean
    /** id of a form outside the footer that this button submits. */
    form?: string
    /** For a primary that isn't a form submit. */
    onClick?: () => void
  }
}

/** The standard action row at the bottom of every wizard step: back/cancel left, main action right. */
export function WizardFooter({ back, secondary, primary }: WizardFooterProps) {
  const { requestClose } = useWizardModal()
  const left = back === undefined ? { label: 'Cancel', onClick: requestClose } : back

  return (
    <div className="wizard-footer">
      <div className="wizard-footer-start">
        {left && (
          <Button variant="secondary" onClick={left.onClick} disabled={left.disabled}>
            {left.label}
          </Button>
        )}
      </div>
      <div className="wizard-footer-end">
        {secondary && (
          <Button variant="secondary" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </Button>
        )}
        {primary && (
          <Button
            variant="primary"
            type={primary.onClick ? 'button' : 'submit'}
            form={primary.form}
            onClick={primary.onClick}
            disabled={primary.disabled}
            loading={primary.loading}
          >
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  )
}

interface WizardStepProps {
  /** The primary action; Enter in a field runs it too (unless the primary is disabled). */
  onSubmit?: () => void
  footer: WizardFooterProps
  children: ReactNode
}

/**
 * One step's content plus its footer. With `onSubmit` the step is a form, so
 * the footer's primary button and Enter both advance.
 */
export function WizardStep({ onSubmit, footer, children }: WizardStepProps) {
  if (!onSubmit) {
    return (
      <div className="wizard-step">
        <div className="wizard-step-content">{children}</div>
        <WizardFooter {...footer} />
      </div>
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (footer.primary?.disabled || footer.primary?.loading) return
    onSubmit?.()
  }

  return (
    <form className="wizard-step" onSubmit={handleSubmit}>
      <div className="wizard-step-content">{children}</div>
      <WizardFooter {...footer} />
    </form>
  )
}
