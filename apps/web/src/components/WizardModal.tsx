import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CloseIcon } from './icons'
import { Button } from './Button'
import { Stepper, type WizardStepDef } from './Stepper'
import { WizardModalContext } from './wizardModalContext'

export type { WizardStepDef } from './Stepper'
export type WizardSize = 'sm' | 'md' | 'lg'

interface WizardModalProps {
  open: boolean
  title: string
  subtitle?: string
  steps: WizardStepDef[]
  currentStep: string
  /** Identifies the screen when several share a stepper step (sub-steps); defaults to currentStep. */
  stepKey?: string
  /**
   * md for forms and questions; lg for wide content (CSV preview, import
   * review); sm for a compact chooser that isn't a multi-step wizard — it sizes
   * to its content instead of the fixed wizard frame.
   */
  size?: WizardSize
  /** Unsaved progress: closing asks "Discard this setup?" first. */
  dirty?: boolean
  onClose: () => void
  /** Skip the entry animation — when one wizard hands over to another, so it reads as one. */
  animateIn?: boolean
  children: ReactNode
}

/**
 * The shared shell for every setup flow (add transaction, add account, CSV
 * import): title, stepper, a scrolling body, and each step's sticky
 * WizardFooter. Steps own their state; the shell only frames them.
 */
export function WizardModal({ open, title, subtitle, steps, currentStep, stepKey, size = 'md', dirty = false, onClose, animateIn = true, children }: WizardModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pressedBackdrop = useRef(false)
  const [confirming, setConfirming] = useState(false)

  // Layout effect: when one wizard replaces another in the same commit, the
  // new dialog is shown before paint, so the backdrop never flickers.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const focusKey = stepKey ?? currentStep
  // Every step change: back to the top, focus the step's first field (or its heading).
  useEffect(() => {
    if (!open) return
    const body = bodyRef.current
    if (!body) return
    body.scrollTop = 0
    const target = body.querySelector<HTMLElement>('[data-autofocus]') ?? body.querySelector<HTMLElement>('h2')
    if (target) {
      if (target.tagName === 'H2' && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
      if (target instanceof HTMLInputElement) target.select()
    }
  }, [open, focusKey])

  function requestClose() {
    if (dirty) setConfirming(true)
    else onClose()
  }

  function handleMouseDown(event: MouseEvent<HTMLDialogElement>) {
    pressedBackdrop.current = event.target === event.currentTarget
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    // Only a click that starts and ends on the backdrop (not a drag out of a field) closes.
    if (event.target === event.currentTarget && pressedBackdrop.current) requestClose()
    pressedBackdrop.current = false
  }

  const showStepper = steps.length > 1

  return (
    <dialog
      ref={ref}
      className={`wizard-modal wizard-modal--${size}${animateIn ? '' : ' no-enter'}`}
      aria-labelledby="wizard-modal-title"
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClose={onClose}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <WizardModalContext.Provider value={{ requestClose }}>
        <header className="wizard-modal-header">
          <div className="wizard-modal-heading">
            <h1 id="wizard-modal-title" className="wizard-modal-title">
              {title}
            </h1>
            {subtitle && <p className="wizard-modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="sheet-close" onClick={requestClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {showStepper && <Stepper steps={steps} currentStep={currentStep} />}

        <div ref={bodyRef} className="wizard-modal-body">
          {children}
        </div>

        {/* A step that finishes the flow (dirty → false) also drops a pending prompt. */}
        {confirming && dirty && (
          <div className="wizard-discard" role="alertdialog" aria-labelledby="wizard-discard-title" aria-describedby="wizard-discard-detail">
            <div className="wizard-discard-text">
              <strong id="wizard-discard-title">Discard this setup?</strong>
              <span id="wizard-discard-detail">What you’ve entered so far won’t be saved.</span>
            </div>
            <div className="wizard-discard-actions">
              <Button variant="secondary" onClick={() => setConfirming(false)} autoFocus>
                Keep going
              </Button>
              <Button variant="danger" onClick={onClose}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </WizardModalContext.Provider>
    </dialog>
  )
}
