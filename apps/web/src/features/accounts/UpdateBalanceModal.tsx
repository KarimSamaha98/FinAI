import { useState } from 'react'
import type { AccountSummary, UpdateAccountInput } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'

interface UpdateBalanceModalProps {
  open: boolean
  onClose: () => void
  account: AccountSummary
  updateAccount: (id: string, input: Omit<UpdateAccountInput, 'id'>) => Promise<void>
}

/**
 * Re-baselines the account exactly like the initial "current balance" step at
 * account creation: sets a new starting_balance as of a chosen date, so the
 * displayed balance matches what the user's bank/third-party app shows right
 * now, without touching any existing transaction. Transactions dated strictly
 * after this date are the only ones that move the balance from here on —
 * anything dated on or before it is treated as already reflected in the
 * figure just entered. See AccountsService.toSummary.
 */
export function UpdateBalanceModal({ open, onClose, account, updateAccount }: UpdateBalanceModalProps) {
  const [balance, setBalance] = useState(account.balance.toFixed(2))
  const [balanceAsOf, setBalanceAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const value = Number(balance)
    if (!Number.isFinite(value)) {
      setError('Enter a valid balance')
      return
    }
    setSubmitting(true)
    try {
      await updateAccount(account.id, { startingBalance: value, balanceAsOf })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update balance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Update balance — ${account.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Enter what your bank/provider shows right now. Only transactions dated <strong>after</strong> "as of" will
          move the balance from here on — pick yesterday's date if you want today's activity to count too.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <label style={{ flex: 1 }}>
            Current balance ({account.currencyCode})
            <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            as of
            <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} />
          </label>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Update balance
          </Button>
        </div>
      </div>
    </Modal>
  )
}
