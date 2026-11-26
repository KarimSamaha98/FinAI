import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
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
  type RecordCashInput,
  type TransactionPeople,
  type TransactionSplit,
  type TransactionSplitInput,
  type UpdateContactInput,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { contacts, monthSplits, personEntries, reconciliationGroupMembers, transactionSplits, transactions } from '../../db/schema.js'
import { loadHomeCurrency } from '../../common/profile.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { roundMoney, type TransactionConversion } from '../exchange-rates/conversion.js'

type ContactRow = typeof contacts.$inferSelect
type EntryRow = typeof personEntries.$inferSelect
type SplitRow = typeof transactionSplits.$inferSelect

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

/** What settle up will write, computed identically before and inside the write transaction. */
interface SettleUpPlan {
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

  /** Everyone with activity, with their balance netted in the home currency (Home's People table). */
  async people(userId: string): Promise<PeopleSummary> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [contactRows, entryRows] = await Promise.all([tx.select().from(contacts), tx.select().from(personEntries)])
      const people: PersonSummary[] = []
      for (const contact of contactRows) {
        const own = entryRows.filter((e) => e.contactId === contact.id)
        if (own.length === 0) continue
        people.push(await this.summarize(contact, own, homeCurrencyCode))
      }
      // Open balances first (largest either way), then settled, most recent first.
      people.sort(
        (a, b) =>
          Number(b.net !== 0) - Number(a.net !== 0) ||
          Math.abs(b.net) - Math.abs(a.net) ||
          (b.lastActivityDate ?? '').localeCompare(a.lastActivityDate ?? '') ||
          a.contact.displayName.localeCompare(b.contact.displayName),
      )
      return {
        homeCurrencyCode,
        owedToMe: roundMoney(people.reduce((sum, p) => sum + Math.max(p.net, 0), 0)),
        iOwe: roundMoney(people.reduce((sum, p) => sum + Math.max(-p.net, 0), 0)),
        people,
      }
    })
  }

  /** One person: their balance and every entry, newest first, with the running balance. */
  async person(userId: string, contactId: string): Promise<PersonDetail> {
    const homeCurrencyCode = await this.warm(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [contact] = await tx.select().from(contacts).where(eq(contacts.id, contactId))
      if (!contact) throw new NotFoundException('Person not found')
      const rows = await tx.select().from(personEntries).where(eq(personEntries.contactId, contactId))
      const transactionIds = rows.map((r) => r.transactionId).filter((id): id is string => id !== null)
      const transactionRows = transactionIds.length
        ? await tx
            .select({ id: transactions.id, description: transactions.description, amount: transactions.amount })
            .from(transactions)
            .where(inArray(transactions.id, transactionIds))
        : []
      const byId = new Map(transactionRows.map((t) => [t.id, t]))

      const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime())
      const running = new Map<string, number>()
      const entries: PersonEntry[] = ordered.map((row) => {
        const after = (running.get(row.currencyCode) ?? 0) + cents(row.amount)
        running.set(row.currencyCode, after)
        const transaction = row.transactionId ? byId.get(row.transactionId) : undefined
        const amount = Number(row.amount)
        const label =
          row.kind === 'share'
            ? transaction?.description || 'Untitled'
            : row.kind === 'writeoff'
              ? 'Settled up'
              : row.note || (amount < 0 ? `Cash from ${contact.displayName}` : `Cash to ${contact.displayName}`)
        return {
          id: row.id,
          contactId: row.contactId,
          kind: row.kind,
          transactionId: row.transactionId,
          amount,
          currencyCode: row.currencyCode,
          date: row.date,
          note: row.note,
          label,
          transactionAmount: row.kind === 'share' && transaction ? Number(transaction.amount) : null,
          balanceAfter: after / 100,
        }
      })
      return { summary: await this.summarize(contact, rows, homeCurrencyCode), entries: entries.reverse() }
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
      const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, transactionId))
      if (!transaction) throw new NotFoundException('Transaction not found')
      if (transaction.sourceType !== 'manual' && transaction.sourceType !== 'import') {
        throw new BadRequestException('Only a transaction from one of your accounts can be shared with people')
      }
      await this.assertNotReconciledOrMonthSplit(tx, transactionId)

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

      await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId))
      const [splitRow] = await tx
        .insert(transactionSplits)
        .values({
          userId,
          transactionId,
          mode: input.mode,
          inputs: { me: input.myValue, participants: input.participants },
          myShare: String(result.myShare),
          note: input.note ?? null,
        })
        .returning()
      await tx.insert(personEntries).values(
        input.participants.map((p, i) => ({
          userId,
          contactId: p.contactId,
          kind: 'share' as const,
          transactionId,
          splitId: splitRow.id,
          amount: String(shareEntryAmount(amount, result.shares[i])),
          currencyCode: transaction.currencyCode,
          date: transaction.date,
          note: input.note ?? null,
        })),
      )
      return this.toSplit(tx, splitRow)
    })
  }

  async deleteSplit(userId: string, transactionId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)).returning()
      if (!row) throw new NotFoundException('This transaction isn’t shared with anyone')
    })
  }

  // ── Cash and settle up ───────────────────────────────────────────────────

  /** Money that changed hands outside any tracked account. */
  async recordCash(userId: string, contactId: string, input: RecordCashInput): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      await this.requireContact(tx, contactId)
      const amountCents = cents(input.amount)
      try {
        await tx.insert(personEntries).values({
          userId,
          contactId,
          kind: 'cash',
          amount: String((input.direction === 'they_paid' ? -amountCents : amountCents) / 100),
          currencyCode: input.currencyCode,
          date: input.date,
          note: input.note?.trim() || null,
        })
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  /**
   * Clears what's left with a person. Each currency's balance is written off
   * by an account-less adjustment transaction of −balance (spending when
   * they owed the user, income when the user owed them) and a matching
   * writeoff entry that brings the balance to zero.
   */
  async settleUp(userId: string, contactId: string): Promise<void> {
    const plan = await runInTenantContext(this.db, userId, (tx) => this.planSettleUp(tx, userId, contactId))
    if (plan.writeoffs.length === 0) throw new BadRequestException('Nothing to settle')
    // Rates are fetched outside the tenant transaction.
    const conversions = await Promise.all(
      plan.writeoffs.map((w) => this.exchangeRates.conversionFor({ amount: w.amount, currencyCode: w.currencyCode, homeCurrencyCode: plan.homeCurrencyCode, date: plan.date })),
    )
    return runInTenantContext(this.db, userId, async (tx) => {
      const again = await this.planSettleUp(tx, userId, contactId)
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

  private async planSettleUp(tx: Db, userId: string, contactId: string): Promise<SettleUpPlan> {
    const contact = await this.requireContact(tx, contactId)
    const rows = await tx.select({ currencyCode: personEntries.currencyCode, amount: personEntries.amount }).from(personEntries).where(eq(personEntries.contactId, contactId))
    const writeoffs = [...balancesOf(rows)].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, c]) => ({ currencyCode, amount: -c / 100 }))
    return { homeCurrencyCode: await loadHomeCurrency(tx, userId), name: contact.displayName, date: todayISO(), writeoffs }
  }

  /** Removes a cash entry, or undoes a settle up (with its adjustment). Shares go with their transaction's split. */
  async deleteEntry(userId: string, entryId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [entry] = await tx.select().from(personEntries).where(eq(personEntries.id, entryId))
      if (!entry) throw new NotFoundException('Entry not found')
      if (entry.kind === 'share') throw new BadRequestException('Remove the people from the transaction instead')
      if (entry.kind === 'writeoff') {
        // The entry cascades with its adjustment.
        await tx.delete(transactions).where(and(eq(transactions.id, entry.transactionId!), eq(transactions.sourceType, 'adjustment')))
      }
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
      lastActivityDate: own.reduce<string | null>((latest, e) => (!latest || e.date > latest ? e.date : latest), null),
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
      note: splitRow.note,
      participants: splitRow.inputs.participants.flatMap((p) => {
        const entry = rows.find((r) => r.contactId === p.contactId)
        return entry ? [{ contactId: p.contactId, value: p.value, amount: Math.abs(Number(entry.amount)) }] : []
      }),
    }
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

