import { Link } from 'react-router-dom'
import { Card } from '../../components/Card'
import { PrivateAmount } from '../../components/PrivateAmount'
import { SkeletonBlock } from '../../components/Skeleton'
import { usePeople } from '../../hooks/usePeople'
import { PersonInitials } from './PersonInitials'
import { personStatus } from './peopleText'

/** Home's People table: one row per person with an open balance — they owe you or you owe them — and the amount. */
export function PeopleCard() {
  const { people, loading } = usePeople()

  if (loading) return <SkeletonBlock height="8rem" className="home-skeleton-bucket" />
  if (!people) return null
  const currency = people.homeCurrencyCode

  return (
    <Card className="people-card">
      <h2>People</h2>

      {people.people.length === 0 ? (
        <p className="people-card-empty">
          You’re settled up with everyone. To share a cost, open a transaction and choose “Split with people”; for money someone sent you, “Received from someone”.
        </p>
      ) : (
        <div className="people-table" role="table" aria-label="People">
          {people.people.map((person) => {
            const status = personStatus(person)
            return (
              <Link key={person.contact.id} to={`/people?selected=${person.contact.id}`} className="people-row" role="row">
                <PersonInitials name={person.contact.displayName} />
                <span className="people-row-name" role="cell">
                  {person.contact.displayName}
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
    </Card>
  )
}
