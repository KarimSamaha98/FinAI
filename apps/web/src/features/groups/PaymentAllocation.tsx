import { useEffect, useMemo, useState } from 'react'
import type { PaymentAllocation as Allocation } from 'shared-types'
import { Alert } from '../../components/Alert'
import { SkeletonBlock } from '../../components/Skeleton'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { usePerson } from '../../hooks/usePeople'
import { autoAllocate, payableGroups } from './allocation'

const toCents = (value: number) => Math.round(value * 100)

interface PaymentAllocationProps {
  contactId: string
  name: string
  /** What of the payment can still be used, signed like the transaction. */
  available: number
  currencyCode: string
  /** Called with the parts whenever they change; null while they don't add up. */
  onChange: (allocations: Allocation[] | null) => void
}

/**
 * Divides one payment between the groups a person owes in: filled in oldest
 * first, and each part can be changed. Whatever isn't used stays with the
 * transaction (it shows in the ledger as it is).
 */
export function PaymentAllocation({ contactId, name, available, currencyCode, onChange }: PaymentAllocationProps) {
  const { person, loading } = usePerson(contactId)
  const groups = useMemo(() => payableGroups(person?.groups ?? [], available, currencyCode), [person, available, currencyCode])
  const [edits, setEdits] = useState<Record<string, string>>({})

  const auto = useMemo(() => new Map(autoAllocate(groups, available).map((a) => [a.groupId, a.amount])), [groups, available])
  const values = groups.map((g) => edits[g.groupId] ?? String(auto.get(g.groupId) ?? 0))
  const parts = values.map((v) => Number(v) || 0)
  const used = parts.reduce((sum, p) => sum + toCents(p), 0)
  const tooMuch = groups.findIndex((g, i) => toCents(parts[i]) > Math.abs(toCents(g.outstanding)))
  const problem =
    used > Math.abs(toCents(available))
      ? `That’s more than the ${formatCurrency(Math.abs(available), currencyCode)} this payment has`
      : tooMuch >= 0
        ? `More than what’s expected for “${groups[tooMuch].label}”`
        : used === 0 && groups.length > 0
          ? 'Put some of it towards at least one'
          : null

  // Report the parts up whenever they change.
  const allocations = problem || groups.length === 0 ? null : groups.flatMap((g, i) => (parts[i] > 0 ? [{ groupId: g.groupId, amount: parts[i] }] : []))
  const key = JSON.stringify(allocations)
  useEffect(() => {
    if (!loading) onChange(key === 'null' ? null : (JSON.parse(key) as Allocation[]))
    // Only a change in the parts matters, not a new onChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading])

  if (loading) return <SkeletonBlock height="8rem" />
  if (groups.length === 0) {
    return <p className="wizard-hint">Nothing in {currencyCode} is expected {available > 0 ? `from ${name}` : `for ${name}`} right now.</p>
  }
  const left = Math.abs(toCents(available)) - used
  return (
    <>
      <ul className="allocation-rows">
        {groups.map((g, i) => (
          <li key={g.groupId} className="allocation-row">
            <span className="allocation-row-main">
              <span className="allocation-row-title">{g.label}</span>
              <span className="allocation-row-sub">
                {formatDate(g.date)} · {formatCurrency(Math.abs(g.outstanding), g.currencyCode)} expected
              </span>
            </span>
            <input
              className="split-row-input"
              inputMode="decimal"
              aria-label={`Towards ${g.label}`}
              value={values[i]}
              onChange={(e) => setEdits((current) => ({ ...current, [g.groupId]: e.target.value }))}
            />
          </li>
        ))}
      </ul>
      {problem ? (
        <Alert variant="error">{problem}</Alert>
      ) : left > 0 ? (
        <p className="wizard-hint">{formatCurrency(left / 100, currencyCode)} of it isn’t towards anything, so it stays in your transactions as it is.</p>
      ) : null}
    </>
  )
}
