import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm'
import {
  allocationProblem,
  computeSplit,
  shareAmount,
  transferFit,
  type Group,
  type GroupCandidate,
  type SaveGroupData,
  type SaveTransferData,
  type TransferCandidate,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, contacts, groupShares, monthSplits, reconciliationGroupMembers, reconciliationGroups, transactions } from '../../db/schema.js'
import { contactNames, loadGroups, membershipsOf, toGroup, type MemberRow } from './group-store.js'

const SPLIT_PROBLEMS = {
  over_total: 'The shares add up to more than the total',
  zero_share: 'Everyone in the split needs a share above zero',
  percent_over_100: 'The percentages add up to more than 100%',
  no_shares: 'Give at least one person a share',
} as const

const cents = (value: number) => Math.round(value * 100)

@Injectable()
export class GroupsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<Group[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const names = await contactNames(tx)
      return (await loadGroups(tx)).flatMap((loaded) => toGroup(loaded, names) ?? [])
    })
  }

  async get(userId: string, groupId: string): Promise<Group> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const group = await this.read(tx, groupId)
      if (!group) throw new NotFoundException('Group not found')
      return group
    })
  }

  /**
   * Creates a group (groupId null) or replaces what's in one, in a single
   * write. Saving an existing group with fewer than two things in it
   * ungroups it (returns null).
   */
  async save(userId: string, groupId: string | null, input: SaveGroupData): Promise<Group | null> {
    return runInTenantContext(this.db, userId, async (tx) => {
      if (groupId) {
        const [existing] = await tx.select({ kind: reconciliationGroups.kind }).from(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
        if (!existing) throw new NotFoundException('Group not found')
        if (existing.kind === 'transfer') throw new BadRequestException('That’s a transfer between your accounts, not a group')
      }

      const transactionIds = input.members.map((m) => m.transactionId)
      if (new Set(transactionIds).size !== transactionIds.length) throw new BadRequestException('A transaction can only be in a group once')
      const rows = await tx.select().from(transactions).where(inArray(transactions.id, transactionIds))
      if (rows.length !== transactionIds.length) throw new BadRequestException('One or more transactions were not found')
      const byId = new Map(rows.map((r) => [r.id, r]))
      const currencyCode = rows[0].currencyCode
      if (rows.some((r) => r.currencyCode !== currencyCode)) throw new BadRequestException('Everything in a group has to be in one currency')

      const own = input.members.filter((m) => m.contactId === null)
      if (own.length === 0) throw new BadRequestException('A group needs at least one of your own transactions')

      const [split] = await tx.select({ id: monthSplits.id }).from(monthSplits).where(inArray(monthSplits.transactionId, transactionIds)).limit(1)
      if (split) throw new ConflictException('A transaction split across months can’t be grouped. Remove that first.')

      // Each transaction's parts across every group must fit inside it.
      const elsewhere = (await membershipsOf(tx, transactionIds)).filter((m) => m.groupId !== groupId)
      for (const m of input.members) {
        const transaction = byId.get(m.transactionId)!
        if (m.amount !== null && cents(m.amount) > cents(Math.abs(Number(transaction.amount)))) {
          throw new BadRequestException(`More than “${transaction.description || 'Untitled'}” is worth`)
        }
        const parts = [...elsewhere.filter((e) => e.transactionId === m.transactionId).map(partOf), m.amount]
        const problem = allocationProblem(Number(transaction.amount), parts)
        if (problem) throw new ConflictException(`“${transaction.description || 'Untitled'}” is already in another group or a transfer`)
      }

      // Shares: from the split over the user's own money, or as given.
      const ownTotal = own.reduce((sum, m) => sum + cents(signedPart(m.amount, Number(byId.get(m.transactionId)!.amount))), 0) / 100
      let shares = input.shares
      if (input.split) {
        if (ownTotal === 0) throw new BadRequestException('There’s nothing to split: your transactions add up to zero')
        const result = computeSplit(ownTotal, input.split.mode, input.split.participants.map((p) => p.value), { myValue: input.split.myValue })
        if (result.problem) throw new BadRequestException(SPLIT_PROBLEMS[result.problem])
        shares = input.split.participants.map((p, i) => ({ contactId: p.contactId, amount: shareAmount(ownTotal, result.shares[i]) }))
      }
      const shareContactIds = shares.map((s) => s.contactId)
      if (new Set(shareContactIds).size !== shareContactIds.length) throw new BadRequestException('Each person can only be in a group once')
      const contactIds = [...new Set([...shareContactIds, ...input.members.flatMap((m) => (m.contactId ? [m.contactId] : []))])]
      if (contactIds.length) {
        const found = await tx.select({ id: contacts.id }).from(contacts).where(inArray(contacts.id, contactIds))
        if (found.length !== contactIds.length) throw new BadRequestException('Person not found')
      }

      if (input.members.length + shares.length < 2) {
        if (!groupId) throw new BadRequestException('Add a transaction or a person to group it with')
        await this.remove(tx, groupId)
        return null
      }

      // What was forgiven stays with whoever stays (while it still fits their share).
      const previous = groupId ? await tx.select().from(groupShares).where(eq(groupShares.groupId, groupId)) : []
      let id = groupId
      const values = {
        label: input.label || null,
        splitMode: input.split?.mode ?? null,
        splitInputs: input.split ? { me: input.split.myValue, participants: input.split.participants } : null,
      }
      if (id) {
        await tx.update(reconciliationGroups).set(values).where(eq(reconciliationGroups.id, id))
        await tx.delete(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.groupId, id))
        await tx.delete(groupShares).where(eq(groupShares.groupId, id))
      } else {
        const [created] = await tx.insert(reconciliationGroups).values({ userId, ...values }).returning({ id: reconciliationGroups.id })
        id = created.id
      }
      const groupIdToWrite = id
      await tx.insert(reconciliationGroupMembers).values(
        input.members.map((m) => ({
          groupId: groupIdToWrite,
          transactionId: m.transactionId,
          contactId: m.contactId,
          amount: m.amount === null ? null : String(signedPart(m.amount, Number(byId.get(m.transactionId)!.amount))),
        })),
      )
      if (shares.length) {
        await tx.insert(groupShares).values(
          shares.map((s) => {
            const kept = previous.find((p) => p.contactId === s.contactId)
            const forgiven = kept ? Number(kept.forgiven) : 0
            const keep = forgiven !== 0 && Math.sign(forgiven) === Math.sign(s.amount) && Math.abs(forgiven) <= Math.abs(s.amount)
            return {
              userId,
              groupId: groupIdToWrite,
              contactId: s.contactId,
              amount: String(s.amount),
              currencyCode,
              forgiven: keep ? String(forgiven) : '0',
              forgivenOn: keep ? kept!.forgivenOn : null,
            }
          }),
        )
      }
      return this.read(tx, groupIdToWrite)
    })
  }

  /**
   * Matches transactions as a transfer between the user's own accounts: whole
   * transactions, at least one out and one in, across two or more accounts,
   * none of them already in a group or split across months. Currencies can
   * differ.
   */
  async saveTransfer(userId: string, input: SaveTransferData): Promise<Group> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const ids = input.transactionIds
      if (new Set(ids).size !== ids.length) throw new BadRequestException('A transaction can only be in a transfer once')
      const rows = await tx.select().from(transactions).where(inArray(transactions.id, ids))
      if (rows.length !== ids.length) throw new BadRequestException('One or more transactions were not found')
      if (!rows.some((r) => Number(r.amount) < 0) || !rows.some((r) => Number(r.amount) > 0)) {
        throw new BadRequestException('A transfer needs money going out of one account and into another')
      }
      if (rows.some((r) => !r.accountId) || new Set(rows.map((r) => r.accountId)).size < 2) {
        throw new BadRequestException('A transfer has to be between two of your accounts')
      }
      const [split] = await tx.select({ id: monthSplits.id }).from(monthSplits).where(inArray(monthSplits.transactionId, ids)).limit(1)
      if (split) throw new ConflictException('A transaction split across months can’t be a transfer. Remove that first.')
      const taken = await membershipsOf(tx, ids)
      if (taken.length) {
        const row = rows.find((r) => r.id === taken[0].transactionId)!
        throw new ConflictException(`“${row.description || 'Untitled'}” is already in a group or another transfer`)
      }

      const [created] = await tx
        .insert(reconciliationGroups)
        .values({ userId, kind: 'transfer', label: input.label || null })
        .returning({ id: reconciliationGroups.id })
      await tx.insert(reconciliationGroupMembers).values(ids.map((transactionId) => ({ groupId: created.id, transactionId })))
      return (await this.read(tx, created.id))!
    })
  }

  /**
   * What could be the other side of a transfer with `transactionId`: money the
   * other way, in another account, in any currency, not in a group or split
   * across months. The likely ones (same currency and amount, a few days
   * apart) first, then by how close they are.
   */
  async transferCandidates(userId: string, transactionId: string): Promise<TransferCandidate[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [source] = await tx.select().from(transactions).where(eq(transactions.id, transactionId))
      if (!source) throw new NotFoundException('Transaction not found')
      const sourceAmount = Number(source.amount)
      const monthSplitRows = await tx.select({ id: monthSplits.transactionId }).from(monthSplits)
      const grouped = await tx.selectDistinct({ id: reconciliationGroupMembers.transactionId }).from(reconciliationGroupMembers)
      const excluded = [...monthSplitRows.map((r) => r.id), ...grouped.map((r) => r.id), source.id]
      const rows = await tx
        .select({ transaction: transactions, accountName: accounts.name })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(notInArray(transactions.id, excluded))
        .orderBy(desc(transactions.date))
        .limit(2000)
      const sourceSide = { amount: sourceAmount, currencyCode: source.currencyCode, accountId: source.accountId, date: source.date }
      return rows
        .flatMap(({ transaction, accountName }) => {
          const amount = Number(transaction.amount)
          const fit = transferFit(sourceSide, { amount, currencyCode: transaction.currencyCode, accountId: transaction.accountId, date: transaction.date })
          if (!fit) return []
          const candidate: TransferCandidate = {
            id: transaction.id,
            date: transaction.date,
            description: transaction.description,
            amount,
            available: amount,
            currencyCode: transaction.currencyCode,
            accountId: transaction.accountId,
            accountName,
            likely: fit.likely,
          }
          return [{ candidate, score: fit.score }]
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 200)
        .map((c) => c.candidate)
    })
  }

  async delete(userId: string, groupId: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select({ id: reconciliationGroups.id }).from(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
      if (!row) throw new NotFoundException('Group not found')
      await this.remove(tx, groupId)
    })
  }

  /**
   * Transactions that can go in a group: not split across months, with some
   * of their amount not in a group yet (what's in `groupId` counts as free,
   * so editing a group can keep its own). Newest first.
   */
  async candidates(userId: string, filter: { currencyCode?: string; groupId?: string }): Promise<GroupCandidate[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const monthSplitRows = await tx.select({ id: monthSplits.transactionId }).from(monthSplits)
      const rows = await tx
        .select({ transaction: transactions, accountName: accounts.name })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            filter.currencyCode ? eq(transactions.currencyCode, filter.currencyCode) : undefined,
            monthSplitRows.length ? notInArray(transactions.id, monthSplitRows.map((r) => r.id)) : undefined,
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(600)
      const memberships = (await membershipsOf(tx, rows.map((r) => r.transaction.id))).filter((m) => m.groupId !== filter.groupId)
      return rows.flatMap(({ transaction, accountName }) => {
        const amount = Number(transaction.amount)
        if (amount === 0) return []
        const used = memberships.filter((m) => m.transactionId === transaction.id)
        if (used.some((m) => m.amount === null)) return []
        const available = (cents(amount) - used.reduce((sum, m) => sum + cents(Number(m.amount)), 0)) / 100
        if (available === 0) return []
        return [
          {
            id: transaction.id,
            date: transaction.date,
            description: transaction.description,
            amount,
            available,
            currencyCode: transaction.currencyCode,
            accountId: transaction.accountId,
            accountName,
          },
        ]
      })
    })
  }

  private async read(tx: Db, groupId: string): Promise<Group | null> {
    const [loaded] = await loadGroups(tx, [groupId])
    return loaded ? toGroup(loaded, await contactNames(tx)) : null
  }

  private async remove(tx: Db, groupId: string): Promise<void> {
    await tx.delete(reconciliationGroupMembers).where(eq(reconciliationGroupMembers.groupId, groupId))
    await tx.delete(groupShares).where(eq(groupShares.groupId, groupId))
    await tx.delete(reconciliationGroups).where(eq(reconciliationGroups.id, groupId))
  }
}

/** A stored membership as a part for allocationProblem: its magnitude, or null for all of it. */
function partOf(member: MemberRow): number | null {
  return member.amount === null ? null : Math.abs(Number(member.amount))
}

/** A part given as a magnitude, signed like its transaction (all of it when null). */
function signedPart(magnitude: number | null, transactionAmount: number): number {
  if (magnitude === null) return transactionAmount
  return transactionAmount < 0 ? -magnitude : magnitude
}
