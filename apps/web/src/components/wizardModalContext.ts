import { createContext, useContext } from 'react'

interface WizardModalContextValue {
  /** Close the wizard, asking first when there's unsaved progress. */
  requestClose: () => void
}

export const WizardModalContext = createContext<WizardModalContextValue>({ requestClose: () => {} })

/** For content inside a WizardModal (e.g. the footer's Cancel). */
export function useWizardModal() {
  return useContext(WizardModalContext)
}
