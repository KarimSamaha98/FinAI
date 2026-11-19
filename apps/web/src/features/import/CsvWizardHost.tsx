import { useEffect, useRef, useState } from 'react'
import type { ImportProfile } from 'shared-types'
import { WizardModal } from '../../components/WizardModal'
import { useImportFlow, type ImportEntry } from './useImportFlow'
import { useProfileSetup, type ProfileSetupStart } from './useProfileSetup'

export type CsvWizardStart = ({ kind: 'profile' } & ProfileSetupStart) | { kind: 'import'; entry: ImportEntry }

interface CsvWizardHostProps {
  open: boolean
  onClose: () => void
  start: CsvWizardStart
  onImported: (accountId: string) => void
  onProfileSaved?: (profile: ImportProfile) => void
  /** Skip the entry animation when taking over from another wizard. */
  animateIn?: boolean
}

/**
 * Hosts the two CSV wizards in one dialog. They never nest: the only handoff
 * is the profile wizard's final "Import this file", which starts the import
 * wizard fresh (new title, its own progress bar) with that file.
 */
export function CsvWizardHost({ open, onClose, start, onImported, onProfileSaved, animateIn }: CsvWizardHostProps) {
  const [active, setActive] = useState<'profile' | 'import'>(start.kind)
  const importFlow = useImportFlow({ initialEntry: start.kind === 'import' ? start.entry : null, onImported })
  const profileSetup = useProfileSetup({
    initialStart: start.kind === 'profile' ? start : null,
    onDone: onClose,
    onSaved: onProfileSaved,
    onImportFile: (accountId, uploaded, profile) => {
      importFlow.start({ mode: 'file', accountId, uploaded, importProfileId: profile.id })
      setActive('import')
    },
  })

  // Start the requested wizard once, when mounted.
  const started = useRef(false)
  const startProfile = profileSetup.start
  const startImport = importFlow.start
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (start.kind === 'profile') startProfile(start)
    else startImport(start.entry)
  }, [start, startProfile, startImport])

  const view = active === 'profile' ? profileSetup.view : importFlow.view
  if (!view) return null

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title={view.title}
      subtitle={view.subtitle}
      steps={view.steps}
      currentStep={view.currentStep}
      // Both CSV wizards show wide content (file preview, import review).
      size="lg"
      dirty={view.dirty}
      animateIn={animateIn}
    >
      {view.body}
    </WizardModal>
  )
}
