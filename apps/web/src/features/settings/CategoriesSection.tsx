import { useEffect, useState, type FormEvent } from 'react'
import type { Category } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/icons'
import { useCategories } from '../../hooks/useCategories'

/** Name prompt shared by Add and Rename. */
function CategoryNameModal({
  title,
  submitLabel,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel: string
  initialName: string
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const unchanged = trimmed === initialName.trim()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || unchanged) return
    setError(null)
    setSaving(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Category name</span>
          <input type="text" value={name} maxLength={60} data-autofocus placeholder="e.g. Pets" onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <Alert variant="error">{error}</Alert>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!trimmed || unchanged}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Delete prompt: archive (keeps it on past transactions) or remove (clears it from them for good). */
function DeleteCategoryModal({
  category,
  getUsage,
  onArchive,
  onRemove,
  onClose,
}: {
  category: Category
  getUsage: (id: string) => Promise<{ transactionCount: number }>
  onArchive: () => Promise<void>
  onRemove: () => Promise<void>
  onClose: () => void
}) {
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [busy, setBusy] = useState<'archive' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getUsage(category.id)
      .then((usage) => setTransactionCount(usage.transactionCount))
      .catch(() => setTransactionCount(null))
  }, [category.id, getUsage])

  async function run(action: 'archive' | 'remove') {
    setError(null)
    setBusy(action)
    try {
      await (action === 'archive' ? onArchive() : onRemove())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(null)
    }
  }

  const usedOn =
    transactionCount === null
      ? 'every transaction that has it'
      : transactionCount === 1
        ? '1 transaction'
        : `${transactionCount} transactions`

  return (
    <Modal open onClose={onClose} title={`Delete “${category.name}”?`}>
      <div className="category-delete-option">
        <strong>Archive</strong>
        <span>Hides it from category pickers. Transactions that already have it keep it.</span>
      </div>
      <div className="category-delete-option category-delete-option--danger">
        <strong>Remove permanently</strong>
        <span>
          {transactionCount === 0
            ? 'Deletes the category. No transactions use it. This can’t be undone.'
            : `Deletes the category and takes it off ${usedOn} — they become Uncategorized. This can’t be undone.`}
        </span>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Button variant="danger" loading={busy === 'remove'} disabled={busy !== null} onClick={() => run('remove')}>
          Remove permanently
        </Button>
        <Button variant="primary" loading={busy === 'archive'} disabled={busy !== null} onClick={() => run('archive')}>
          Archive
        </Button>
      </div>
    </Modal>
  )
}

type Dialog = { kind: 'add' } | { kind: 'rename'; category: Category } | { kind: 'delete'; category: Category } | null

export function CategoriesSection() {
  const { activeCategories, loading, error, createCategory, renameCategory, archiveCategory, getCategoryUsage, removeCategory } = useCategories()
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)

  return (
    <Card style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Categories</h2>
        <button type="button" className="icon-button" aria-label="Add category" title="Add category" onClick={() => setDialog({ kind: 'add' })}>
          <PlusIcon />
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-1)' }}>
        Add your own categories, rename them, or delete the ones you don’t use.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && (
        <ul className="category-list">
          {activeCategories.map((category) => (
            <li key={category.id} className="category-list-row">
              <span className="category-list-name">{category.name}</span>
              <button
                type="button"
                className="icon-button icon-button--small"
                aria-label={`Rename ${category.name}`}
                title="Rename"
                onClick={() => setDialog({ kind: 'rename', category })}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="icon-button icon-button--small icon-button--danger"
                aria-label={`Delete ${category.name}`}
                title="Delete"
                onClick={() => setDialog({ kind: 'delete', category })}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'add' && (
        <CategoryNameModal
          title="Add category"
          submitLabel="Add"
          initialName=""
          onSubmit={async (name) => {
            await createCategory({ name })
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'rename' && (
        <CategoryNameModal
          title="Rename category"
          submitLabel="Save"
          initialName={dialog.category.name}
          onSubmit={async (name) => {
            await renameCategory(dialog.category.id, name)
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteCategoryModal
          category={dialog.category}
          getUsage={getCategoryUsage}
          onArchive={async () => {
            await archiveCategory(dialog.category.id)
          }}
          onRemove={async () => {
            await removeCategory(dialog.category.id)
          }}
          onClose={close}
        />
      )}
    </Card>
  )
}
