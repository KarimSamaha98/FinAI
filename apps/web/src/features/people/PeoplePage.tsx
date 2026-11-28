import { Navigate, useParams } from 'react-router-dom'
import type { PersonSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { SkeletonBlock } from '../../components/Skeleton'
import { PrivateAmount } from '../../components/PrivateAmount'
import { useUrlState } from '../../hooks/useUrlState'
import { useContacts, usePeople } from '../../hooks/usePeople'
import { PersonInitials } from './PersonInitials'
import { PersonDetail } from './PersonDetail'
import { personStatus } from './peopleText'

/**
 * People: everyone the user has added, with their balance, and the selected
 * person's balance and activity beside them (?selected=id, like Transactions'
 * ?selected= for accounts). Home's People rows link here with one selected.
 * On a phone the list and the person take turns.
 */
export function PeoplePage() {
  const [params, updateParams] = useUrlState()
  const selectedId = params.get('selected')
  const { contacts, loading: contactsLoading, error: contactsError } = useContacts()
  const { people, loading: peopleLoading } = usePeople()

  // Home's summary lists only open balances; everyone else is settled.
  const balanceById = new Map<string, PersonSummary>((people?.people ?? []).map((p) => [p.contact.id, p]))
  const rows = [...contacts].sort(
    (a, b) =>
      Math.abs(balanceById.get(b.id)?.net ?? 0) - Math.abs(balanceById.get(a.id)?.net ?? 0) || a.displayName.localeCompare(b.displayName),
  )
  const selected = selectedId && contacts.some((c) => c.id === selectedId) ? selectedId : null
  const currency = people?.homeCurrencyCode

  return (
    <main className={`people-page-wrap${selected ? ' has-selection' : ''}`}>
      <h1>People</h1>
      {contactsError && <Alert variant="error">{contactsError}</Alert>}
      {contactsLoading || peopleLoading ? (
        <SkeletonBlock height="16rem" />
      ) : rows.length === 0 ? (
        <p className="person-empty">No one yet. Open a transaction and choose “Split with people” or “Received from someone” to add someone.</p>
      ) : (
        <div className={`people-page${selected ? ' has-selection' : ''}`}>
          <Card className="people-list">
            <ul aria-label="People">
              {rows.map((contact) => {
                const balance = balanceById.get(contact.id)
                const status = personStatus({ net: balance?.net ?? 0 })
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      className={`people-list-row${contact.id === selected ? ' is-selected' : ''}`}
                      aria-current={contact.id === selected ? 'true' : undefined}
                      onClick={() => updateParams({ selected: contact.id })}
                    >
                      <PersonInitials name={contact.displayName} />
                      <span className="people-list-name">
                        {contact.displayName}
                        <span className={`people-list-status is-${status.tone}`}>{status.label}</span>
                      </span>
                      {balance && balance.net !== 0 && currency && <PrivateAmount amount={Math.abs(balance.net)} currencyCode={currency} className="mono people-list-amount" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
          {selected ? (
            <PersonDetail key={selected} contactId={selected} onBack={() => updateParams({ selected: null })} />
          ) : (
            <p className="person-empty people-page-placeholder">Pick someone to see your balance and activity with them.</p>
          )}
        </div>
      )}
    </main>
  )
}

/** Old /people/:id links open the People page with that person selected. */
export function PersonRedirect() {
  const { contactId = '' } = useParams()
  return <Navigate to={`/people?selected=${contactId}`} replace />
}
