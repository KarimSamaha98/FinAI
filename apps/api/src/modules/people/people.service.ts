import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gt, inArray, isNotNull, lt, lte, notInArray } from 'drizzle-orm'
import { format } from 'date-fns'
import {
  computeSplit,
  shareEntryAmount,
  type Contact,
  type CreateContactInput,
  type PeopleSummary,
  type PersonDetail,
  type PersonEntry,
  type PersonSummary,
  type SettleUpCandidate,
  type SettleUpInput,
  type TransactionPeople,
  type TransactionSplit,
  type TransactionSplitInput,
  type UpdateContactInput,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, contacts, monthSplits, personEntries, reconciliationGroupMembers, transactionSplits, transactions } from '../../db/schema.js'
import { loadHomeCurrency } from '../../common/profile.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { roundMoney, type TransactionConversion } from '../exchange-rates/conversion.js'
import { peopleLinkedTransactionIds } from './people-store.js'

type ContactRow = typeof contacts.$inferSelect
type EntryRow = typeof personEntries.$inferSelect
type SplitRow = typeof transactionSplits.$inferSelect
type TransactionRow = typeof transactions.$inferSelect

const cents = (value: string | number) => Math.round(Number(value) * 100)

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function toContact(row: ContactRow): Contact {
  return { id: row.id, displayName: row.displayName, createdAt: row.createdAt.toISOString() }
}

/** Σ entries per currency, in cents, leaving out currencies that net to zero. */
function balancesOf(entries: Pick<EntryRow, 'currencyCode' | 'amount'>[]): Map<string, number> {
  const byCurrency = new Map<string, number>()
  for (const e of entries) byCurrency.set(e.currencyCode, (byCurrency.get(e.currencyCode) ?? 0) + cents(e.amount))
  for (const [code, c] of byCurrency) if (c === 0) byCurrency.delete(code)
  return byCurrency
}

const SPLIT_PROBLEMS = {
  over_total: 'The shares add up to more than the transaction',
  zero_share: 'Everyone in the split needs a share above zero',
  percent_over_100: 'The percentages add up to more than 100%',
  no_shares: 'Give at least one person a share',
} as const

/** What forgiving will write, computed identically before and inside the write transaction. */
interface ForgivePlan {
  homeCurrencyCode: string
  name: string
  date: string
  /** Per currency: the signed amount that brings the balance to zero (= −balance). */
  writeoffs: { currencyCode: string; amount: number }[]
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
      const [used] = await tx.select({ id: personEntries.id }).from(personEntries).where(eq(personEntries.contactId, id)).limit(1)
      if (used) throw new ConflictException('This person still has activity. Remove it first.')
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

  /** Everyone with an open balance, netted in the home currency, largest first (Home's People table). */
  async people(userId: string): Promise<PeopleSummary> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [contactRows, entryRows] = await Promise.all([tx.select().from(contacts), tx.select().from(personEntries)])
      const people: PersonSummary[] = []
      for (const contact of contactRows) {
        const own = entryRows.filter((e) => e.contactId === contact.id)
        if (own.length === 0) continue
        const summary = await this.summarize(contact, own, homeCurrencyCode)
        if (summary.balances.length > 0) people.push(summary)
      }
      people.sort(
        (a, b) =>
          Math.abs(b.net) - Math.abs(a.net) ||
          a.contact.displayName.localeCompare(b.contact.displayName),
      )
      return { homeCurrencyCode, people }
    })
  }

  /** One person: their balance and every entry, newest first. */
  async person(userId: string, contactId: string): Promise<PersonDetail> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId))
      if (!contact) throw new NotFoundException('Person not found')
      const rows = await tx.select().from(personEntries).where(eq(personEntries.contactId, contactId))
      const transactionIds = rows.map((r) => r.transactionId).filter((id): id is string => id !== null)
      const transactionRows = transactionIds.length
        ? await tx
            .select({ id: transactions.id, description: transactions.description })
            .from(transactions)
            .where(inArray(transactions.id, transactionIds))
        : []
      const byId = new Map(transactionRows.map((t) => [t.id, t]))

      const entries: PersonEntry[] = [...rows]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime())
        .map((row) => ({
          id: row.id,
          contactId: row.contactId,
          kind: row.kind,
          transactionId: row.transactionId,
          amount: Number(row.amount),
          currencyCode: row.currencyCode,
          date: row.date,
          label: row.kind === 'writeoff' ? 'Settled up' : (row.transactionId && byId.get(row.transactionId)?.description) || 'Untitled',
        }))
      return { summary: await this.summarize(contact, rows, homeCurrencyCode), entries }
    })
  }

  // ── Splits ───────────────────────────────────────────────────────────────

  async byTransaction(userId: string, transactionId: string): Promise<TransactionPeople> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [transaction] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, transactionId))
      if (!transaction) throw new NotFoundException('Transaction not found')
      const [splitRow] = await tx.select().from(transactionSplits).where(eq(transactionSplits.transactionId, transactionId))
      return { transactionId, split: splitRow ? await this.toSplit(tx, splitRow) : null }
    })
  }

  /**
   * Tags a transaction with people, or changes how it is shared. Each person's
   * portion becomes a share entry on their balance (the opposite sign of the
   * transaction). Replaces any earlier split of the same transaction.
   */
  async setSplit(userId: string, transactionId: string, input: TransactionSplitInput): Promise<TransactionSplit> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const transaction = await this.requireShareable(tx, transactionId)
      const splitRow = await this.writeSplit(tx, userId, transaction, input)
      return this.toSplit(tx, splitRow)
    })
  }

  async deleteSplit(userId: string, transactionId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)).returning()
      if (!row) throw new NotFoundException('This transaction isn’t shared with anyone')
    })
  }

  // ── Settle up ────────────────────────────────────────────────────────────

  /**
   * Settles up with a person:
   * - forgive: each currency's balance is written off by an account-less
   *   adjustment transaction of −balance (spending when they owed the user,
   *   income when the user owed them) and a matching writeoff entry.
   * - link: an existing transaction goes entirely to the person.
   * - new: a new transaction on an account goes entirely to the person.
   * A transaction that goes to the person is an ordinary split (the user's
   * share 0), so it can be edited or removed like any other.
   */
  async settleUp(userId: string, contactId: string, input: SettleUpInput): Promise<void> {
    if (input.method === 'forgive') return this.forgive(userId, contactId)
    // The direction converts balances at today's rate: warm them before the tenant transaction.
    await this.warm(userId)
    if (input.method === 'link') {
      return runInTenantContext(this.db, userId, async (tx) => {
        const direction = await this.settleDirection(tx, userId, contactId)
        const transaction = await this.requireShareable(tx, input.transactionId)
        if ((await peopleLinkedTransactionIds(tx, [transaction.id])).size > 0) {
          throw new ConflictException('This transaction is already shared with people')
        }
        if (Math.sign(Number(transaction.amount)) !== direction) {
          throw new BadRequestException(direction > 0 ? 'Pick money you received' : 'Pick money you paid out')
        }
        await this.giveToPerson(tx, userId, transaction, contactId)
      })
    }

    const { homeCurrencyCode, account, direction } = await runInTenantContext(this.db, userId, async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId))
      if (!account || account.isArchived) throw new NotFoundException('Account not found')
      return { homeCurrencyCode: await loadHomeCurrency(tx, userId), account, direction: await this.settleDirection(tx, userId, contactId) }
    })
    const amount = (direction * cents(input.amount)) / 100
    // Rates are fetched outside the tenant transaction.
    const conversion = await this.exchangeRates.conversionFor({ amount, currencyCode: account.currencyCode, homeCurrencyCode, date: input.date })
    return runInTenantContext(this.db, userId, async (tx) => {
      if ((await this.settleDirection(tx, userId, contactId)) !== direction) throw new ConflictException('Something changed with this person. Try again.')
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
      await this.giveToPerson(tx, userId, transaction, contactId)
    })
  }

  /**
   * Transactions that could settle up with a person: money in when they owe
   * the user, money out when the user owes them; from an account, not dated
   * in the future, and not already shared, linked or split across months.
   * Newest first.
   */
  async settleUpCandidates(userId: string, contactId: string): Promise<SettleUpCandidate[]> {
    await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const direction = await this.settleDirection(tx, userId, contactId)
      const [peopleRows, groupedRows, monthSplitRows] = await Promise.all([
        tx.selectDistinct({ id: personEntries.transactionId }).from(personEntries).where(isNotNull(personEntries.transactionId)),
        tx.selectDistinct({ id: reconciliationGroupMembers.transactionId }).from(reconciliationGroupMembers),
        tx.select({ id: monthSplits.transactionId }).from(monthSplits),
      ])
      const taken = [...peopleRows, ...groupedRows, ...monthSplitRows].map((r) => r.id).filter((id): id is string => id !== null)
      const rows = await tx
        .select({ transaction: transactions, accountName: accounts.name })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            inArray(transactions.sourceType, ['manual', 'import']),
            direction > 0 ? gt(transactions.amount, '0') : lt(transactions.amount, '0'),
            lte(transactions.date, todayISO()),
            taken.length ? notInArray(transactions.id, taken) : undefined,
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(200)
      return rows.map(({ transaction, accountName }) => ({
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        amount: Number(transaction.amount),
        currencyCode: transaction.currencyCode,
        accountName,
      }))
    })
  }

  private async forgive(userId: string, contactId: string): Promise<void> {
    const plan = await runInTenantContext(this.db, userId, (tx) => this.planForgive(tx, userId, contactId))
    if (plan.writeoffs.length === 0) throw new BadRequestException('Nothing to settle')
    // Rates are fetched outside the tenant transaction.
    const conversions = await Promise.all(
      plan.writeoffs.map((w) => this.exchangeRates.conversionFor({ amount: w.amount, currencyCode: w.currencyCode, homeCurrencyCode: plan.homeCurrencyCode, date: plan.date })),
    )
    return runInTenantContext(this.db, userId, async (tx) => {
      const again = await this.planForgive(tx, userId, contactId)
      if (JSON.stringify(again) !== JSON.stringify(plan)) throw new ConflictException('Something changed with this person. Try again.')
      for (const [i, w] of plan.writeoffs.entries()) {
        const [adjustment] = await tx
          .insert(transactions)
          .values({
            userId,
            date: plan.date,
            amount: String(w.amount),
            currencyCode: w.currencyCode,
            description: `Settled up with ${plan.name}`,
            categoryId: null,
            accountId: null,
            sourceType: 'adjustment',
            ...conversionColumns(conversions[i]),
          })
          .returning({ id: transactions.id })
        await tx.insert(personEntries).values({
          userId,
          contactId,
          kind: 'writeoff',
          transactionId: adjustment.id,
          amount: String(w.amount),
          currencyCode: w.currencyCode,
          date: plan.date,
        })
      }
    })
  }

  private async planForgive(tx: Db, userId: string, contactId: string): Promise<ForgivePlan> {
    const contact = await this.requireContact(tx, contactId)
    const rows = await tx.select({ currencyCode: personEntries.currencyCode, amount: personEntries.amount }).from(personEntries).where(eq(personEntries.contactId, contactId))
    const writeoffs = [...balancesOf(rows)].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, c]) => ({ currencyCode, amount: -c / 100 }))
    return { homeCurrencyCode: await loadHomeCurrency(tx, userId), name: contact.displayName, date: todayISO(), writeoffs }
  }

  /**
   * +1 when the person owes the user (settling is money in), −1 when the user
   * owes them (money out). Throws when there's nothing to settle in one
   * direction, e.g. balances that cancel out across currencies.
   */
  private async settleDirection(tx: Db, userId: string, contactId: string): Promise<1 | -1> {
    const contact = await this.requireContact(tx, contactId)
    const rows = await tx.select().from(personEntries).where(eq(personEntries.contactId, contactId))
    if (rows.length > 0) {
      const homeCurrencyCode = await loadHomeCurrency(tx, userId)
      const { net } = await this.summarize(contact, rows, homeCurrencyCode)
      if (net > 0) return 1
      if (net < 0) return -1
    }
    throw new BadRequestException('Nothing to settle with a transaction. Forgive what’s left instead.')
  }

  /** The whole transaction goes to one person: a split with the user's share at 0. */
  private async giveToPerson(tx: Db, userId: string, transaction: TransactionRow, contactId: string): Promise<void> {
    await this.writeSplit(tx, userId, transaction, { mode: 'equal', myValue: 0, participants: [{ contactId, value: 0 }] })
  }

  /** Undoes a forgiving settle up (with its adjustment). Shares go with their transaction's split. */
  async deleteEntry(userId: string, entryId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [entry] = await tx.select().from(personEntries).where(eq(personEntries.id, entryId))
      if (!entry) throw new NotFoundException('Entry not found')
      if (entry.kind === 'share') throw new BadRequestException('Remove the people from the transaction instead')
      // The entry cascades with its adjustment.
      await tx.delete(transactions).where(and(eq(transactions.id, entry.transactionId!), eq(transactions.sourceType, 'adjustment')))
      await tx.delete(personEntries).where(eq(personEntries.id, entryId))
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Warms every currency a balance uses (outside any tenant transaction). Returns the home currency. */
  private async warm(userId: string): Promise<string> {
    const { home, codes } = await runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx.selectDistinct({ currencyCode: personEntries.currencyCode }).from(personEntries)
      return { home: await loadHomeCurrency(tx, userId), codes: rows.map((r) => r.currencyCode) }
    })
    await this.exchangeRates.warm([home, ...codes])
    return home
  }

  private async summarize(contact: ContactRow, own: EntryRow[], homeCurrencyCode: string): Promise<PersonSummary> {
    const today = todayISO()
    const balances = [...balancesOf(own)].map(([currencyCode, c]) => ({ currencyCode, amount: c / 100 }))
    let net = 0
    for (const b of balances) {
      const rate = b.currencyCode === homeCurrencyCode ? 1 : await this.exchangeRates.requireRate(b.currencyCode, homeCurrencyCode, today)
      net += b.amount * rate
    }
    return {
      contact: toContact(contact),
      homeCurrencyCode,
      net: roundMoney(net),
      balances,
    }
  }

  private async toSplit(tx: Db, splitRow: SplitRow): Promise<TransactionSplit> {
    const rows = await tx.select().from(personEntries).where(eq(personEntries.splitId, splitRow.id))
    return {
      id: splitRow.id,
      transactionId: splitRow.transactionId,
      mode: splitRow.mode,
      myValue: splitRow.inputs.me,
      myShare: Number(splitRow.myShare),
      participants: splitRow.inputs.participants.flatMap((p) => {
        const entry = rows.find((r) => r.contactId === p.contactId)
        return entry ? [{ contactId: p.contactId, value: p.value, amount: Math.abs(Number(entry.amount)) }] : []
      }),
    }
  }

  /** A transaction from one of the user's accounts that may be shared with people. */
  private async requireShareable(tx: Db, transactionId: string): Promise<TransactionRow> {
    const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, transactionId))
    if (!transaction) throw new NotFoundException('Transaction not found')
    if (transaction.sourceType !== 'manual' && transaction.sourceType !== 'import') {
      throw new BadRequestException('Only a transaction from one of your accounts can be shared with people')
    }
    await this.assertNotReconciledOrMonthSplit(tx, transactionId)
    return transaction
  }

  /**
   * Writes how a transaction is shared: each person's portion becomes a share
   * entry on their balance (the opposite sign of the transaction). Replaces
   * any earlier split of the same transaction.
   */
  private async writeSplit(tx: Db, userId: string, transaction: TransactionRow, input: TransactionSplitInput): Promise<SplitRow> {
    const contactIds = input.participants.map((p) => p.contactId)
    if (new Set(contactIds).size !== contactIds.length) throw new BadRequestException('Each person can only be in a split once')
    const found = await tx.select({ id: contacts.id }).from(contacts).where(inArray(contacts.id, contactIds))
    if (found.length !== contactIds.length) throw new BadRequestException('Person not found')

    const amount = Number(transaction.amount)
    const result = computeSplit(
      amount,
      input.mode,
      input.participants.map((p) => p.value),
      { myValue: input.myValue },
    )
    if (result.problem) throw new BadRequestException(SPLIT_PROBLEMS[result.problem])

    await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, transaction.id))
    const [splitRow] = await tx
      .insert(transactionSplits)
      .values({
        userId,
        transactionId: transaction.id,
        mode: input.mode,
        inputs: { me: input.myValue, participants: input.participants },
        myShare: String(result.myShare),
      })
      .returning()
    await tx.insert(personEntries).values(
      input.participants.map((p, i) => ({
        userId,
        contactId: p.contactId,
        kind: 'share' as const,
        transactionId: transaction.id,
        splitId: splitRow.id,
        amount: String(shareEntryAmount(amount, result.shares[i])),
        currencyCode: transaction.currencyCode,
        date: transaction.date,
      })),
    )
    return splitRow
  }

  private async requireContact(tx: Db, contactId: string): Promise<ContactRow> {
    const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId))
    if (!contact) throw new NotFoundException('Person not found')
    return contact
  }

  private async assertNotReconciledOrMonthSplit(tx: Db, transactionId: string): Promise<void> {
    const [[grouped], [split]] = await Promise.all([
      tx.select({ id: reconciliationGroupMembers.id }).from(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.transactionId, transactionId)).limit(1),
      tx.select({ id: monthSplits.id }).from(monthSplits).where(eq(monthSplits.transactionId, transactionId)).limit(1),
    ])
    if (grouped) throw new ConflictException('This transaction is linked with others. Unlink it first.')
    if (split) throw new ConflictException('This transaction is split across months. Remove that first.')
  }
}

function conversionColumns(conversion: TransactionConversion) {
  return {
    exchangeRate: conversion.exchangeRate != null ? String(conversion.exchangeRate) : null,
    convertedValue: conversion.convertedValue != null ? String(conversion.convertedValue) : null,
    rateSource: conversion.rateSource,
  }
}

