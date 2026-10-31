import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { Category, CategoryIconKey } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { GripIcon, PencilIcon, TrashIcon } from '../../components/icons'
import { CategoryIcon } from '../../components/categoryIcons'
import { CATEGORY_ICON_KEYS, DEFAULT_CATEGORY_ICON } from '../../lib/categoryIconKeys'
import { useCategories } from '../../hooks/useCategories'

/** Name + icon prompt shared by Add and Rename. */
function CategoryNameModal({
  title,
  submitLabel,
  initialName,
  initialIcon,
  takenIcons,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel: string
  initialName: string
  initialIcon: CategoryIconKey | null
  /** Icons other categories already use; they're shown but can't be picked, so every icon stays unique. */
  takenIcons: Set<CategoryIconKey>
  onSubmit: (name: string, icon: CategoryIconKey) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  // A new category starts on the first free icon rather than the Uncategorized tag.
  const [icon, setIcon] = useState<CategoryIconKey>(
    () => initialIcon ?? CATEGORY_ICON_KEYS.find((o) => !takenIcons.has(o.key))?.key ?? DEFAULT_CATEGORY_ICON,
  )
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
            {CATEGORY_ICON_KEYS.map((option) => {
              const taken = takenIcons.has(option.key)
              return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={icon === option.key}
                aria-label={taken ? `${option.label} (used by another category)` : option.label}
                title={taken ? `${option.label} — used by another category` : option.label}
                className={`icon-picker-option${icon === option.key ? ' is-selected' : ''}`}
                disabled={taken}
                onClick={() => setIcon(option.key)}
              >
                <CategoryIcon name={option.key} size={18} />
              </button>
              )
            })}
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

/** Moves the item at `from` to `to`, returning a new array. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** An in-progress drag: which row, where it started, and how far the pointer has moved. */
interface DragState {
  id: string
  fromIndex: number
  startY: number
  deltaY: number
  rowHeight: number
}

/**
 * The arrangeable category list. Drag a row by its grip (mouse or touch), or
 * focus the grip and use ↑/↓. Each change is saved straight away.
 */
function ArrangeableCategoryList({
  categories,
  onReorder,
  onRename,
  onDelete,
}: {
  categories: Category[]
  onReorder: (ids: string[]) => Promise<void>
  onRename: (category: Category) => void
  onDelete: (category: Category) => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const gripRefs = useRef(new Map<string, HTMLButtonElement>())

  const count = categories.length
  const targetIndex = drag ? Math.max(0, Math.min(count - 1, drag.fromIndex + Math.round(drag.deltaY / drag.rowHeight))) : null

  async function save(ids: string[], moved: Category, toIndex: number) {
    setSaveError(null)
    setAnnouncement(`${moved.name} moved to position ${toIndex + 1} of ${count}`)
    try {
      await onReorder(ids)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Couldn’t save the new order')
    }
  }

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const row = e.currentTarget.closest('li')
    setDrag({ id: categories[index].id, fromIndex: index, startY: e.clientY, deltaY: 0, rowHeight: row?.getBoundingClientRect().height || 44 })
  }

  function handlePointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    setDrag({ ...drag, deltaY: e.clientY - drag.startY })
  }

  function handlePointerUp() {
    if (!drag || targetIndex === null) return
    const { fromIndex } = drag
    setDrag(null)
    if (targetIndex === fromIndex) return
    const next = moveItem(categories, fromIndex, targetIndex)
    void save(next.map((c) => c.id), categories[fromIndex], targetIndex)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    const toIndex = index + step
    if (step === 0 || toIndex < 0 || toIndex >= count) return
    e.preventDefault()
    const moved = categories[index]
    const next = moveItem(categories, index, toIndex)
    void save(next.map((c) => c.id), moved, toIndex).then(() => gripRefs.current.get(moved.id)?.focus())
  }

  /** While dragging, the dragged row follows the pointer and the rows it passes slide out of its way. */
  function rowOffset(index: number): number {
    if (!drag || targetIndex === null) return 0
    if (index === drag.fromIndex) return drag.deltaY
    if (drag.fromIndex < targetIndex && index > drag.fromIndex && index <= targetIndex) return -drag.rowHeight
    if (drag.fromIndex > targetIndex && index < drag.fromIndex && index >= targetIndex) return drag.rowHeight
    return 0
  }

  return (
    <>
      {saveError && <Alert variant="error">{saveError}</Alert>}
      <ul className={`category-list${drag ? ' is-arranging' : ''}`}>
        {categories.map((category, index) => (
          <li
            key={category.id}
            className={`category-list-row${drag?.id === category.id ? ' is-dragging' : ''}`}
            style={{ transform: `translateY(${rowOffset(index)}px)` }}
          >
            <span className="category-list-name">
              <CategoryIcon name={category.icon} size={16} />
              {category.name}
            </span>
            <button
              type="button"
              ref={(el) => {
                if (el) gripRefs.current.set(category.id, el)
                else gripRefs.current.delete(category.id)
              }}
              className="icon-button icon-button--small category-grip"
              aria-label={`Arrange ${category.name}, position ${index + 1} of ${count}. Use the up and down arrow keys to move it.`}
              title="Drag to arrange"
              onPointerDown={(e) => handlePointerDown(e, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              <GripIcon />
            </button>
            <button
              type="button"
              className="icon-button icon-button--small"
              aria-label={`Rename ${category.name}`}
              title="Rename"
              onClick={() => onRename(category)}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className="icon-button icon-button--small icon-button--danger"
              aria-label={`Delete ${category.name}`}
              title="Delete"
              onClick={() => onDelete(category)}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}

type Dialog = { kind: 'add' } | { kind: 'rename'; category: Category } | { kind: 'delete'; category: Category } | null

export function CategoriesSection() {
  const { activeCategories, loading, error, createCategory, renameCategory, reorderCategories, archiveCategory, getCategoryUsage, removeCategory } = useCategories()
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
        Add your own categories, rename them, or delete the ones you don’t use. Drag the handle to set the order they appear in.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && (
        <ArrangeableCategoryList
          categories={activeCategories}
          onReorder={reorderCategories}
          onRename={(category) => setDialog({ kind: 'rename', category })}
          onDelete={(category) => setDialog({ kind: 'delete', category })}
        />
      )}

      {dialog?.kind === 'add' && (
        <CategoryNameModal
          title="Add category"
          submitLabel="Add"
          initialName=""
          initialIcon={null}
          takenIcons={new Set(activeCategories.flatMap((c) => (c.icon ? [c.icon] : [])))}
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
          takenIcons={new Set(activeCategories.flatMap((c) => (c.icon && c.id !== dialog.category.id ? [c.icon] : [])))}
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
