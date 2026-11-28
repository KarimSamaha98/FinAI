import type { ReactNode } from 'react'
import { formatCurrency } from '../../lib/formatCurrency'
import { PersonInitials } from '../people/PersonInitials'

interface PersonCardProps {
  name: string
  /** The user's own card: "You" initials. */
  isMe?: boolean
  /** Under the name: "Paid", "Expected", "Your share"… */
  status: string
  /** Their share, in the card's corner (already signed for display). */
  amount: number
  currencyCode: string
  /** Still expected: the card is dashed, like a transaction that hasn't happened yet. */
  expected?: boolean
  /** Opens the person (the name becomes a link). */
  onOpen?: () => void
  /** Inline control beside the amount (the split's amount or % field, Include me). */
  control?: ReactNode
  /** What's happened: payments, forgiven. */
  children?: ReactNode
  /** Buttons along the bottom (Mark as paid, Forgive). */
  actions?: ReactNode
}

/**
 * A person's part of a group, drawn like a transaction card: solid once it's
 * settled, dashed while a payment is still expected.
 */
export function PersonCard({ name, isMe = false, status, amount, currencyCode, expected = false, onOpen, control, children, actions }: PersonCardProps) {
  return (
    <li className={`person-card${expected ? ' is-expected' : ''}`}>
      <div className="person-card-head">
        {isMe ? (
          <span className="person-initials is-me" aria-hidden="true">
            You
          </span>
        ) : (
          <PersonInitials name={name} />
        )}
        <span className="person-card-main">
          {onOpen ? (
            <button type="button" className="person-card-name text-button" onClick={onOpen}>
              {name}
            </button>
          ) : (
            <span className="person-card-name">{name}</span>
          )}
          <span className="person-card-status">{status}</span>
        </span>
        {control}
        <span className="person-card-amount mono">{formatCurrency(amount, currencyCode)}</span>
      </div>
      {children && <ul className="person-card-lines">{children}</ul>}
      {actions && <div className="person-card-actions">{actions}</div>}
    </li>
  )
}
