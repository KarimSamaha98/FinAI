import { useState } from 'react'
import type { CreateImportProfileInput, ParseWithProfileResult } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { useCategories } from '../../hooks/useCategories'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { useAccounts } from '../../hooks/useAccounts'
import { ProfileWizard } from './ProfileWizard'
import { UploadDropzone } from './UploadDropzone'
import { ChooseAccountStep } from './ChooseAccountStep'
import { CategorizationDeck, type CategorizedRow } from './CategorizationDeck'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'

/** A file that's already been uploaded (e.g. by the inline add panel). */
export interface ImportFlowInitial {
  uploadedFileId: string
  fileName: string
  /** Pre-selects the account question (e.g. the one card selected on the Transaction screen). */
  accountId?: string | null
}

interface ImportFlowProps {
  initial?: ImportFlowInitial | null
  /** Set up a profile for this account, skipping the account question. */
  setupAccountId?: string | null
  /** Called with the account once the rows are committed. */
  onDone: (accountId: string) => void
}

interface UploadedFile {
  uploadedFileId: string
  fileName: string
}

type Step =
  | { name: 'upload' }
  | ({ name: 'choose-account' } & UploadedFile)
  | ({ name: 'needs-profile'; accountId: string } & UploadedFile)
  | ({ name: 'build-profile'; accountId: string } & UploadedFile)
  | { name: 'categorize'; accountId: string; parseResult: ParseWithProfileResult }

const TITLES: Record<Step['name'], string> = {
  upload: 'Import transactions',
  'choose-account': 'Which account is this CSV for?',
  'needs-profile': 'This account needs a CSV profile',
  'build-profile': 'Set up CSV profile',
  categorize: 'Import transactions',
}

/**
 * The CSV import workflow, rendered inline on the Transaction screen rather
 * than as its own route: upload → which account → profile setup if needed →
 * categorization. Calls onDone(accountId) once the rows are committed.
 */
export function ImportFlow({ initial = null, setupAccountId = null, onDone }: ImportFlowProps) {
  const { categories } = useCategories()
  const { profiles, loading: profilesLoading, createProfile } = useImportProfiles()
  const { accounts } = useAccounts()
  const [step, setStep] = useState<Step>(() =>
    initial ? { name: 'choose-account', uploadedFileId: initial.uploadedFileId, fileName: initial.fileName } : { name: 'upload' },
  )
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(initial?.accountId ?? setupAccountId)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)

  const profileFor = (accountId: string) => profiles.find((p) => p.accountId === accountId) ?? null
  const accountOf = (accountId: string) => accounts.find((a) => a.id === accountId) ?? null

  async function parseWithProfile(accountId: string, uploadedFileId: string, importProfileId: string) {
    setError(null)
    try {
      const parseResult = await apiClient.post<ParseWithProfileResult>('/import-runs/parse', { uploadedFileId, importProfileId })
      setSkippedNote(parseResult.skippedDuplicateCount > 0 ? `Skipped ${parseResult.skippedDuplicateCount} likely duplicates` : null)
      setStep({ name: 'categorize', accountId, parseResult })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file with this profile')
    }
  }

  /** Reads the file with the account's profile, or asks to set one up. */
  async function continueWithAccount(accountId: string, file: UploadedFile) {
    const profile = profileFor(accountId)
    if (profile) await parseWithProfile(accountId, file.uploadedFileId, profile.id)
    // Opened via "Add CSV profile" means they've already said yes — go straight to the wizard.
    else if (accountId === setupAccountId) setStep({ name: 'build-profile', accountId, uploadedFileId: file.uploadedFileId, fileName: file.fileName })
    else setStep({ name: 'needs-profile', accountId, uploadedFileId: file.uploadedFileId, fileName: file.fileName })
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      const uploadedFile = { uploadedFileId: uploaded.id, fileName: file.name }
      if (setupAccountId) await continueWithAccount(setupAccountId, uploadedFile)
      else setStep({ name: 'choose-account', ...uploadedFile })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  async function handleCreateProfile(accountId: string, uploadedFileId: string, input: CreateImportProfileInput) {
    const profile = await createProfile(input)
    await parseWithProfile(accountId, uploadedFileId, profile.id)
  }

  async function handleCategorizationDone(accountId: string, importRunId: string, categorized: CategorizedRow[]) {
    setError(null)
    try {
      await apiClient.post('/import-runs/commit', { importRunId, rows: categorized })
      onDone(accountId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit import')
    }
  }

  return (
    <div className="import-flow">
      <h2 className="import-flow-title">{step.name === 'upload' && setupAccountId ? 'Set up CSV profile' : TITLES[step.name]}</h2>
      {error && <Alert variant="error">{error}</Alert>}

      {step.name === 'upload' && profilesLoading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {step.name === 'upload' && !profilesLoading && (
        <>
          <p className="wizard-hint" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
            {setupAccountId
              ? `Upload a CSV from ${accountOf(setupAccountId)?.name ?? 'this account'}’s bank — a few quick questions then set up how to read it.`
              : 'Upload a bank export, then choose which account it belongs to.'}
          </p>
          <UploadDropzone uploading={uploading} onFile={handleFileSelected} />
        </>
      )}

      {step.name === 'choose-account' && (
        <ChooseAccountStep
          fileName={step.fileName}
          accounts={accounts}
          accountIdsWithProfile={new Set(profiles.map((p) => p.accountId).filter((id): id is string => !!id))}
          selectedId={chosenAccountId}
          onSelect={setChosenAccountId}
          onBack={() => setStep({ name: 'upload' })}
          onContinue={(accountId) => continueWithAccount(accountId, step)}
        />
      )}

      {step.name === 'needs-profile' && (
        <section className="wizard-question">
          <h2>{accountOf(step.accountId)?.name ?? 'This account'} doesn’t have a CSV profile yet</h2>
          <p className="wizard-hint">
            A profile tells FinAI how to read this bank’s files — which column is the date, the description and the amount. It takes a few quick questions,
            using the file you just uploaded, and is reused for every future import into this account.
          </p>
          <div className="wizard-nav">
            <Button variant="secondary" onClick={() => setStep({ name: 'choose-account', uploadedFileId: step.uploadedFileId, fileName: step.fileName })}>
              Choose a different account
            </Button>
            <Button variant="primary" onClick={() => setStep({ ...step, name: 'build-profile' })}>
              Add CSV profile
            </Button>
          </div>
        </section>
      )}

      {step.name === 'build-profile' && (
        <ProfileWizard
          accountId={step.accountId}
          account={accountOf(step.accountId)}
          accountCurrency={accountOf(step.accountId)?.currencyCode ?? 'USD'}
          defaultName={`${accountOf(step.accountId)?.name ?? 'Bank'} CSV`}
          uploadedFileId={step.uploadedFileId}
          stepsBefore={setupAccountId ? 1 : 2}
          onCreated={(input) => handleCreateProfile(step.accountId, step.uploadedFileId, input)}
          onCancel={() =>
            setupAccountId ? setStep({ name: 'upload' }) : setStep({ name: 'choose-account', uploadedFileId: step.uploadedFileId, fileName: step.fileName })
          }
        />
      )}

      {step.name === 'categorize' && (
        <div>
          {skippedNote && <p style={{ color: 'var(--text-muted)' }}>{skippedNote}</p>}
          <CategorizationDeck
            rows={step.parseResult.rows}
            categories={categories}
            onDone={(categorized) => handleCategorizationDone(step.accountId, step.parseResult.importRunId, categorized)}
          />
        </div>
      )}
    </div>
  )
}
