import { eq, inArray } from 'drizzle-orm'
import { groupNet, shareOutstanding, type DisplayRowTransfer, type Group, type GroupMember, type GroupShare } from 'shared-types'
import type { Db } from '../../db/client.js'
import { contacts, groupShares, reconciliationGroupMembers, reconciliationGroups, transactions } from '../../db/schema.js'

/**
 * Database helpers for groups, shared by the services groups touch (people,
 * reporting, transactions, month splits). Plain functions over a tenant
 * transaction: every caller must already be inside runInTenantContext.
 */

export type GroupRow = typeof reconciliationGroups.$inferSelect
export type MemberRow = typeof reconciliationGroupMembers.$inferSelect
export type ShareRow = typeof groupShares.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect

export interface LoadedMember {
  member: MemberRow
  transaction: TransactionRow
}

export interface LoadedGroup {
  group: GroupRow
  members: LoadedMember[]
  shares: ShareRow[]
}

/** The part of its transaction a member puts in its group, signed like the transaction. */
export function memberAmount(member: Pick<MemberRow, 'amount'>, transaction: Pick<TransactionRow, 'amount'>): number {
  return member.amount != null ? Number(member.amount) : Number(transaction.amount)
}

/** Groups with their members (and transactions) and shares. All of them when `groupIds` is omitted. */
export async function loadGroups(tx: Db, groupIds?: string[]): Promise<LoadedGroup[]> {
  if (groupIds && groupIds.length === 0) return []
  const groups = await tx
    .select()
    .from(reconciliationGroups)
    .where(groupIds ? inArray(reconciliationGroups.id, groupIds) : undefined)
  if (groups.length === 0) return []
  const ids = groups.map((g) => g.id)
  const [members, shares] = await Promise.all([
    tx
      .select({ member: reconciliationGroupMembers, transaction: transactions })
      .from(reconciliationGroupMembers)
      .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
      .where(inArray(reconciliationGroupMembers.groupId, ids)),
    tx.select().from(groupShares).where(inArray(groupShares.groupId, ids)),
  ])
  return groups.map((group) => ({
    group,
    members: members.filter((m) => m.member.groupId === group.id),
    shares: shares.filter((s) => s.groupId === group.id),
  }))
}

/** The ids of the groups these transactions are in. */
export async function groupIdsOf(tx: Db, transactionIds: string[]): Promise<string[]> {
  if (transactionIds.length === 0) return []
  const rows = await tx
    .selectDistinct({ groupId: reconciliationGroupMembers.groupId })
    .from(reconciliationGroupMembers)
    .where(inArray(reconciliationGroupMembers.transactionId, transactionIds))
  return rows.map((r) => r.groupId)
}

/** Every group membership of these transactions (one transaction can be divided between groups). */
export async function membershipsOf(tx: Db, transactionIds: string[]): Promise<MemberRow[]> {
  if (transactionIds.length === 0) return []
  return tx.select().from(reconciliationGroupMembers).where(inArray(reconciliationGroupMembers.transactionId, transactionIds))
}

/**
 * The user's own transaction with the largest amount (a transfer's: the
 * biggest money going out): its date, category and description stand for the
 * group. Null when the group has none (it is then pruned).
 */
export function anchorOf(loaded: LoadedGroup): LoadedMember | null {
  let own = loaded.members.filter((m) => m.member.contactId === null)
  if (loaded.group.kind === 'transfer') {
    const out = own.filter((m) => Number(m.transaction.amount) < 0)
    if (out.length) own = out
  }
  if (own.length === 0) return null
  return own.reduce((biggest, m) =>
    Math.abs(memberAmount(m.member, m.transaction)) > Math.abs(memberAmount(biggest.member, biggest.transaction)) ? m : biggest,
  )
}

/** Σ each person's payments in a group, signed like the transactions. */
export function paidByContact(loaded: LoadedGroup): Map<string, number> {
  const cents = new Map<string, number>()
  for (const { member, transaction } of loaded.members) {
    if (!member.contactId) continue
    cents.set(member.contactId, (cents.get(member.contactId) ?? 0) + Math.round(memberAmount(member, transaction) * 100))
  }
  return new Map([...cents].map(([id, c]) => [id, c / 100]))
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * What's left of a transfer once its sides cancel out (an FX difference or a
 * fee), in the anchor's currency and in the home currency. Same currency: the
 * plain sum, valued at the anchor's rate (so a transfer that nets to 0 stays
 * 0 even when the two days' rates differ). Across currencies: the sum of the
 * sides' home-currency values, and that in the anchor's currency. Null
 * without the rates to work it out.
 */
export function transferNet(loaded: LoadedGroup, anchor: TransactionRow): { amount: number | null; convertedValue: number | null } {
  const sides = loaded.members.map((m) => m.transaction)
  const rate = anchor.exchangeRate != null ? Number(anchor.exchangeRate) : null
  if (sides.every((t) => t.currencyCode === anchor.currencyCode)) {
    const amount = sides.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0) / 100
    return { amount, convertedValue: rate != null ? round(amount * rate) : null }
  }
  if (sides.some((t) => t.convertedValue == null)) return { amount: null, convertedValue: null }
  const convertedValue = round(sides.reduce((sum, t) => sum + Number(t.convertedValue), 0))
  return { amount: rate ? round(convertedValue / rate) : null, convertedValue }
}

/** A transfer's two sides for the ledger: the biggest money out and the biggest money in. */
export function transferSides(loaded: LoadedGroup): DisplayRowTransfer | null {
  const biggest = (sign: number) =>
    loaded.members
      .map((m) => m.transaction)
      .filter((t) => Math.sign(Number(t.amount)) === sign)
      .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))[0]
  const from = biggest(-1)
  const to = biggest(1)
  if (!from || !to) return null
  return {
    fromAccountId: from.accountId,
    toAccountId: to.accountId,
    sent: Math.abs(Number(from.amount)),
    sentCurrencyCode: from.currencyCode,
    received: Number(to.amount),
    receivedCurrencyCode: to.currencyCode,
  }
}

/** A loaded group as the API returns it. Null for a group with none of the user's own money (never kept). */
export function toGroup(loaded: LoadedGroup, nameById: Map<string, string>): Group | null {
  const anchor = anchorOf(loaded)
  if (!anchor) return null
  const paid = paidByContact(loaded)
  const members: GroupMember[] = loaded.members
    .map(({ member, transaction }) => ({
      transactionId: transaction.id,
      contactId: member.contactId,
      amount: memberAmount(member, transaction),
      allocated: member.amount != null,
      transactionAmount: Number(transaction.amount),
      currencyCode: transaction.currencyCode,
      date: transaction.date,
      description: transaction.description,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
    }))
    .sort((a, b) => Number(a.contactId !== null) - Number(b.contactId !== null) || Math.abs(b.amount) - Math.abs(a.amount) || a.date.localeCompare(b.date))
  const shares: GroupShare[] = loaded.shares
    .map((s) => {
      const amount = Number(s.amount)
      const forgiven = Number(s.forgiven)
      const contactPaid = paid.get(s.contactId) ?? 0
      return {
        contactId: s.contactId,
        contactName: nameById.get(s.contactId) ?? 'Someone',
        amount,
        paid: contactPaid,
        forgiven,
        forgivenOn: s.forgivenOn,
        outstanding: shareOutstanding({ amount, forgiven }, contactPaid),
      }
    })
    .sort((a, b) => a.contactName.localeCompare(b.contactName))
  const own = loaded.members.filter((m) => m.member.contactId === null).map((m) => memberAmount(m.member, m.transaction))
  return {
    id: loaded.group.id,
    kind: loaded.group.kind,
    label: loaded.group.label,
    description: loaded.group.label || anchor.transaction.description,
    currencyCode: anchor.transaction.currencyCode,
    date: anchor.transaction.date,
    anchorTransactionId: anchor.transaction.id,
    anchorCategoryId: anchor.transaction.categoryId,
    net: loaded.group.kind === 'transfer' ? transferNet(loaded, anchor.transaction).amount : groupNet(own, loaded.shares.map((s) => ({ amount: Number(s.amount), forgiven: Number(s.forgiven) }))),
    members,
    shares,
    split:
      loaded.group.splitMode && loaded.group.splitInputs
        ? { mode: loaded.group.splitMode, myValue: loaded.group.splitInputs.me, participants: loaded.group.splitInputs.participants }
        : null,
  }
}

/** Display names by contact id. */
export async function contactNames(tx: Db): Promise<Map<string, string>> {
  const rows = await tx.select({ id: contacts.id, displayName: contacts.displayName }).from(contacts)
  return new Map(rows.map((c) => [c.id, c.displayName]))
}

/**
 * Removes groups that no longer stand: none of the user's own money left in
 * them, or fewer than two things (transactions and people) in all. Their
 * members and shares go with them, so the transactions are on their own again.
 */
export async function pruneGroups(tx: Db, groupIds: string[]): Promise<void> {
  for (const loaded of await loadGroups(tx, [...new Set(groupIds)])) {
    const hasOwn = loaded.members.some((m) => m.member.contactId === null)
    if (hasOwn && loaded.members.length + loaded.shares.length >= 2) continue
    await tx.delete(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.groupId, loaded.group.id))
    await tx.delete(groupShares).where(eq(groupShares.groupId, loaded.group.id))
    await tx.delete(reconciliationGroups).where(eq(reconciliationGroups.id, loaded.group.id))
  }
}
