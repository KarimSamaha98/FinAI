import type { ReactNode } from 'react'
import { CheckIcon, InfoIcon } from './icons'
import { WizardStep } from './WizardFooter'

interface ResultAction {
  label: string
  onClick: () => void
}

interface WizardResultProps {
  /** success: finished; warning: finished with something to know. */
  tone?: 'success' | 'warning'
  title: string
  message: ReactNode
  /** Closes the wizard. Labelled "Done" unless there's no next action, where it's the primary. */
  onDone: () => void
  /** The natural next thing (starts another wizard). */
  next?: ResultAction
}

/** The last screen of every setup wizard: a centred badge, what happened, then Done and an optional next step. */
export function WizardResult({ tone = 'success', title, message, onDone, next }: WizardResultProps) {
  return (
    <WizardStep
      footer={{
        back: null,
        secondary: next ? { label: 'Done', onClick: onDone } : undefined,
        primary: next ? { label: next.label, onClick: next.onClick } : { label: 'Done', onClick: onDone },
      }}
    >
      <section className={`wizard-done is-${tone}`}>
        <span className="wizard-done-badge" aria-hidden="true">
          {tone === 'success' ? <CheckIcon /> : <InfoIcon />}
        </span>
        <h2>{title}</h2>
        <div className="wizard-hint">{message}</div>
      </section>
    </WizardStep>
  )
}
