import { ConflictException } from '@nestjs/common'
import { inArray, isNotNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { contacts, personEntries } from '../../db/schema.js'
import { computePeopleRealView, type PeopleRealView } from './people-real-view.js'

/**
 * Database helpers shared by the people service and the services people touch
 * (transactions, reporting, accounts, reconciliation, month splits). Plain
 * functions over a tenant transaction, so those services can call them
 * without a module dependency on PeopleModule. Every caller must already be
 * inside runInTenantContext.
 */

/** The ids among `transactionIds` that are tagged with people (or are a settle-up adjustment). */
export async function peopleLinkedTransactionIds(tx: Db, transactionIds: string[]): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set()
  const rows = await tx.select({ transactionId: personEntries.transactionId }).from(personEntries).where(inArray(personEntries.transactionId, transactionIds))
  return new Set(rows.map((r) => r.transactionId!))
}

export async function assertNotPeopleLinked(tx: Db, transactionIds: string[], action: string): Promise<void> {
  if ((await peopleLinkedTransactionIds(tx, transactionIds)).size > 0) {
    throw new ConflictException(`This transaction is shared with people and can’t be ${action}. Remove the people first.`)
  }
}

/** The real-view derivation for transactions involving people (see computePeopleRealView). */
export async function loadPeopleRealView(tx: Db): Promise<PeopleRealView> {
  const rows = await tx.select().from(personEntries).where(isNotNull(personEntries.transactionId))
  if (rows.length === 0) return { deltaByTransactionId: new Map(), infoByTransactionId: new Map() }
  const contactRows = await tx.select({ id: contacts.id, displayName: contacts.displayName }).from(contacts)
  const nameById = new Map(contactRows.map((c) => [c.id, c.displayName]))
  return computePeopleRealView(
    rows.map((r) => ({
      transactionId: r.transactionId!,
      contactId: r.contactId,
      contactName: nameById.get(r.contactId) ?? 'Someone',
      kind: r.kind === 'writeoff' ? 'writeoff' : 'share',
      amount: Number(r.amount),
    })),
  )
}

export interface PeopleBalanceHistory {
  currencyCode: string
  /** Σ entries now (signed: + owed to the user). */
  now: number
  /** Σ entries dated on or before `cutoff`. */
  at: (cutoff: string) => number
}

/** The user's balances with people per currency, now and at any date (for net worth). */
export async function loadPeopleBalances(tx: Db): Promise<PeopleBalanceHistory[]> {
  const rows = await tx.select({ currencyCode: personEntries.currencyCode, amount: personEntries.amount, date: personEntries.date }).from(personEntries)
  const byCurrency = new Map<string, { cents: number; date: string }[]>()
  for (const row of rows) {
    const list = byCurrency.get(row.currencyCode) ?? []
    list.push({ cents: Math.round(Number(row.amount) * 100), date: row.date })
    byCurrency.set(row.currencyCode, list)
  }
  return [...byCurrency].map(([currencyCode, list]) => ({
    currencyCode,
    now: list.reduce((sum, e) => sum + e.cents, 0) / 100,
    at: (cutoff: string) => list.filter((e) => e.date <= cutoff).reduce((sum, e) => sum + e.cents, 0) / 100,
  }))
}
