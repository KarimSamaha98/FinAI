import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CreateImportProfileInput, ParseWithProfileResult } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { useCategories } from '../../hooks/useCategories'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { ProfileWizard } from './ProfileWizard'
import { UploadDropzone } from './UploadDropzone'
import { useAccounts } from '../../hooks/useAccounts'
import { CategorizationDeck, type CategorizedRow } from './CategorizationDeck'
import { Alert } from '../../components/Alert'

type Step =
  | { name: 'upload' }
  | { name: 'build-profile'; uploadedFileId: string }
  | { name: 'categorize'; parseResult: ParseWithProfileResult }

export function ImportWizardPage() {
  const { id: accountId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeCategories } = useCategories()
  const { profiles, loading: profilesLoading, createProfile } = useImportProfiles(accountId)
  const existingProfile = profiles[0] ?? null
  const { accounts } = useAccounts()
  const account = accounts.find((a) => a.id === accountId)
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)

  if (!accountId) return null

  async function parseWithProfile(uploadedFileId: string, importProfileId: string) {
    setError(null)
    try {
      const parseResult = await apiClient.post<ParseWithProfileResult>('/import-runs/parse', {
        uploadedFileId,
        importProfileId,
      })
      setSkippedNote(
        parseResult.skippedDuplicateCount > 0 ? `Skipped ${parseResult.skippedDuplicateCount} likely duplicates` : null,
      )
      setStep({ name: 'categorize', parseResult })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file with this profile')
    }
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      if (existingProfile) {
        await parseWithProfile(uploaded.id, existingProfile.id)
      } else {
        setStep({ name: 'build-profile', uploadedFileId: uploaded.id })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  async function handleCreateProfile(uploadedFileId: string, input: CreateImportProfileInput) {
    const profile = await createProfile(input)
    await parseWithProfile(uploadedFileId, profile.id)
  }

  async function handleCategorizationDone(importRunId: string, categorized: CategorizedRow[]) {
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
      <h1>{step.name === 'build-profile' ? 'Set up CSV profile' : 'Import transactions'}</h1>
      {error && <Alert variant="error">{error}</Alert>}

      {step.name === 'upload' && profilesLoading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {step.name === 'upload' && !profilesLoading && (
        <>
          <p className="wizard-hint" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
            {existingProfile
              ? `Using your “${existingProfile.name}” profile to read the file.`
              : 'Step 1 of 7 — this account has no import profile yet. After you upload a file, a few quick questions set up how to read it.'}
          </p>
          <UploadDropzone uploading={uploading} onFile={handleFileSelected} />
        </>
      )}

      {step.name === 'build-profile' && (
        <ProfileWizard
          accountId={accountId}
          account={account ?? null}
          accountCurrency={account?.currencyCode ?? 'USD'}
          defaultName={account ? `${account.name} CSV` : 'Bank CSV'}
          uploadedFileId={step.uploadedFileId}
          onCreated={(input) => handleCreateProfile(step.uploadedFileId, input)}
          onCancel={() => setStep({ name: 'upload' })}
        />
      )}

      {step.name === 'categorize' && (
        <div>
          {skippedNote && <p style={{ color: 'var(--text-muted)' }}>{skippedNote}</p>}
          <CategorizationDeck
            rows={step.parseResult.rows}
            categories={activeCategories}
            onDone={(categorized) => handleCategorizationDone(step.parseResult.importRunId, categorized)}
          />
        </div>
      )}
    </main>
  )
}
