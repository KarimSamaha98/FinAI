import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { PageHeader } from '../../components/BackButton'

/**
 * How the page was opened:
 * - from the Add transactions dialog, which has already uploaded the file;
 * - from an account's "Add CSV profile" button, which names the account to
 *   set up, so the file is uploaded here and the account question is skipped.
 */
export type ImportLocationState =
  | {
      uploadedFileId: string
      fileName: string
      /** Pre-selects the account question (e.g. the one card selected on the Transaction page). */
      accountId?: string | null
    }
  | { setupAccountId: string }

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
 * Reached from the Add transactions dialog (which uploads the file first), or
 * directly at /import with an upload step. Then: "which account is this for?",
 * profile setup if that account has none, and the categorization deck.
 */
export function ImportWizardPage() {
  const handoff = (useLocation().state as ImportLocationState | null) ?? null
  const uploadedHandoff = handoff && 'uploadedFileId' in handoff ? handoff : null
  const setupAccountId = handoff && 'setupAccountId' in handoff ? handoff.setupAccountId : null
  const navigate = useNavigate()
  const { categories } = useCategories()
  const { profiles, loading: profilesLoading, createProfile } = useImportProfiles()
  const { accounts } = useAccounts()
  const [step, setStep] = useState<Step>(() =>
    uploadedHandoff ? { name: 'choose-account', uploadedFileId: uploadedHandoff.uploadedFileId, fileName: uploadedHandoff.fileName } : { name: 'upload' },
  )
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(uploadedHandoff?.accountId ?? setupAccountId)
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
      navigate(`/accounts?selected=${accountId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit import')
    }
  }

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: step.name === 'build-profile' ? 880 : 640, margin: '0 auto', width: '100%' }}>
      <PageHeader
        title={step.name === 'upload' && setupAccountId ? 'Set up CSV profile' : TITLES[step.name]}
        backTo={setupAccountId ? `/accounts?selected=${setupAccountId}` : '/accounts'}
      />
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
    </main>
  )
}
