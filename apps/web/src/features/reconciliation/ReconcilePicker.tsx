import { useMemo, useState } from 'react'
import type { Account, Category, ReconciliationGroupWithComputed, Transaction } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { formatCurrency } from '../../lib/formatCurrency'

interface ReconcilePickerProps {
  open: boolean
  onClose: () => void
  anchor: Transaction
  existingGroup: ReconciliationGroupWithComputed | null
  allGroups: ReconciliationGroupWithComputed[]
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  onCreateGroup: (label: string | null, transactionIds: string[]) => Promise<void>
  onAddMember: (groupId: string, transactionId: string) => Promise<void>
}

function categoryName(categories: Category[], categoryId: string | null) {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

function accountName(accounts: Account[], accountId: string | null) {
  return accounts.find((a) => a.id === accountId)?.name ?? null
}

export function ReconcilePicker({
  open,
  onClose,
  anchor,
  existingGroup,
  allGroups,
  transactions,
  categories,
  accounts,
  onCreateGroup,
  onAddMember,
}: ReconcilePickerProps) {
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadyGroupedIds = useMemo(
    () => new Set(allGroups.flatMap((g) => g.memberTransactionIds)),
    [allGroups],
  )

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return transactions.filter((t) => {
      if (t.id === anchor.id) return false
      if (alreadyGroupedIds.has(t.id)) return false
      if (t.currencyCode !== anchor.currencyCode) return false
      if (accountFilter && t.accountId !== accountFilter) return false
      if (term && !t.description.toLowerCase().includes(term)) return false
      return true
    })
  }, [transactions, anchor, alreadyGroupedIds, search, accountFilter])

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleConfirm() {
    if (!selectedIds.length) return
    setSubmitting(true)
    setError(null)
    try {
      if (existingGroup) {
        for (const id of selectedIds) {
          await onAddMember(existingGroup.id, id)
        }
      } else {
        await onCreateGroup(label.trim() || null, [anchor.id, ...selectedIds])
      }
      setSelectedIds([])
      setLabel('')
      setSearch('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconcile transactions')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existingGroup ? 'Add to reconciliation group' : 'Reconcile transaction'}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Linking against: {anchor.description || 'Untitled'} · <span className="mono">{formatCurrency(anchor.amount, anchor.currencyCode)}</span>
      </p>

      {!existingGroup && (
        <label>
          Label (optional)
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={anchor.description} />
        </label>
      )}

      <label>
        Search
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by description" />
      </label>

      <label>
        Account
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ maxHeight: '16rem', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        {candidates.length === 0 && (
          <p style={{ padding: 'var(--space-2)', color: 'var(--text-muted)' }}>No eligible transactions found.</p>
        )}
        {candidates.map((t) => (
          <label
            key={t.id}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggle(t.id)} />
            <span style={{ flex: 1, color: 'var(--text)' }}>
              {t.date} — {t.description || 'Untitled'} — {categoryName(categories, t.categoryId)}
              {accountName(accounts, t.accountId) && (
                <Badge variant="neutral" style={{ marginLeft: '0.5rem' }}>
                  {accountName(accounts, t.accountId)}
                </Badge>
              )}
            </span>
            <span className="mono">{formatCurrency(t.amount, t.currencyCode)}</span>
          </label>
        ))}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!selectedIds.length} loading={submitting}>
          {existingGroup ? 'Add selected' : 'Link selected'}
        </Button>
      </div>
    </Modal>
  )
}
