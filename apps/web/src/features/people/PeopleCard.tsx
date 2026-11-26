import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/Card'
import { PrivateAmount } from '../../components/PrivateAmount'
import { SkeletonBlock } from '../../components/Skeleton'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { usePeople } from '../../hooks/usePeople'
import { usePrivacy } from '../../context/PrivacyContext'
import { PersonInitials } from './PersonInitials'
import { personStatus } from './peopleText'

/**
 * Home's People table: one row per person with a balance — they owe you or
 * you owe them, never both — and the amount. Settled people are behind
 * "Show settled".
 */
export function PeopleCard() {
  const { people, loading } = usePeople()
  const { hidden } = usePrivacy()
  const [showSettled, setShowSettled] = useState(false)

  if (loading) return <SkeletonBlock height="8rem" className="home-skeleton-bucket" />
  if (!people) return null

  const open = people.people.filter((p) => p.net !== 0)
  const settledCount = people.people.length - open.length
  const rows = showSettled ? people.people : open
  const currency = people.homeCurrencyCode
  const money = (n: number) => (hidden ? '••••' : formatCurrency(n, currency))

  return (
    <Card className="people-card">
      <div className="people-card-head">
        <div>
          <h2>People</h2>
          {open.length > 0 && (
            <p className="people-card-totals">
              {people.owedToMe > 0 && (
                <>
                  Owed to you <strong className="mono">{money(people.owedToMe)}</strong>
                </>
              )}
              {people.owedToMe > 0 && people.iOwe > 0 && ' · '}
              {people.iOwe > 0 && (
                <>
                  You owe <strong className="mono">{money(people.iOwe)}</strong>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {open.length === 0 && !showSettled && (
        <p className="people-card-empty">
          You’re settled up with everyone. To share a cost, open a transaction and choose “Split with people”; for money someone sent you, “Received from someone”.
        </p>
      )}

      {rows.length > 0 && (
        <div className="people-table" role="table" aria-label="People">
          {rows.map((person) => {
            const status = personStatus(person)
            return (
              <Link key={person.contact.id} to={`/people/${person.contact.id}`} className="people-row" role="row">
                <PersonInitials name={person.contact.displayName} />
                <span className="people-row-name" role="cell">
                  {person.contact.displayName}
                  {person.lastActivityDate && <span className="people-row-detail">Last activity {formatDate(person.lastActivityDate)}</span>}
                </span>
                <span className={`person-status is-${status.tone}`} role="cell">
                  {status.label}
                </span>
                <span role="cell" className="people-row-amount">
                  {person.net !== 0 && <PrivateAmount amount={Math.abs(person.net)} currencyCode={currency} className="mono" />}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {settledCount > 0 && (
        <button type="button" className="text-button people-card-toggle" onClick={() => setShowSettled((v) => !v)}>
          {showSettled ? 'Hide settled' : `Show settled (${settledCount})`}
        </button>
      )}
    </Card>
  )
}
