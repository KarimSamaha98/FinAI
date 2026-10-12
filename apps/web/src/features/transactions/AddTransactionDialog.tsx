import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Account, Category, CreateTransactionInput } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { Modal } from '../../components/Modal'
import { Alert } from '../../components/Alert'
import { UploadDropzone } from '../import/UploadDropzone'
import type { ImportLocationState } from '../import/ImportWizardPage'
import { TransactionForm } from './TransactionForm'

interface AddTransactionDialogProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  accounts: Account[]
  /** The one account selected on the Transaction page, if any — fixes the manual form and pre-selects the import's account question. */
  fixedAccountId: string | null
  onCreate: (input: CreateTransactionInput) => Promise<void>
}

/**
 * Two ways to add transactions: import a CSV (top) or enter one by hand
 * (below the OR). Dropping a file uploads it here, then hands over to the
 * import page to ask which account it's for.
 */
export function AddTransactionDialog({ open, onClose, categories, accounts, fixedAccountId, onCreate }: AddTransactionDialogProps) {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      const state: ImportLocationState = { uploadedFileId: uploaded.id, fileName: file.name, accountId: fixedAccountId }
      onClose()
      navigate('/import', { state })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add transactions">
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
        <TransactionForm
          categories={categories}
          accounts={accounts}
          fixedAccountId={fixedAccountId}
          onSubmit={onCreate}
          onCancel={onClose}
        />
      </section>
    </Modal>
  )
}
