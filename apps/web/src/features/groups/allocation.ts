import { allocateInOrder, type PaymentAllocation, type PersonGroup } from 'shared-types'

/**
 * What a person still owes (or is owed) that a payment of this sign and
 * currency can settle, oldest first.
 */
export function payableGroups(groups: PersonGroup[], paymentAmount: number, currencyCode: string): PersonGroup[] {
  return groups
    .filter((g) => g.currencyCode === currencyCode && g.share !== 0 && g.outstanding !== 0 && Math.sign(g.outstanding) === Math.sign(paymentAmount))
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
}

/** Spreads a payment over what's expected, oldest first. */
export function autoAllocate(groups: PersonGroup[], available: number): PaymentAllocation[] {
  const parts = allocateInOrder(available, groups.map((g) => g.outstanding))
  return groups.flatMap((g, i) => (parts[i] > 0 ? [{ groupId: g.groupId, amount: parts[i] }] : []))
}
