import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CreateImportProfileInput, ParseWithProfileResult } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { useCategories } from '../../hooks/useCategories'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { ProfileBuilderForm } from './ProfileBuilderForm'
import { CategorizationDeck, type CategorizedRow } from './CategorizationDeck'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'

type Step =
  | { name: 'upload' }
  | { name: 'build-profile'; uploadedFileId: string }
  | { name: 'categorize'; parseResult: ParseWithProfileResult }

export function ImportWizardPage() {
  const { id: accountId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { categories } = useCategories()
  const { profiles, loading: profilesLoading, createProfile } = useImportProfiles(accountId)
  const existingProfile = profiles[0] ?? null
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
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <h1>Import transactions</h1>
      {error && <Alert variant="error">{error}</Alert>}

      {step.name === 'upload' && profilesLoading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {step.name === 'upload' && !profilesLoading && (
        <Card>
          {!existingProfile && (
            <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
              This account has no import profile yet — after you upload a file, you'll set up how to read it.
            </p>
          )}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelected(file)
            }}
          />
          {uploading && <p style={{ color: 'var(--text-muted)' }}>Uploading…</p>}
        </Card>
      )}

      {step.name === 'build-profile' && (
        <Card>
          <ProfileBuilderForm
            accountId={accountId}
            uploadedFileId={step.uploadedFileId}
            onCreated={(input) => handleCreateProfile(step.uploadedFileId, input)}
            onCancel={() => setStep({ name: 'upload' })}
          />
        </Card>
      )}

      {step.name === 'categorize' && (
        <div>
          {skippedNote && <p style={{ color: 'var(--text-muted)' }}>{skippedNote}</p>}
          <CategorizationDeck
            rows={step.parseResult.rows}
            categories={categories}
            onDone={(categorized) => handleCategorizationDone(step.parseResult.importRunId, categorized)}
          />
        </div>
      )}
    </main>
  )
}
