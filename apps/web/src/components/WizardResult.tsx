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
  /** Closes the wizard: "Not now" beside a `next` action, otherwise the primary "Done". */
  onDone: () => void
  /** The natural next thing (starts another wizard): the primary action. */
  next?: ResultAction
  /** A lesser option beside a primary "Done" (e.g. try another file). Ignored with `next`. */
  alternative?: ResultAction
}

/**
 * The last screen of every setup wizard: a centred badge, what happened, then
 * either a next step (primary) with "Not now", or "Done" (primary) with an
 * optional lesser alternative. Never "Done" as a secondary: two ways to finish
 * read as the same thing.
 */
export function WizardResult({ tone = 'success', title, message, onDone, next, alternative }: WizardResultProps) {
  return (
    <WizardStep
      footer={{
        back: null,
        secondary: next ? { label: 'Not now', onClick: onDone } : alternative,
        primary: next ?? { label: 'Done', onClick: onDone },
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
