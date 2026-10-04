import { useState } from 'react'
import type { Category } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { useCategories } from '../../hooks/useCategories'

/** One editable row: rename on blur/Enter, or soft-delete (archive). */
function CategoryRow({
  category,
  onRename,
  onArchive,
}: {
  category: Category
  onRename: (id: string, name: string) => Promise<void>
  onArchive: (category: Category) => void
}) {
  const [draft, setDraft] = useState(category.name)
  const [saving, setSaving] = useState(false)

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === category.name) {
      setDraft(category.name)
      return
    }
    setSaving(true)
    try {
      await onRename(category.id, trimmed)
    } catch {
      setDraft(category.name) // parent surfaces the error; revert the input
    } finally {
      setSaving(false)
    }
  }

  return (
    <li style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <input
        type="text"
        value={draft}
        maxLength={60}
        disabled={saving}
        aria-label={`Rename ${category.name}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        style={{ flex: 1 }}
      />
      <Button variant="secondary" onClick={() => onArchive(category)}>
        Delete
      </Button>
    </li>
  )
}

export function CategoriesSection() {
  const { activeCategories, loading, error, createCategory, renameCategory, archiveCategory } = useCategories()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setActionError(null)
    setAdding(true)
    try {
      await createCategory({ name })
      setNewName('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add category')
    } finally {
      setAdding(false)
    }
  }

  async function handleRename(id: string, name: string) {
    setActionError(null)
    try {
      await renameCategory(id, name)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename category')
      throw err // let the row revert its input
    }
  }

  async function handleArchive(category: Category) {
    if (!window.confirm(`Delete “${category.name}”? Past transactions keep it.`)) return
    setActionError(null)
    try {
      await archiveCategory(category.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete category')
    }
  }

  return (
    <Card style={{ marginTop: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Categories</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
        Rename or delete any category, or add your own. Deleting keeps it on past transactions.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <input
              type="text"
              value={newName}
              maxLength={60}
              placeholder="New category…"
              aria-label="New category name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
              style={{ flex: 1 }}
            />
            <Button variant="primary" loading={adding} disabled={!newName.trim()} onClick={handleAdd}>
              Add
            </Button>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {activeCategories.map((category) => (
              <CategoryRow key={category.id} category={category} onRename={handleRename} onArchive={handleArchive} />
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
