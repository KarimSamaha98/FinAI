import { useState } from 'react'
import type { PersonEntry } from 'shared-types'
import { ChevronLeftIcon, PencilIcon, TrashIcon } from '../../components/icons'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { SkeletonBlock } from '../../components/Skeleton'
import { PrivateAmount } from '../../components/PrivateAmount'
import { ActionMenu } from '../../components/ActionMenu'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { isFxUnavailable } from '../../lib/apiClient'
import { usePrivacy } from '../../context/PrivacyContext'
import { apiErrorMessage, peopleApi, usePerson } from '../../hooks/usePeople'
import { PersonInitials } from './PersonInitials'
import { SettleUpWizard } from './SettleUpWizard'
import { RenameSheet } from './RenameSheet'
import { personStatus } from './peopleText'

interface PersonDetailProps {
  contactId: string
  /** Back to the list of people (phone widths, where the list and the person don't fit side by side). */
  onBack: () => void
}

/** One person: the balance with them, and the transactions that moved it. The People page's right-hand panel. */
export function PersonDetail({ contactId, onBack }: PersonDetailProps) {
  const { person, loading, error } = usePerson(contactId)
  const { hidden } = usePrivacy()
  const [settling, setSettling] = useState(false)
  const [undoEntry, setUndoEntry] = useState<PersonEntry | null>(null)
  const [editing, setEditing] = useState<null | 'menu' | 'rename'>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const summary = person?.summary
  const name = summary?.contact.displayName ?? ''

  async function undo(entry: PersonEntry) {
    setActionError(null)
    try {
      await peopleApi.deleteEntry(entry.id)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Couldn’t undo it'))
    }
  }

  async function remove() {
    setActionError(null)
    try {
      await peopleApi.deleteContact(contactId)
      onBack()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Couldn’t delete this person'))
    }
  }

  const back = (
    <button type="button" className="text-button person-detail-back" onClick={onBack}>
      <ChevronLeftIcon /> People
    </button>
  )

  if (isFxUnavailable(error)) {
    return (
      <section className="person-detail">
        {back}
        <Alert variant="error">We couldn’t fetch exchange rates, so these totals can’t be shown right now.</Alert>
      </section>
    )
  }

  const status = summary ? personStatus(summary) : null

  return (
    <section className="person-detail" aria-label={name || 'Person'}>
      {back}
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <SkeletonBlock height="12rem" />}

      {summary && person && status && (
        <>
          <Card className="person-hero">
            <PersonInitials name={name} size="lg" />
            <div className="person-hero-text">
              <h2 className="person-hero-name">{name}</h2>
              <span className={`person-status is-${status.tone}`}>{status.label}</span>
              {summary.net !== 0 && <PrivateAmount amount={Math.abs(summary.net)} currencyCode={summary.homeCurrencyCode} className="mono person-hero-amount" />}
            </div>
            <div className="person-hero-actions">
              <Button variant="secondary" onClick={() => setEditing('menu')}>
                Edit
              </Button>
              {summary.balances.length > 0 && (
                <Button variant="tinted" onClick={() => setSettling(true)}>
                  Settle up
                </Button>
              )}
            </div>
          </Card>

          {actionError && <Alert variant="error">{actionError}</Alert>}

          {person.entries.length === 0 ? (
            <p className="person-empty">Nothing with {name} yet. Open a transaction and choose “Split with people” or “Received from someone”.</p>
          ) : (
            <section className="person-section">
              <h2>Activity</h2>
              <Card className="person-list">
                {person.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} hidden={hidden} onOpen={entry.kind === 'writeoff' ? () => setUndoEntry(entry) : null} />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {undoEntry && (
        <ActionMenu
          open
          onClose={() => setUndoEntry(null)}
          title={undoEntry.label}
          summary={{ detail: formatDate(undoEntry.date), value: formatCurrency(Math.abs(undoEntry.amount), undoEntry.currencyCode) }}
          actions={[
            {
              label: 'Undo settle up',
              detail: 'The balance comes back and the adjustment is removed',
              icon: <TrashIcon />,
              variant: 'danger',
              confirm: { title: 'Undo this settle up?', message: `Your balance with ${name} will change back.`, confirmLabel: 'Undo' },
              onClick: () => void undo(undoEntry),
            },
          ]}
        />
      )}
      {editing === 'menu' && person && (
        <ActionMenu
          open
          onClose={() => setEditing(null)}
          title={name}
          actions={[
            { label: 'Rename', detail: 'Change how their name shows everywhere', icon: <PencilIcon />, onClick: () => setEditing('rename') },
            person.entries.length === 0
              ? {
                  label: 'Delete',
                  detail: `Remove ${name} from your people`,
                  icon: <TrashIcon />,
                  variant: 'danger',
                  confirm: { title: `Delete ${name}?`, message: 'They’ll be removed from your people.', confirmLabel: 'Delete' },
                  onClick: () => void remove(),
                }
              : {
                  label: 'Delete',
                  detail: 'Only once they have no activity: remove them from their transactions and undo any settle up first',
                  icon: <TrashIcon />,
                  variant: 'danger',
                  onClick: () => void remove(),
                },
          ]}
        />
      )}
      {editing === 'rename' && <RenameSheet contactId={contactId} name={name} onClose={() => setEditing(null)} />}
      {settling && summary && <SettleUpWizard summary={summary} onClose={() => setSettling(false)} />}
    </section>
  )
}

/**
 * One line per transaction: what, when, and how much it moved the balance
 * (+ they owe you more, − they owe you less / you owe them more).
 */
function EntryRow({ entry, hidden, onOpen }: { entry: PersonEntry; hidden: boolean; onOpen: (() => void) | null }) {
  const content = (
    <>
      <span className="person-row-main">
        <span className="person-row-title">{entry.label}</span>
        <span className="person-row-sub">{formatDate(entry.date)}</span>
      </span>
      <span className={`mono person-row-amount ${entry.amount > 0 ? 'is-owed' : 'is-owe'}`}>
        {entry.amount > 0 ? '+' : '−'}
        {hidden ? '••••' : formatCurrency(Math.abs(entry.amount), entry.currencyCode)}
      </span>
    </>
  )
  return onOpen ? (
    <button type="button" className="person-row" onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="person-row is-static">{content}</div>
  )
}
