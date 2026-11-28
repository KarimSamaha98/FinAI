import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Account, Group, GroupShare } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { groupsApi } from '../../hooks/useGroups'
import { apiErrorMessage, peopleApi } from '../../hooks/usePeople'
import { PersonInitials } from '../people/PersonInitials'

interface GroupModalProps {
  group: Group
  accounts: Account[]
  onEdit: () => void
  onClose: () => void
}

/**
 * Everything in a group at a glance: the user's transactions, each person's
 * share with what they've paid and what's still expected, and what it all
 * comes to. Changes go through Edit (the same wizard that made it); only
 * forgiving a person's part is done here.
 */
export function GroupModal({ group, accounts, onEdit, onClose }: GroupModalProps) {
  const navigate = useNavigate()
  const [confirmUngroup, setConfirmUngroup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currency = group.currencyCode
  const own = group.members.filter((m) => m.contactId === null)
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? null

  async function run(action: () => Promise<unknown>, failure: string, close = false) {
    setBusy(true)
    setError(null)
    try {
      await action()
      if (close) onClose()
    } catch (err) {
      setError(apiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={group.description || 'Group'}>
      <div className="group-sheet">
        <section className="group-sheet-section">
          <h3>Your transactions</h3>
          <ul className="group-items">
            {own.map((m) => (
              <li key={m.transactionId} className="group-item">
                <span className="group-item-main">
                  <span className="group-item-title">{m.description || 'Untitled'}</span>
                  <span className="group-item-sub">
                    {[formatDate(m.date), accountName(m.accountId), m.allocated ? `part of ${formatCurrency(m.transactionAmount, currency)}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="mono">{formatCurrency(m.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </section>

        {group.shares.length > 0 && (
          <section className="group-sheet-section">
            <h3>People</h3>
            <ul className="group-people">
              {group.shares.map((share) => (
                <ShareRow
                  key={share.contactId}
                  share={share}
                  group={group}
                  busy={busy}
                  onOpen={() => navigate(`/people?selected=${share.contactId}`)}
                  onForgive={() => void run(() => peopleApi.forgive(share.contactId, group.id), 'Couldn’t forgive it')}
                  onUnforgive={() => void run(() => peopleApi.unforgive(share.contactId, group.id), 'Couldn’t undo it')}
                />
              ))}
            </ul>
          </section>
        )}

        <div className="group-sheet-total">
          <span>{group.shares.length > 0 ? 'Your part' : 'Comes to'}</span>
          <span className="mono">{formatCurrency(group.net ?? 0, currency)}</span>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="group-sheet-actions">
          {confirmUngroup ? (
            <>
              <span className="group-sheet-confirm">Ungroup? Each transaction goes back to being on its own{group.shares.length > 0 ? ' and the people come out of it' : ''}.</span>
              <Button variant="secondary" onClick={() => setConfirmUngroup(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void run(() => groupsApi.remove(group.id), 'Couldn’t ungroup it', true)}>
                Ungroup
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setConfirmUngroup(true)}>
                Ungroup
              </Button>
              <Button variant="primary" onClick={onEdit}>
                Edit group
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

interface ShareRowProps {
  share: GroupShare
  group: Group
  busy: boolean
  onOpen: () => void
  onForgive: () => void
  onUnforgive: () => void
}

/** A person in the group: their share, what they paid (and with what), what's forgiven and what's still expected. */
function ShareRow({ share, group, busy, onOpen, onForgive, onUnforgive }: ShareRowProps) {
  const currency = group.currencyCode
  const payments = group.members.filter((m) => m.contactId === share.contactId)
  const theyOwe = share.amount > 0
  return (
    <li className="group-person">
      <div className="group-person-head">
        <PersonInitials name={share.contactName} />
        <button type="button" className="group-person-name text-button" onClick={onOpen}>
          {share.contactName}
        </button>
        <span className="group-person-share">
          {theyOwe ? 'Their share' : 'You owe them'} <span className="mono">{formatCurrency(Math.abs(share.amount), currency)}</span>
        </span>
      </div>
      <ul className="split-payments">
        {payments.map((p) => (
          <li key={p.transactionId} className="split-payment is-paid">
            <span>
              Paid · {p.description || 'Untitled'} · {formatDate(p.date)}
            </span>
            <span className="mono">{formatCurrency(Math.abs(p.amount), currency)}</span>
          </li>
        ))}
        {share.forgiven !== 0 && (
          <li className="split-payment">
            <span>Forgiven{share.forgivenOn ? ` · ${formatDate(share.forgivenOn)}` : ''}</span>
            <span className="mono">{formatCurrency(Math.abs(share.forgiven), currency)}</span>
            <button type="button" className="text-button" disabled={busy} onClick={onUnforgive}>
              Undo
            </button>
          </li>
        )}
        {share.outstanding !== 0 && (
          <li className="split-payment is-expected">
            <span>{share.outstanding > 0 ? 'Expected from them' : 'You’ll pay them'}</span>
            <span className="mono">{formatCurrency(Math.abs(share.outstanding), currency)}</span>
            {Math.sign(share.outstanding) === Math.sign(share.amount) && (
              <button type="button" className="text-button" disabled={busy} onClick={onForgive}>
                Forgive
              </button>
            )}
          </li>
        )}
      </ul>
    </li>
  )
}
