import { useEffect, useState, type FormEvent } from 'react'
import type { Category, CategoryIconKey } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { PencilIcon, TrashIcon } from '../../components/icons'
import { CategoryIcon } from '../../components/categoryIcons'
import { CATEGORY_ICON_KEYS, DEFAULT_CATEGORY_ICON } from '../../lib/categoryIconKeys'
import { useCategories } from '../../hooks/useCategories'

/** Name + icon prompt shared by Add and Rename. */
function CategoryNameModal({
  title,
  submitLabel,
  initialName,
  initialIcon,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel: string
  initialName: string
  initialIcon: CategoryIconKey | null
  onSubmit: (name: string, icon: CategoryIconKey) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState<CategoryIconKey>(initialIcon ?? DEFAULT_CATEGORY_ICON)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const unchanged = trimmed === initialName.trim() && icon === (initialIcon ?? DEFAULT_CATEGORY_ICON)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || unchanged) return
    setError(null)
    setSaving(true)
    try {
      await onSubmit(trimmed, icon)
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Icon</span>
          <div className="icon-picker" role="radiogroup" aria-label="Category icon">
            {CATEGORY_ICON_KEYS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={icon === option.key}
                aria-label={option.label}
                title={option.label}
                className={`icon-picker-option${icon === option.key ? ' is-selected' : ''}`}
                onClick={() => setIcon(option.key)}
              >
                <CategoryIcon name={option.key} size={18} />
              </button>
            ))}
          </div>
        </div>
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
      <p className="category-delete-question">Are you sure?</p>
      <p className="category-delete-text">
        <strong>Archive</strong> – Hides it from category pickers. Transactions that already have it keep it.
      </p>
      <p className="category-delete-text">
        <strong className="category-delete-danger">Remove permanently</strong> –{' '}
        {transactionCount === 0
          ? 'Deletes the category. No transactions use it. This can’t be undone.'
          : `Deletes the category and takes it off ${usedOn} and they become Uncategorized. This can’t be undone.`}
      </p>
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
        <Button variant="primary" onClick={() => setDialog({ kind: 'add' })}>
          Add Category
        </Button>
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
              <span className="category-list-name">
                <CategoryIcon name={category.icon} size={16} />
                {category.name}
              </span>
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
          initialIcon={null}
          onSubmit={async (name, icon) => {
            await createCategory({ name, icon })
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'rename' && (
        <CategoryNameModal
          title="Rename category"
          submitLabel="Save"
          initialName={dialog.category.name}
          initialIcon={dialog.category.icon}
          onSubmit={async (name, icon) => {
            await renameCategory(dialog.category.id, name, icon)
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
