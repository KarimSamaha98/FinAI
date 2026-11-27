import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { groupShares, reconciliationGroupMembers, transactions } from '../../db/schema.js'
import { memberAmount } from '../groups/group-store.js'

/**
 * Balances with people, shared by the people service and net worth. Plain
 * functions over a tenant transaction: every caller must already be inside
 * runInTenantContext.
 */

/** One movement of a balance with a person, signed like the balance (+ they owe the user more). */
export interface PersonEvent {
  contactId: string
  currencyCode: string
  amount: number
  date: string
}

/**
 * Everything that moved the user's balances with people:
 * - a share, + its amount on its group's date (the main transaction's);
 * - forgiving, − what was forgiven on the day it was;
 * - a payment, − its part of the transaction on the transaction's date.
 * A balance is the sum; at a date, the sum of what's dated on or before it.
 */
export async function loadPersonEvents(tx: Db, contactId?: string): Promise<PersonEvent[]> {
  const shares = await tx
    .select()
    .from(groupShares)
    .where(contactId ? eq(groupShares.contactId, contactId) : undefined)
  const payments = await tx
    .select({ member: reconciliationGroupMembers, transaction: transactions })
    .from(reconciliationGroupMembers)
    .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
    .where(contactId ? eq(reconciliationGroupMembers.contactId, contactId) : isNotNull(reconciliationGroupMembers.contactId))
  const dates = await groupDates(tx, [...new Set(shares.map((s) => s.groupId))])

  const events: PersonEvent[] = []
  for (const s of shares) {
    const date = dates.get(s.groupId)
    if (!date) continue
    events.push({ contactId: s.contactId, currencyCode: s.currencyCode, amount: Number(s.amount), date })
    if (s.forgivenOn) events.push({ contactId: s.contactId, currencyCode: s.currencyCode, amount: -Number(s.forgiven), date: s.forgivenOn })
  }
  for (const { member, transaction } of payments) {
    events.push({ contactId: member.contactId!, currencyCode: transaction.currencyCode, amount: -memberAmount(member, transaction), date: transaction.date })
  }
  return events
}

/** Each group's date: its biggest own transaction's (the anchor's). */
async function groupDates(tx: Db, groupIds: string[]): Promise<Map<string, string>> {
  if (groupIds.length === 0) return new Map()
  const rows = await tx
    .select({ groupId: reconciliationGroupMembers.groupId, part: reconciliationGroupMembers.amount, amount: transactions.amount, date: transactions.date })
    .from(reconciliationGroupMembers)
    .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
    .where(and(inArray(reconciliationGroupMembers.groupId, groupIds), isNull(reconciliationGroupMembers.contactId)))
  const best = new Map<string, { size: number; date: string }>()
  for (const r of rows) {
    const size = Math.abs(memberAmount({ amount: r.part }, { amount: r.amount }))
    const current = best.get(r.groupId)
    if (!current || size > current.size) best.set(r.groupId, { size, date: r.date })
  }
  return new Map([...best].map(([id, b]) => [id, b.date]))
}

/** Σ events per currency, in cents, leaving out currencies that net to zero. */
export function balancesOf(events: Pick<PersonEvent, 'currencyCode' | 'amount'>[]): Map<string, number> {
  const byCurrency = new Map<string, number>()
  for (const e of events) byCurrency.set(e.currencyCode, (byCurrency.get(e.currencyCode) ?? 0) + Math.round(e.amount * 100))
  for (const [code, c] of byCurrency) if (c === 0) byCurrency.delete(code)
  return byCurrency
}

export interface PeopleBalanceHistory {
  currencyCode: string
  /** Σ events now (signed: + owed to the user). */
  now: number
  /** Σ events dated on or before `cutoff`. */
  at: (cutoff: string) => number
}

/** The user's balances with people per currency, now and at any date (for net worth). */
export async function loadPeopleBalances(tx: Db): Promise<PeopleBalanceHistory[]> {
  const byCurrency = new Map<string, { cents: number; date: string }[]>()
  for (const e of await loadPersonEvents(tx)) {
    const list = byCurrency.get(e.currencyCode) ?? []
    list.push({ cents: Math.round(e.amount * 100), date: e.date })
    byCurrency.set(e.currencyCode, list)
  }
  return [...byCurrency].map(([currencyCode, list]) => ({
    currencyCode,
    now: list.reduce((sum, e) => sum + e.cents, 0) / 100,
    at: (cutoff: string) => list.filter((e) => e.date <= cutoff).reduce((sum, e) => sum + e.cents, 0) / 100,
  }))
}
