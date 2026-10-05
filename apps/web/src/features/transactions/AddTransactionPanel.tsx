import { useState } from 'react'
import type { Account, Category, CreateTransactionInput } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { Alert } from '../../components/Alert'
import { UploadDropzone } from '../import/UploadDropzone'
import { TransactionForm } from './TransactionForm'

interface AddTransactionPanelProps {
  categories: Category[]
  accounts: Account[]
  /** The one account selected on the Transaction screen, if any — fixes the manual form and pre-selects the import's account question. */
  fixedAccountId: string | null
  onCreate: (input: CreateTransactionInput) => Promise<void>
  /** Hands the uploaded file to the import flow. */
  onFileUploaded: (uploadedFileId: string, fileName: string) => void
  onCancel: () => void
}

/**
 * Inline (non-modal) "add transactions" panel shown on the Transaction screen:
 * import a CSV (top) or enter one by hand (below the OR).
 */
export function AddTransactionPanel({ categories, accounts, fixedAccountId, onCreate, onFileUploaded, onCancel }: AddTransactionPanelProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      onFileUploaded(uploaded.id, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <section className="add-txn-section">
        <h3>Import a CSV</h3>
        <UploadDropzone compact uploading={uploading} onFile={handleFile} />
        {error && <Alert variant="error">{error}</Alert>}
      </section>

      <div className="or-divider" role="separator">
        <span>OR</span>
      </div>

      <section className="add-txn-section">
        <h3>Add a single transaction</h3>
        <TransactionForm categories={categories} accounts={accounts} fixedAccountId={fixedAccountId} onSubmit={onCreate} onCancel={onCancel} />
      </section>
    </>
  )
}
