import { useState } from 'react'
import type { PersonGroup } from 'shared-types'
import { CheckIcon, ChevronLeftIcon, PencilIcon, TrashIcon } from '../../components/icons'
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

/** One person: the balance with them, and every group they're in. The People page's right-hand panel. */
export function PersonDetail({ contactId, onBack }: PersonDetailProps) {
  const { person, loading, error } = usePerson(contactId)
  const { hidden } = usePrivacy()
  const [settling, setSettling] = useState(false)
  const [openGroup, setOpenGroup] = useState<PersonGroup | null>(null)
  const [editing, setEditing] = useState<null | 'menu' | 'rename'>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const summary = person?.summary
  const name = summary?.contact.displayName ?? ''

  async function act(request: () => Promise<unknown>, failure: string) {
    setActionError(null)
    try {
      await request()
    } catch (err) {
      setActionError(apiErrorMessage(err, failure))
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

          {person.groups.length === 0 ? (
            <p className="person-empty">Nothing with {name} yet. Open a transaction and choose “Group” to share it with them.</p>
          ) : (
            <section className="person-section">
              <h2>Activity</h2>
              <Card className="person-list">
                {person.groups.map((group) => (
                  <GroupRow
                    key={group.groupId}
                    group={group}
                    hidden={hidden}
                    // Something to do: forgive what's still expected, or undo forgiving.
                    onOpen={group.forgiven !== 0 || (group.share !== 0 && group.outstanding !== 0 && Math.sign(group.outstanding) === Math.sign(group.share)) ? () => setOpenGroup(group) : null}
                  />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {openGroup && (
        <ActionMenu
          open
          onClose={() => setOpenGroup(null)}
          title={openGroup.label}
          summary={{ detail: `${formatDate(openGroup.date)} · ${statusText(openGroup, name)}`, value: formatCurrency(Math.abs(openGroup.share), openGroup.currencyCode) }}
          actions={[
            ...(openGroup.outstanding !== 0 && openGroup.share !== 0 && Math.sign(openGroup.outstanding) === Math.sign(openGroup.share)
              ? [
                  {
                    label: 'Forgive',
                    detail: openGroup.share > 0 ? `Let go of the ${formatCurrency(openGroup.outstanding, openGroup.currencyCode)} still expected` : `Keep the ${formatCurrency(-openGroup.outstanding, openGroup.currencyCode)} you owe`,
                    icon: <CheckIcon />,
                    confirm: { title: 'Forgive it?', message: `Your balance with ${name} will change.`, confirmLabel: 'Forgive' },
                    onClick: () => void act(() => peopleApi.forgive(contactId, openGroup.groupId), 'Couldn’t forgive it'),
                  },
                ]
              : []),
            ...(openGroup.forgiven !== 0
              ? [
                  {
                    label: 'Undo forgive',
                    detail: 'It’s expected again',
                    icon: <TrashIcon />,
                    variant: 'danger' as const,
                    confirm: { title: 'Undo forgiving?', message: `Your balance with ${name} will change back.`, confirmLabel: 'Undo' },
                    onClick: () => void act(() => peopleApi.unforgive(contactId, openGroup.groupId), 'Couldn’t undo it'),
                  },
                ]
              : []),
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
            person.groups.length === 0
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
                  detail: 'Only once they’re in no group: take them out of each one first',
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

/** Where a person's part in a group stands, in words. */
function statusText(group: PersonGroup, name: string): string {
  if (group.share === 0) return group.paid > 0 ? `${name} paid you` : `You paid ${name}`
  if (group.outstanding === 0) return group.forgiven !== 0 ? 'Forgiven' : group.share > 0 ? 'Paid' : 'You paid'
  if (Math.sign(group.outstanding) !== Math.sign(group.share)) return group.outstanding < 0 ? `You owe ${name} the extra` : `${name} owes you the rest`
  return group.share > 0 ? 'Expected' : 'You owe it'
}

/**
 * One line per group: what, when, where it stands, and what's still
 * expected (+ they owe the user, − the user owes them); settled ones show
 * their share.
 */
function GroupRow({ group, hidden, onOpen }: { group: PersonGroup; hidden: boolean; onOpen: (() => void) | null }) {
  const open = group.outstanding !== 0
  const shown = open ? group.outstanding : group.share
  const content = (
    <>
      <span className="person-row-main">
        <span className="person-row-title">{group.label}</span>
        <span className="person-row-sub">
          {formatDate(group.date)} · {statusText(group, 'They')}
        </span>
      </span>
      <span className={`mono person-row-amount ${open ? (shown > 0 ? 'is-owed' : 'is-owe') : 'is-settled'}`}>
        {open ? (shown > 0 ? '+' : '−') : ''}
        {hidden ? '••••' : formatCurrency(Math.abs(shown), group.currencyCode)}
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
