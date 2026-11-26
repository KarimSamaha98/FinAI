import type { DisplayRowPeople } from 'shared-types'

/** One person entry; every entry is tied to a transaction (a share, or a settle-up adjustment). */
export interface RealViewEntry {
  transactionId: string
  contactId: string
  contactName: string
  kind: 'share' | 'writeoff'
  amount: number
}

export interface PeopleRealView {
  /** Added to a transaction's amount in the real view (Σ its share entries). */
  deltaByTransactionId: Map<string, number>
  /** The ledger subline for every transaction that involves people. */
  infoByTransactionId: Map<string, DisplayRowPeople>
}

/**
 * The real view of transactions tagged with people. A share entry is the
 * opposite of that person's portion of the transaction, so adding the
 * entries to the amount leaves the user's own portion: a −120 dinner with
 * Sam's +60 shows −60, Sam's +60 transfer with its −60 entry shows 0 (and is
 * hidden). A settle-up adjustment is shown at face value — it is the
 * user's real gain or loss.
 */
export function computePeopleRealView(entries: RealViewEntry[]): PeopleRealView {
  const deltaCents = new Map<string, number>()
  const infoByTransactionId = new Map<string, DisplayRowPeople>()
  for (const entry of entries) {
    if (entry.kind === 'share') {
      deltaCents.set(entry.transactionId, (deltaCents.get(entry.transactionId) ?? 0) + Math.round(entry.amount * 100))
    }
    const info = infoByTransactionId.get(entry.transactionId) ?? { kind: entry.kind === 'share' ? 'split' : 'settle_up', names: [], contactIds: [] }
    if (!info.contactIds.includes(entry.contactId)) {
      info.contactIds.push(entry.contactId)
      info.names.push(entry.contactName)
    }
    infoByTransactionId.set(entry.transactionId, info)
  }
  return {
    deltaByTransactionId: new Map([...deltaCents].map(([id, c]) => [id, c / 100])),
    infoByTransactionId,
  }
}
