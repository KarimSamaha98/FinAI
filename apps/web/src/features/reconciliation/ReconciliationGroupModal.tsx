import type { Account, Category, ReconciliationGroupWithComputed, Transaction } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface ReconciliationGroupModalProps {
  open: boolean
  onClose: () => void
  group: ReconciliationGroupWithComputed
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  onRemoveMember: (groupId: string, transactionId: string) => Promise<void>
  onDeleteGroup: (groupId: string) => Promise<void>
}

function categoryName(categories: Category[], categoryId: string | null): string {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

function accountName(accounts: Account[], accountId: string | null): string {
  return accounts.find((a) => a.id === accountId)?.name ?? 'No account'
}

export function ReconciliationGroupModal({
  open,
  onClose,
  group,
  transactions,
  categories,
  accounts,
  onRemoveMember,
  onDeleteGroup,
}: ReconciliationGroupModalProps) {
  // All members share one currency (enforced at creation) — despite its name,
  // netAmountHomeCurrency is in that shared currency, not the user's home
  // currency; the anchor's own currencyCode is the correct one to display it in.
  const anchor = transactions.find((t) => t.id === group.anchorTransactionId)
  const netCurrency = anchor?.currencyCode ?? 'USD'

  return (
    <Modal open={open} onClose={onClose} title={group.label || 'Reconciliation group'}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {group.memberTransactionIds.length} members · net{' '}
        <span className="mono">{formatCurrency(group.netAmountHomeCurrency, netCurrency)}</span> · anchor category:{' '}
        {categoryName(categories, group.anchorCategoryId)}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {group.memberTransactionIds.map((id) => {
          const member = transactions.find((t) => t.id === id)
          if (!member) return null
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span>
                {formatDate(member.date)} — {member.description || 'Untitled'} — {accountName(accounts, member.accountId)}
                {id === group.anchorTransactionId ? ' (anchor)' : ''}
              </span>
              <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className="mono">{formatCurrency(member.amount, member.currencyCode)}</span>
                <Button variant="secondary" onClick={() => onRemoveMember(group.id, id)}>
                  Remove
                </Button>
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="danger" onClick={() => onDeleteGroup(group.id)}>
          Delete group
        </Button>
      </div>
    </Modal>
  )
}
