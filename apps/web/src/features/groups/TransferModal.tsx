import { useState } from 'react'
import type { Account, Group } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { groupsApi } from '../../hooks/useGroups'
import { apiErrorMessage } from '../../hooks/usePeople'
import { TransferSummary } from './TransferSummary'

interface TransferModalProps {
  group: Group
  accounts: Account[]
  onClose: () => void
}

/** A transfer between the user's accounts: its sides, what's left over, and Unmatch. */
export function TransferModal({ group, accounts, onClose }: TransferModalProps) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const out = group.members.filter((m) => m.amount < 0).sort((a, b) => a.amount - b.amount)
  const into = group.members.filter((m) => m.amount > 0).sort((a, b) => b.amount - a.amount)
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'Another account'
  const simple = out.length === 1 && into.length === 1

  async function unmatch() {
    setBusy(true)
    setError(null)
    try {
      await groupsApi.remove(group.id)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t unmatch it'))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={group.label || 'Transfer'}>
      <div className="group-sheet">
        {simple ? (
          <TransferSummary from={out[0]} to={into[0]} accounts={accounts} />
        ) : (
          <ul className="group-items">
            {[...out, ...into].map((m) => (
              <li key={m.transactionId} className="group-item">
                <span className="group-item-main">
                  <span className="group-item-title">{accountName(m.accountId)}</span>
                  <span className="group-item-sub">
                    {m.description || 'Untitled'} · {formatDate(m.date)}
                  </span>
                </span>
                <span className="mono">{formatCurrency(m.amount, m.currencyCode)}</span>
              </li>
            ))}
          </ul>
        )}

        {group.net !== null && group.net !== 0 && (
          <div className="group-sheet-total">
            <span>Left over (FX or fees)</span>
            <span className="mono">{formatCurrency(group.net, group.currencyCode)}</span>
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        <div className="group-sheet-actions">
          {confirm ? (
            <>
              <span className="group-sheet-confirm">Unmatch? Both sides go back to counting as spending and income.</span>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void unmatch()}>
                Unmatch
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              Unmatch
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
