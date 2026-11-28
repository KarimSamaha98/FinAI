import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gt, inArray, isNotNull, lt, lte, notInArray } from 'drizzle-orm'
import { format } from 'date-fns'
import {
  allocationProblem,
  type Contact,
  type CreateContactInput,
  type PaymentAllocation,
  type PeopleSummary,
  type PersonDetail,
  type PersonGroup,
  type PersonSummary,
  type SettleUpCandidate,
  type SettleUpInput,
  type UpdateContactInput,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, contacts, groupShares, monthSplits, reconciliationGroupMembers, transactions } from '../../db/schema.js'
import { loadHomeCurrency } from '../../common/profile.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { roundMoney, type TransactionConversion } from '../exchange-rates/conversion.js'
import { contactNames, loadGroups, membershipsOf, toGroup, type TransactionRow } from '../groups/group-store.js'
import { balancesOf, loadPersonEvents, type PersonEvent } from './people-store.js'

type ContactRow = typeof contacts.$inferSelect

const cents = (value: string | number) => Math.round(Number(value) * 100)

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function toContact(row: ContactRow): Contact {
  return { id: row.id, displayName: row.displayName, createdAt: row.createdAt.toISOString() }
}

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ExchangeRatesService) private readonly exchangeRates: ExchangeRatesService,
  ) {}

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(userId: string): Promise<Contact[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx.select().from(contacts).orderBy(contacts.displayName)
      return rows.map(toContact)
    })
  }

  async createContact(userId: string, input: CreateContactInput): Promise<Contact> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx.insert(contacts).values({ userId, displayName: input.displayName.trim() }).returning()
        return toContact(row)
      } catch (error) {
        this.rethrowDuplicateName(error)
      }
    })
  }

  async updateContact(userId: string, id: string, input: UpdateContactInput): Promise<Contact> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const [row] = await tx.update(contacts).set({ displayName: input.displayName.trim() }).where(eq(contacts.id, id)).returning()
        if (!row) throw new NotFoundException('Person not found')
        return toContact(row)
      } catch (error) {
        this.rethrowDuplicateName(error)
      }
    })
  }

  async deleteContact(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [[share], [payment]] = await Promise.all([
        tx.select({ id: groupShares.id }).from(groupShares).where(eq(groupShares.contactId, id)).limit(1),
        tx.select({ id: reconciliationGroupMembers.id }).from(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.contactId, id)).limit(1),
      ])
      if (share || payment) throw new ConflictException('This person is still in a group. Take them out of it first.')
      const [row] = await tx.delete(contacts).where(eq(contacts.id, id)).returning()
      if (!row) throw new NotFoundException('Person not found')
    })
  }

  private rethrowDuplicateName(error: unknown): never {
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      throw new ConflictException('You already have someone with that name')
    }
    mapPostgresError(error)
  }

  // ── Balances ─────────────────────────────────────────────────────────────

  /** Everyone with an open balance, netted in the home currency, largest first (Home's People card). */
  async people(userId: string): Promise<PeopleSummary> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [contactRows, events] = await Promise.all([tx.select().from(contacts), loadPersonEvents(tx)])
      const people: PersonSummary[] = []
      for (const contact of contactRows) {
        const summary = await this.summarize(contact, events.filter((e) => e.contactId === contact.id), homeCurrencyCode)
        if (summary.balances.length > 0) people.push(summary)
      }
      people.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.contact.displayName.localeCompare(b.contact.displayName))
      return { homeCurrencyCode, people }
    })
  }

  /** One person: their balance, and every group they're in, newest first. */
  async person(userId: string, contactId: string): Promise<PersonDetail> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const contact = await this.requireContact(tx, contactId)
      const summary = await this.summarize(contact, await loadPersonEvents(tx, contactId), homeCurrencyCode)
      return { summary, groups: await this.personGroups(tx, contactId) }
    })
  }

  private async personGroups(tx: Db, contactId: string): Promise<PersonGroup[]> {
    const [shareRows, paymentRows] = await Promise.all([
      tx.select({ groupId: groupShares.groupId }).from(groupShares).where(eq(groupShares.contactId, contactId)),
      tx.select({ groupId: reconciliationGroupMembers.groupId }).from(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.contactId, contactId)),
    ])
    const names = await contactNames(tx)
    const groups: PersonGroup[] = []
    for (const loaded of await loadGroups(tx, [...new Set([...shareRows, ...paymentRows].map((r) => r.groupId))])) {
      const group = toGroup(loaded, names)
      if (!group) continue
      const share = group.shares.find((s) => s.contactId === contactId)
      const payments = group.members
        .filter((m) => m.contactId === contactId)
        .map((m) => ({ transactionId: m.transactionId, date: m.date, description: m.description, amount: m.amount }))
      const paid = payments.reduce((sum, p) => sum + cents(p.amount), 0) / 100
      groups.push({
        groupId: group.id,
        date: group.date,
        label: group.description || 'Untitled',
        currencyCode: group.currencyCode,
        share: share?.amount ?? 0,
        paid,
        forgiven: share?.forgiven ?? 0,
        forgivenOn: share?.forgivenOn ?? null,
        outstanding: share ? share.outstanding : -paid,
        payments,
      })
    }
    return groups.sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label))
  }

  // ── Settle up ────────────────────────────────────────────────────────────

  /**
   * Settles up with a person:
   * - forgive: everything still expected from them (or owed to them) is let go.
   * - match: an existing transaction is their payment, divided between groups.
   * - new: the payment is recorded as a new transaction on an account, then matched.
   */
  async settleUp(userId: string, contactId: string, input: SettleUpInput): Promise<void> {
    if (input.method === 'forgive') {
      return runInTenantContext(this.db, userId, async (tx) => {
        await this.requireContact(tx, contactId)
        const open = (await this.personGroups(tx, contactId)).filter((g) => g.outstanding !== 0 && g.share !== 0)
        if (open.length === 0) throw new BadRequestException('Nothing to forgive')
        for (const g of open) await this.writeForgive(tx, contactId, g.groupId, g.forgiven + g.outstanding)
      })
    }
    if (input.method === 'match') {
      return runInTenantContext(this.db, userId, async (tx) => {
        const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, input.transactionId))
        if (!transaction) throw new NotFoundException('Transaction not found')
        await this.writePayment(tx, contactId, transaction, input.allocations)
      })
    }

    const { homeCurrencyCode, account, direction } = await runInTenantContext(this.db, userId, async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId))
      if (!account || account.isArchived) throw new NotFoundException('Account not found')
      const groups = await this.personGroups(tx, contactId)
      const first = groups.find((g) => g.groupId === input.allocations[0].groupId)
      if (!first || first.outstanding === 0) throw new BadRequestException('Nothing is expected for that group')
      return { homeCurrencyCode: await loadHomeCurrency(tx, userId), account, direction: Math.sign(first.outstanding) }
    })
    const amount = (direction * cents(input.amount)) / 100
    // Rates are fetched outside the tenant transaction.
    const conversion = await this.exchangeRates.conversionFor({ amount, currencyCode: account.currencyCode, homeCurrencyCode, date: input.date })
    return runInTenantContext(this.db, userId, async (tx) => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          userId,
          date: input.date,
          amount: String(amount),
          currencyCode: account.currencyCode,
          description: input.description,
          categoryId: null,
          accountId: account.id,
          sourceType: 'manual',
          ...conversionColumns(conversion),
        })
        .returning()
      await this.writePayment(tx, contactId, transaction, input.allocations)
    })
  }

  /** Forgives what's still expected from a person in one group. */
  async forgiveGroup(userId: string, contactId: string, groupId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const group = (await this.personGroups(tx, contactId)).find((g) => g.groupId === groupId)
      if (!group || group.share === 0) throw new NotFoundException('They aren’t in that group')
      if (group.outstanding === 0) throw new BadRequestException('Nothing to forgive')
      await this.writeForgive(tx, contactId, groupId, group.forgiven + group.outstanding)
    })
  }

  /** Takes back forgiving in one group: it's expected again. */
  async unforgiveGroup(userId: string, contactId: string, groupId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(groupShares)
        .set({ forgiven: '0', forgivenOn: null })
        .where(and(eq(groupShares.contactId, contactId), eq(groupShares.groupId, groupId)))
        .returning({ id: groupShares.id })
      if (!row) throw new NotFoundException('They aren’t in that group')
    })
  }

  /**
   * Transactions that could be this person's payment: money in when they owe
   * the user, money out when the user owes them, in a currency something is
   * expected in; from an account, not dated in the future, not split across
   * months, with some of it not in a group yet. Newest first.
   */
  async settleUpCandidates(userId: string, contactId: string): Promise<SettleUpCandidate[]> {
    await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const direction = await this.settleDirection(tx, userId, contactId)
      // Only currencies something is expected in, that way round.
      const currencies = [
        ...new Set((await this.personGroups(tx, contactId)).filter((g) => g.share !== 0 && Math.sign(g.outstanding) === direction).map((g) => g.currencyCode)),
      ]
      if (currencies.length === 0) return []
      const monthSplitRows = await tx.select({ id: monthSplits.transactionId }).from(monthSplits)
      const rows = await tx
        .select({ transaction: transactions, accountName: accounts.name })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            direction > 0 ? gt(transactions.amount, '0') : lt(transactions.amount, '0'),
            inArray(transactions.currencyCode, currencies),
            lte(transactions.date, todayISO()),
            monthSplitRows.length ? notInArray(transactions.id, monthSplitRows.map((r) => r.id)) : undefined,
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(300)
      const memberships = await membershipsOf(tx, rows.map((r) => r.transaction.id))
      return rows.flatMap(({ transaction, accountName }) => {
        const used = memberships.filter((m) => m.transactionId === transaction.id)
        if (used.some((m) => m.amount === null)) return []
        const available = (cents(transaction.amount) - used.reduce((sum, m) => sum + cents(m.amount!), 0)) / 100
        if (available === 0) return []
        return [
          {
            id: transaction.id,
            date: transaction.date,
            description: transaction.description,
            amount: Number(transaction.amount),
            available,
            currencyCode: transaction.currencyCode,
            accountName,
          },
        ]
      })
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Makes `transaction` the person's payment for each group in `allocations`:
   * each part must go the way the money is expected (money in for what they
   * owe, out for what the user owes), be no more than what's still expected
   * there, and all the parts together must fit in what's left of the
   * transaction.
   */
  private async writePayment(tx: Db, contactId: string, transaction: TransactionRow, allocations: PaymentAllocation[]): Promise<void> {
    const groupIds = allocations.map((a) => a.groupId)
    if (new Set(groupIds).size !== groupIds.length) throw new BadRequestException('Each group can only appear once')
    if (!transaction.accountId) throw new BadRequestException('Pick a transaction from one of your accounts')
    const [split] = await tx.select({ id: monthSplits.id }).from(monthSplits).where(eq(monthSplits.transactionId, transaction.id)).limit(1)
    if (split) throw new ConflictException('This transaction is split across months. Remove that first.')

    const amount = Number(transaction.amount)
    const open = new Map((await this.personGroups(tx, contactId)).map((g) => [g.groupId, g]))
    for (const a of allocations) {
      const group = open.get(a.groupId)
      if (!group || group.share === 0) throw new BadRequestException('They aren’t in that group')
      if (group.currencyCode !== transaction.currencyCode) throw new BadRequestException(`“${group.label}” is in ${group.currencyCode}; pick a payment in that currency`)
      if (Math.sign(group.outstanding) !== Math.sign(amount)) {
        throw new BadRequestException(group.outstanding === 0 ? `Nothing is expected for “${group.label}”` : amount > 0 ? 'Pick money you paid out' : 'Pick money you received')
      }
      if (cents(a.amount) > Math.abs(cents(group.outstanding))) throw new BadRequestException(`More than what’s expected for “${group.label}”`)
    }

    // Fit: the transaction's parts in every group, with these added (a part
    // already paying the same group for this person grows instead).
    const memberships = await membershipsOf(tx, [transaction.id])
    const parts = memberships.map((m) => {
      const added = m.contactId === contactId ? allocations.find((a) => a.groupId === m.groupId) : undefined
      return m.amount === null ? null : Math.abs(Number(m.amount)) + (added?.amount ?? 0)
    })
    const fresh = allocations.filter((a) => !memberships.some((m) => m.contactId === contactId && m.groupId === a.groupId))
    if (memberships.some((m) => m.contactId !== contactId && allocations.some((a) => a.groupId === m.groupId))) {
      throw new ConflictException('This transaction is already in one of those groups')
    }
    if (allocationProblem(amount, [...parts, ...fresh.map((a) => a.amount)])) {
      throw new ConflictException('That’s more than what’s left of this transaction')
    }

    const sign = amount < 0 ? -1 : 1
    for (const a of allocations) {
      const existing = memberships.find((m) => m.contactId === contactId && m.groupId === a.groupId)
      if (existing) {
        await tx
          .update(reconciliationGroupMembers)
          .set({ amount: String((sign * (Math.abs(cents(existing.amount!)) + cents(a.amount))) / 100) })
          .where(eq(reconciliationGroupMembers.id, existing.id))
      } else {
        await tx.insert(reconciliationGroupMembers).values({ groupId: a.groupId, transactionId: transaction.id, contactId, amount: String((sign * cents(a.amount)) / 100) })
      }
    }
  }

  private async writeForgive(tx: Db, contactId: string, groupId: string, forgiven: number): Promise<void> {
    await tx
      .update(groupShares)
      .set({ forgiven: String(roundMoney(forgiven)), forgivenOn: roundMoney(forgiven) === 0 ? null : todayISO() })
      .where(and(eq(groupShares.contactId, contactId), eq(groupShares.groupId, groupId)))
  }

  /**
   * +1 when the person owes the user (their payment is money in), −1 when
   * the user owes them (money out). Throws when nothing is owed either way,
   * e.g. balances that cancel out across currencies.
   */
  private async settleDirection(tx: Db, userId: string, contactId: string): Promise<1 | -1> {
    const contact = await this.requireContact(tx, contactId)
    const { net } = await this.summarize(contact, await loadPersonEvents(tx, contactId), await loadHomeCurrency(tx, userId))
    if (net > 0) return 1
    if (net < 0) return -1
    throw new BadRequestException('Nothing to settle with a transaction. Forgive what’s left instead.')
  }

  /** Warms every currency a balance with someone uses (outside any tenant transaction). Returns the home currency. */
  private async warm(userId: string): Promise<string> {
    const { home, codes } = await runInTenantContext(this.db, userId, async (tx) => {
      const [shares, payments] = await Promise.all([
        tx.selectDistinct({ currencyCode: groupShares.currencyCode }).from(groupShares),
        tx
          .selectDistinct({ currencyCode: transactions.currencyCode })
          .from(reconciliationGroupMembers)
          .innerJoin(transactions, eq(reconciliationGroupMembers.transactionId, transactions.id))
          .where(isNotNull(reconciliationGroupMembers.contactId)),
      ])
      return { home: await loadHomeCurrency(tx, userId), codes: [...shares, ...payments].map((r) => r.currencyCode) }
    })
    await this.exchangeRates.warm([home, ...new Set(codes)])
    return home
  }

  private async summarize(contact: ContactRow, events: PersonEvent[], homeCurrencyCode: string): Promise<PersonSummary> {
    const today = todayISO()
    const balances = [...balancesOf(events)].map(([currencyCode, c]) => ({ currencyCode, amount: c / 100 }))
    let net = 0
    for (const b of balances) {
      const rate = b.currencyCode === homeCurrencyCode ? 1 : await this.exchangeRates.requireRate(b.currencyCode, homeCurrencyCode, today)
      net += b.amount * rate
    }
    return { contact: toContact(contact), homeCurrencyCode, net: roundMoney(net), balances }
  }

  private async requireContact(tx: Db, contactId: string): Promise<ContactRow> {
    const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId))
    if (!contact) throw new NotFoundException('Person not found')
    return contact
  }
}

function conversionColumns(conversion: TransactionConversion) {
  return {
    exchangeRate: conversion.exchangeRate != null ? String(conversion.exchangeRate) : null,
    convertedValue: conversion.convertedValue != null ? String(conversion.convertedValue) : null,
    rateSource: conversion.rateSource,
  }
}
