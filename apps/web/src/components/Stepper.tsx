export interface WizardStepDef {
  key: string
  label: string
}

interface StepperProps {
  steps: WizardStepDef[]
  currentStep: string
}

/**
 * Wizard progress, the same for every wizard whatever its length:
 * "Step 3 of 8 · Date" over a bar with one segment per step.
 */
export function Stepper({ steps, currentStep }: StepperProps) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.key === currentStep))
  const current = steps[currentIndex]

  return (
    <nav className="stepper" aria-label="Setup progress">
      <p className="stepper-caption">
        Step {currentIndex + 1} of {steps.length}
        {current && (
          <>
            {' · '}
            <strong>{current.label}</strong>
          </>
        )}
      </p>
      <ol className="stepper-segments">
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
          return (
            <li key={step.key} className={`stepper-segment is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="visually-hidden">
                {step.label}
                {state === 'done' ? ' (done)' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
