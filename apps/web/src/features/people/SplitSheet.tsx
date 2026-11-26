import { useMemo, useState } from 'react'
import { computeSplit, type SplitMode, type Transaction, type TransactionSplit } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SkeletonBlock } from '../../components/Skeleton'
import { formatCurrency } from '../../lib/formatCurrency'
import { apiErrorMessage, peopleApi, useContacts, useTransactionPeople } from '../../hooks/usePeople'
import { ContactPicker } from './ContactPicker'
import { PersonInitials } from './PersonInitials'

interface SplitSheetProps {
  transaction: Transaction
  onClose: () => void
}

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'amount', label: 'Amount' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' },
]

const PROBLEMS = {
  over_total: 'The shares add up to more than the transaction.',
  zero_share: 'Everyone needs a share above zero.',
  percent_over_100: 'The percentages add up to more than 100%.',
  no_shares: 'Give at least one person a share.',
} as const

/**
 * Tag a transaction with people. On an expense, each person's share is what
 * they owe the user (the user's share at 0 is a loan). On money in, it's what
 * they sent: it lowers what they owe, or becomes what the user owes them.
 */
export function SplitSheet({ transaction, onClose }: SplitSheetProps) {
  const { details, loading } = useTransactionPeople(transaction.id)
  const title = details?.split ? 'Edit people' : transaction.amount < 0 ? 'Split with people' : 'Received from someone'
  return (
    <Modal open onClose={onClose} title={title}>
      {loading ? <SkeletonBlock height="16rem" /> : <SplitForm transaction={transaction} existing={details?.split ?? null} onClose={onClose} />}
    </Modal>
  )
}

interface Draft {
  contactId: string
  value: string
}

function SplitForm({ transaction, existing, onClose }: { transaction: Transaction; existing: TransactionSplit | null; onClose: () => void }) {
  const { contacts } = useContacts()
  const total = Math.abs(transaction.amount)
  const currency = transaction.currencyCode
  const spending = transaction.amount < 0
  const [mode, setMode] = useState<SplitMode>(existing?.mode ?? 'equal')
  // Money in usually all came from them; an expense usually includes the user.
  const [myValue, setMyValue] = useState(String(existing?.myValue ?? (spending ? 1 : 0)))
  const [people, setPeople] = useState<Draft[]>(existing?.participants.map((p) => ({ contactId: p.contactId, value: String(p.value) })) ?? [])
  const [note, setNote] = useState(existing?.note ?? '')
  const [picking, setPicking] = useState(!existing)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const values = people.map((p) => Number(p.value) || 0)
  const result = useMemo(
    () => (people.length ? computeSplit(total, mode, values, { myValue: Number(myValue) || 0 }) : null),
    // values is derived from people each render; key on the inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, mode, myValue, people],
  )
  const theirs = result ? Math.round(result.shares.reduce((sum, s) => sum + s, 0) * 100) / 100 : 0
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.displayName ?? '…'

  /** Switching mode starts each person from a sensible value for it. */
  function changeMode(next: SplitMode) {
    const current = result?.shares ?? []
    setPeople((list) =>
      list.map((p, i) => ({
        ...p,
        value:
          next === 'amount'
            ? String(current[i] ?? 0)
            : next === 'percent'
              ? String(Math.floor(100 / (list.length + 1)))
              : next === 'shares'
                ? '1'
                : p.value,
      })),
    )
    if (next === 'shares' || next === 'equal') setMyValue(spending ? '1' : '0')
    setMode(next)
  }

  function setSelected(ids: string[]) {
    setPeople((list) => {
      const kept = list.filter((p) => ids.includes(p.contactId))
      const added = ids.filter((id) => !list.some((p) => p.contactId === id)).map((id) => ({ contactId: id, value: mode === 'shares' ? '1' : '0' }))
      return [...kept, ...added]
    })
  }

  async function save() {
    if (!result || result.problem) return
    setSaving(true)
    setError(null)
    const input = {
      mode,
      myValue: Number(myValue) || 0,
      participants: people.map((p) => ({ contactId: p.contactId, value: Number(p.value) || 0 })),
      note: note.trim() || null,
    }
    try {
      await peopleApi.setSplit(transaction.id, input)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing) return
    setSaving(true)
    setError(null)
    try {
      await peopleApi.deleteSplit(transaction.id)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t remove the people'))
      setConfirmRemove(false)
    } finally {
      setSaving(false)
    }
  }

  const valueLabel = mode === 'amount' ? 'Amount' : mode === 'percent' ? 'Percent' : 'Shares'

  return (
    <div className="people-sheet">
      <p className="people-sheet-subject">
        {transaction.description || 'Untitled'} · <span className="mono">{formatCurrency(transaction.amount, currency)}</span>
      </p>

      <section className="people-sheet-section">
        <div className="people-sheet-section-head">
          <h3>{spending ? 'Who’s in on this?' : 'Who sent it?'}</h3>
          {people.length > 0 && (
            <button type="button" className="text-button" onClick={() => setPicking((v) => !v)}>
              {picking ? 'Done' : 'Add or remove'}
            </button>
          )}
        </div>
        {picking && <ContactPicker multiple selectedIds={people.map((p) => p.contactId)} onChange={setSelected} />}
      </section>

      {people.length > 0 && result && (
        <section className="people-sheet-section">
          <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={changeMode} ariaLabel="How to split" />
          <ul className="split-rows">
            <li className="split-row">
              <span className="person-initials is-me" aria-hidden="true">
                You
              </span>
              <span className="split-row-name">
                You
                <span className="split-row-sub">{spending ? 'Your cost' : 'Yours'}</span>
              </span>
              {mode === 'equal' && (
                <label className="split-row-include">
                  <input type="checkbox" checked={Number(myValue) > 0} onChange={(e) => setMyValue(e.target.checked ? '1' : '0')} />
                  Include me
                </label>
              )}
              {mode === 'shares' && (
                <input className="split-row-input" inputMode="decimal" aria-label="Your shares" value={myValue} onChange={(e) => setMyValue(e.target.value)} />
              )}
              <span className="split-row-amount mono">{formatCurrency(result.myShare, currency)}</span>
            </li>
            {people.map((p, i) => {
              return (
                <li key={p.contactId} className="split-row">
                  <PersonInitials name={nameOf(p.contactId)} />
                  <span className="split-row-name">
                    {nameOf(p.contactId)}
                    <span className="split-row-sub">{spending ? 'Owes you' : 'Sent you'}</span>
                  </span>
                  {mode !== 'equal' && (
                    <input
                      className="split-row-input"
                      inputMode="decimal"
                      aria-label={`${nameOf(p.contactId)} ${valueLabel.toLowerCase()}`}
                      value={p.value}
                      onChange={(e) => setPeople((list) => list.map((d, j) => (j === i ? { ...d, value: e.target.value } : d)))}
                    />
                  )}
                  <span className="split-row-amount mono">{formatCurrency(result.shares[i], currency)}</span>
                </li>
              )
            })}
          </ul>
          <label>
            Note
            <input type="text" maxLength={500} value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
          </label>
          {result.problem ? (
            <Alert variant="error">{PROBLEMS[result.problem]}</Alert>
          ) : (
            <p className="people-sheet-summary">
              {spending ? (
                <>
                  Added to what they owe you <strong className="mono">{formatCurrency(theirs, currency)}</strong>
                  {result.myShare > 0 ? (
                    <>
                      {' '}
                      · your cost <strong className="mono">{formatCurrency(result.myShare, currency)}</strong>
                    </>
                  ) : (
                    ' · a loan, none of it is your cost'
                  )}
                </>
              ) : (
                <>
                  Comes off what they owe you <strong className="mono">{formatCurrency(theirs, currency)}</strong>. If they didn’t owe you that much, the rest is
                  what you owe them.
                </>
              )}
            </p>
          )}
        </section>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {confirmRemove ? (
        <div className="people-sheet-confirm">
          <p>Remove the people from this transaction? Their balances will no longer include it.</p>
          <div className="people-sheet-actions">
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void remove()} loading={saving}>
              Remove people
            </Button>
          </div>
        </div>
      ) : (
        <div className="people-sheet-actions">
          {existing && (
            <Button variant="danger" onClick={() => setConfirmRemove(true)} className="people-sheet-actions-start">
              Remove people
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!result || !!result.problem}>
            Save
          </Button>
        </div>
      )}
    </div>
  )
}
