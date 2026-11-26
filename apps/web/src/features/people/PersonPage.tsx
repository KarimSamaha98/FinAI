import { useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PersonEntry } from 'shared-types'
import { PageHeader } from '../../components/BackButton'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { SkeletonBlock } from '../../components/Skeleton'
import { PrivateAmount } from '../../components/PrivateAmount'
import { ActionMenu } from '../../components/ActionMenu'
import { TrashIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { isFxUnavailable } from '../../lib/apiClient'
import { usePrivacy } from '../../context/PrivacyContext'
import { apiErrorMessage, peopleApi, usePerson } from '../../hooks/usePeople'
import { PersonInitials } from './PersonInitials'
import { CashSheet } from './CashSheet'
import { balancesDetail, balanceText, personStatus } from './peopleText'

/** One person: the running balance with them, and everything that moved it. */
export function PersonPage() {
  const { contactId = '' } = useParams()
  const { person, loading, error } = usePerson(contactId)
  const { hidden } = usePrivacy()
  const [sheet, setSheet] = useState<null | 'cash' | 'settle'>(null)
  const [menuEntry, setMenuEntry] = useState<PersonEntry | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const summary = person?.summary
  const name = summary?.contact.displayName ?? ''

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setActionError(null)
    setSaving(true)
    try {
      await action()
      return true
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback))
      return false
    } finally {
      setSaving(false)
    }
  }

  if (isFxUnavailable(error)) {
    return (
      <main className="person-page">
        <PageHeader title="Person" backTo="/" />
        <Alert variant="error">We couldn’t fetch exchange rates, so these totals can’t be shown right now.</Alert>
      </main>
    )
  }

  const status = summary ? personStatus(summary) : null
  const detail = summary ? balancesDetail(summary) : null
  // Cash defaults to a currency already in play with them, else home.
  const cashCurrencies = summary ? [...new Set([...summary.balances.map((b) => b.currencyCode), summary.homeCurrencyCode])] : []

  return (
    <main className="person-page">
      <PageHeader title={name || 'Person'} backTo="/" />
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <SkeletonBlock height="12rem" />}

      {summary && person && status && (
        <>
          <Card className="person-hero">
            <PersonInitials name={name} size="lg" />
            <div className="person-hero-text">
              <span className={`person-status is-${status.tone}`}>{status.label}</span>
              {summary.net !== 0 && <PrivateAmount amount={Math.abs(summary.net)} currencyCode={summary.homeCurrencyCode} className="mono person-hero-amount" />}
              {detail && <span className="person-hero-detail">{hidden ? '••••' : detail}</span>}
            </div>
            <div className="person-hero-actions">
              <Button variant="secondary" onClick={() => setSheet('cash')}>
                Record cash payment
              </Button>
              {summary.balances.length > 0 && (
                <Button variant="tinted" onClick={() => setSheet('settle')}>
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
                  <EntryRow key={entry.id} entry={entry} name={name} hidden={hidden} onOpen={entry.kind === 'share' ? null : () => setMenuEntry(entry)} />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {menuEntry && (
        <ActionMenu
          open
          onClose={() => setMenuEntry(null)}
          title={menuEntry.label}
          summary={{ detail: formatDate(menuEntry.date), value: formatCurrency(Math.abs(menuEntry.amount), menuEntry.currencyCode) }}
          actions={[
            {
              label: menuEntry.kind === 'writeoff' ? 'Undo settle up' : 'Delete',
              detail: menuEntry.kind === 'writeoff' ? 'The balance comes back and the adjustment is removed' : 'Remove this cash payment',
              icon: <TrashIcon />,
              variant: 'danger',
              confirm: {
                title: menuEntry.kind === 'writeoff' ? 'Undo this settle up?' : 'Delete this payment?',
                message: `Your balance with ${name} will change back.`,
                confirmLabel: menuEntry.kind === 'writeoff' ? 'Undo' : 'Delete',
              },
              onClick: () => void run(() => peopleApi.deleteEntry(menuEntry.id), 'Couldn’t remove it'),
            },
          ]}
        />
      )}
      {sheet === 'cash' && summary && <CashSheet contactId={contactId} name={name} currencies={cashCurrencies} onClose={() => setSheet(null)} />}
      {sheet === 'settle' && summary && (
        <Modal open onClose={() => setSheet(null)} title={`Settle up with ${name}?`} size="sm">
          <div className="people-sheet">
            <p>
              {summary.net > 0
                ? `${name} owes you ${formatCurrency(summary.net, summary.homeCurrencyCode)}. Settling up writes that off; it counts as spending today.`
                : summary.net < 0
                  ? `You owe ${name} ${formatCurrency(-summary.net, summary.homeCurrencyCode)}. Settling up clears it; it counts as income today.`
                  : `Your balances with ${name} cancel out across currencies. Settling up clears each of them.`}
            </p>
            {detail && <p className="people-sheet-hint">{detail}</p>}
            <p className="people-sheet-hint">Use this for what’s left over, like rounding. You can undo it from the activity list.</p>
            <div className="people-sheet-actions">
              <Button variant="secondary" onClick={() => setSheet(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={saving}
                onClick={() => void run(() => peopleApi.settleUp(contactId), 'Couldn’t settle up').then((ok) => ok && setSheet(null))}
              >
                Settle up
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}

function EntryRow({ entry, name, hidden, onOpen }: { entry: PersonEntry; name: string; hidden: boolean; onOpen: (() => void) | null }) {
  const money = (n: number) => (hidden ? '••••' : formatCurrency(n, entry.currencyCode))
  const sub =
    entry.kind === 'writeoff'
      ? 'Settled up'
      : entry.kind === 'cash'
        ? 'Cash'
        : entry.transactionAmount != null && entry.transactionAmount < 0
          ? `You paid ${money(-entry.transactionAmount)}`
          : `${name} sent ${money(Math.abs(entry.amount))}`
  const content = (
    <>
      <span className="person-row-main">
        <span className="person-row-title">{entry.label}</span>
        <span className="person-row-sub">
          {formatDate(entry.date)} · {sub}
        </span>
      </span>
      <span className="person-row-end">
        <span className={`mono person-row-amount ${entry.amount > 0 ? 'is-owed' : 'is-owe'}`}>
          {entry.amount > 0 ? '+' : '−'}
          {money(Math.abs(entry.amount))}
        </span>
        <span className="person-row-balance">{hidden ? '••••' : balanceText(entry.balanceAfter, entry.currencyCode)}</span>
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
