import { useState, type ReactNode } from 'react'
import type { AccountSummary, CreateImportProfileInput, ImportProfile } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { Alert } from '../../components/Alert'
import { WizardStep } from '../../components/WizardFooter'
import { WizardResult } from '../../components/WizardResult'
import type { WizardStepDef } from '../../components/WizardModal'
import { ProfileWizard } from './ProfileWizard'
import { PROFILE_QUESTION_LABELS } from './profileQuestions'
import { UploadDropzone } from './UploadDropzone'

export interface UploadedFile {
  uploadedFileId: string
  fileName: string
}

/** Just the file fields, so spreading a step object never carries its `name` along. */
export function fileOf(file: UploadedFile): UploadedFile {
  return { uploadedFileId: file.uploadedFileId, fileName: file.fileName }
}

/** What a hosting WizardModal needs to frame the current step of a CSV wizard. */
export interface CsvFlowView {
  title: string
  subtitle?: string
  steps: WizardStepDef[]
  currentStep: string
  /** False until the user has something to lose; true again never after the final save. */
  dirty: boolean
  body: ReactNode
}

export interface ProfileSetupStart {
  accountId: string
  /** Redo an existing profile: saving replaces it instead of creating one. */
  existingProfileId?: string | null
  /**
   * The account, when the host already has it: the first frame then shows its
   * name (title subtitle, heading) instead of filling it in once this wizard's
   * own fetch of the accounts lands, which made the header jump.
   */
  account?: AccountSummary | null
}

interface ProfileSetupOptions {
  /** Show this setup from the first render (start() still resets it). */
  initialStart?: ProfileSetupStart | null
  /** "Import this file" on the saved screen: start the import wizard with this file. */
  onImportFile: (accountId: string, uploaded: UploadedFile, profile: ImportProfile) => void
  /** "Done" on the saved screen. */
  onDone: () => void
  /** The profile was saved, whatever happens next. */
  onSaved?: (profile: ImportProfile) => void
}

type Step = { name: 'upload' } | ({ name: 'questions' } & UploadedFile) | ({ name: 'saved'; profile: ImportProfile } & UploadedFile)

const STEPS: WizardStepDef[] = [
  { key: 'upload', label: 'Sample file' },
  ...Object.entries(PROFILE_QUESTION_LABELS).map(([key, label]) => ({ key: `q-${key}`, label })),
  { key: 'saved', label: 'Saved' },
]

/**
 * "Set up CSV profile": teach an account how to read its CSV exports from one
 * sample: upload, six questions (each its own step), saved. It only creates
 * (or redoes) the profile; importing is the separate import wizard, offered
 * at the end since the file is at hand.
 */
export function useProfileSetup({ initialStart = null, onImportFile, onDone, onSaved }: ProfileSetupOptions) {
  const { accounts, refresh: refreshAccounts } = useAccounts()
  const { createProfile, updateProfile } = useImportProfiles()
  const [started, setStarted] = useState<ProfileSetupStart | null>(initialStart)
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const [questionIndex, setQuestionIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function start(next: ProfileSetupStart) {
    setStarted(next)
    setStep({ name: 'upload' })
    setQuestionIndex(0)
    setError(null)
    // The account may have just been created by another wizard.
    void refreshAccounts()
  }

  if (!started) return { start, view: null }

  const { accountId, existingProfileId } = started
  const account = accounts.find((a) => a.id === accountId) ?? started.account ?? null
  const accountName = account?.name ?? 'this account'

  async function handleFileSelected(file: File) {
    setError(null)
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      setQuestionIndex(0)
      setStep({ name: 'questions', uploadedFileId: uploaded.id, fileName: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  async function handleCreated(uploaded: UploadedFile, input: CreateImportProfileInput) {
    const profile = existingProfileId ? await updateProfile(existingProfileId, input) : await createProfile(input)
    onSaved?.(profile)
    setStep({ name: 'saved', profile, ...fileOf(uploaded) })
  }

  let body: ReactNode
  let currentStep: string
  switch (step.name) {
    case 'upload':
      currentStep = 'upload'
      body = (
        <WizardStep footer={{}}>
          <section className="wizard-question">
            <h2>Upload a sample CSV export of {accountName}</h2>
            <p className="wizard-hint">
              Any recent export works. A few quick questions about it teach Frugal AI how this account’s exports are laid out. Nothing is imported unless you
              choose to at the end.
            </p>
            <UploadDropzone uploading={uploading} onFile={handleFileSelected} />
          </section>
          {error && <Alert variant="error">{error}</Alert>}
        </WizardStep>
      )
      break

    case 'questions':
      currentStep = STEPS[questionIndex + 1].key
      body = (
        <ProfileWizard
          accountId={accountId}
          account={account}
          accountCurrency={account?.currencyCode ?? 'USD'}
          defaultName={`${account?.name ?? 'Account'} CSV`}
          uploadedFileId={step.uploadedFileId}
          stepIndex={questionIndex}
          onStepIndexChange={setQuestionIndex}
          onCreated={(input) => handleCreated(step, input)}
          onBack={() => setStep({ name: 'upload' })}
        />
      )
      break

    case 'saved':
      currentStep = 'saved'
      body = (
        <WizardResult
          title="Profile saved"
          message={`${accountName} can now read its CSV exports, and future imports skip these questions. Import the transactions in ${step.fileName} now?`}
          onDone={onDone}
          next={{ label: 'Import this file', onClick: () => onImportFile(accountId, fileOf(step), step.profile) }}
        />
      )
      break
  }

  const view: CsvFlowView = {
    title: existingProfileId ? 'Redo CSV profile' : 'Set up CSV profile',
    subtitle: [account?.name, step.name !== 'upload' ? step.fileName : null].filter(Boolean).join(' · ') || undefined,
    steps: STEPS,
    currentStep,
    // Nothing to lose before the questions, or once the profile is saved.
    dirty: step.name === 'questions',
    body,
  }
  return { start, view }
}
