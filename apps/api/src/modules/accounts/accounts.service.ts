import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { count, eq, inArray } from 'drizzle-orm'
import { format } from 'date-fns'
import { CARD_COLOR_PALETTE } from 'shared-types'
import type {
  Account,
  AccountSummary,
  CreateAccountInput,
  ExcludedCurrency,
  NetWorth,
  NetWorthAccount,
  NetWorthSeries,
  UpdateAccountInput,
} from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, importProfiles, profiles, transactions } from '../../db/schema.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { ACCOUNT_CARDS_BUCKET, StorageService } from '../../storage/storage.module.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { roundMoney } from '../exchange-rates/conversion.js'
import { buildBuckets, resolveGranularity } from '../reporting/buckets.js'

type AccountRow = typeof accounts.$inferSelect

/** A counting transaction (dated after balance_as_of) with its materialized home value. */
interface CountingTx {
  date: string
  amount: number
  currencyCode: string
  convertedValue: number | null
}

const CARD_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export interface UploadCardImageInput {
  buffer: Buffer
  mimetype: string
}

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function toAccount(row: AccountRow, cardImageUrl: string | null): Account {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    currencyCode: row.currencyCode,
    startingBalance: Number(row.startingBalance),
    balanceAsOf: row.balanceAsOf,
    balanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
    isArchived: row.isArchived,
    cardColor: row.cardColor,
    cardImageUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** An account is multi-currency when any counting transaction is in a currency other than the account's. */
function isMultiCurrency(row: AccountRow, counting: CountingTx[]): boolean {
  return counting.some((t) => t.currencyCode !== row.currencyCode)
}

/** Balance in the account's own currency: starting_balance + counting amounts (≤ cutoff). 0 before balance_as_of. */
function ownBalanceAt(row: AccountRow, counting: CountingTx[], cutoff?: string): number {
  if (cutoff && cutoff < row.balanceAsOf) return 0
  let balance = Number(row.startingBalance)
  for (const t of counting) {
    if (cutoff && t.date > cutoff) continue
    balance += t.amount
  }
  return balance
}

/**
 * Balance in the HOME currency for a multi-currency account: the starting
 * balance converted once (startRate) plus each counting transaction's stored
 * converted_value. Null when the start has no rate or any counting row has no
 * value — the whole account is then excluded from home-currency totals.
 */
function homeBalanceAt(row: AccountRow, counting: CountingTx[], startRate: number | null, cutoff?: string): number | null {
  if (startRate == null) return null
  if (cutoff && cutoff < row.balanceAsOf) return 0
  let balance = Number(row.startingBalance) * startRate
  for (const t of counting) {
    if (cutoff && t.date > cutoff) continue
    if (t.convertedValue == null) return null
    balance += t.convertedValue
  }
  return roundMoney(balance)
}

/** Currencies of counting rows that have no materialized home value. */
function excludedCurrenciesOf(counting: CountingTx[]): ExcludedCurrency[] {
  const counts = new Map<string, number>()
  for (const t of counting) {
    if (t.convertedValue == null) counts.set(t.currencyCode, (counts.get(t.currencyCode) ?? 0) + 1)
  }
  return [...counts.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount }))
}

function mergeExcluded(rows: ExcludedCurrency[]): ExcludedCurrency[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.currencyCode, (counts.get(row.currencyCode) ?? 0) + row.transactionCount)
  return [...counts.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount }))
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ExchangeRatesService) private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async list(userId: string, filter?: { includeArchived?: boolean }): Promise<AccountSummary[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const homeCurrencyCode = await this.homeCurrencyCode(tx, userId)
      const rows = await tx
        .select()
        .from(accounts)
        .where(filter?.includeArchived ? undefined : eq(accounts.isArchived, false))
        .orderBy(accounts.name)
      return Promise.all(rows.map((row) => this.toSummary(tx, row, homeCurrencyCode)))
    })
  }

  async getById(userId: string, id: string): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(accounts).where(eq(accounts.id, id))
      if (!row) throw new NotFoundException('Account not found')
      return this.toSummary(tx, row, await this.homeCurrencyCode(tx, userId))
    })
  }

  async create(userId: string, input: CreateAccountInput): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        // No colour chosen: continue round the palette so each new card looks different.
        let cardColor = input.cardColor
        if (!cardColor) {
          const [{ total }] = await tx.select({ total: count() }).from(accounts)
          cardColor = CARD_COLOR_PALETTE[total % CARD_COLOR_PALETTE.length]
        }
        const [row] = await tx
          .insert(accounts)
          .values({ ...input, cardColor, startingBalance: String(input.startingBalance), userId })
          .returning()
        return this.toSummary(tx, row, await this.homeCurrencyCode(tx, userId))
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: Omit<UpdateAccountInput, 'id'>): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      try {
        const { startingBalance, ...rest } = input
        const touchesBalance = startingBalance !== undefined || input.balanceAsOf !== undefined
        const [row] = await tx
          .update(accounts)
          .set({
            ...rest,
            ...(startingBalance !== undefined ? { startingBalance: String(startingBalance) } : {}),
            updatedAt: new Date(),
            ...(touchesBalance ? { balanceUpdatedAt: new Date() } : {}),
          })
          .where(eq(accounts.id, id))
          .returning()
        if (!row) throw new NotFoundException('Account not found')
        return this.toSummary(tx, row, await this.homeCurrencyCode(tx, userId))
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [usedByTransaction] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.accountId, id))
        .limit(1)
      const [usedByProfile] = await tx
        .select({ id: importProfiles.id })
        .from(importProfiles)
        .where(eq(importProfiles.accountId, id))
        .limit(1)
      if (usedByTransaction || usedByProfile) {
        throw new ConflictException('Account has existing transactions or an import profile; archive it instead')
      }

      const [row] = await tx.delete(accounts).where(eq(accounts.id, id)).returning()
      if (!row) throw new NotFoundException('Account not found')
      if (row.cardImagePath) await this.removeCardImageFile(row.cardImagePath)
    })
  }

  /**
   * Each upload gets a fresh object path (no stale browser cache), and the
   * previous photo is deleted once the account points at the new one.
   */
  async uploadCardImage(userId: string, id: string, input: UploadCardImageInput): Promise<AccountSummary> {
    const extension = CARD_IMAGE_EXTENSIONS[input.mimetype]
    if (!extension) {
      throw new BadRequestException('Card photo must be a PNG, JPEG or WebP image')
    }
    const path = `${userId}/${randomUUID()}.${extension}`
    // Check ownership before storing anything (RLS hides other users' accounts).
    await this.getById(userId, id)
    await this.storage.uploadImage(ACCOUNT_CARDS_BUCKET, path, input.buffer, input.mimetype)
    return this.setCardImagePath(userId, id, path)
  }

  async removeCardImage(userId: string, id: string): Promise<AccountSummary> {
    return this.setCardImagePath(userId, id, null)
  }

  private async setCardImagePath(userId: string, id: string, path: string | null): Promise<AccountSummary> {
    const { previousPath, summary } = await runInTenantContext(this.db, userId, async (tx) => {
      const [current] = await tx.select({ cardImagePath: accounts.cardImagePath }).from(accounts).where(eq(accounts.id, id))
      if (!current) throw new NotFoundException('Account not found')
      const [row] = await tx
        .update(accounts)
        .set({ cardImagePath: path, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning()
      return { previousPath: current.cardImagePath, summary: await this.toSummary(tx, row, await this.homeCurrencyCode(tx, userId)) }
    })
    if (previousPath && previousPath !== path) await this.removeCardImageFile(previousPath)
    return summary
  }

  private async removeCardImageFile(path: string): Promise<void> {
    await this.storage.removeImage(ACCOUNT_CARDS_BUCKET, path).catch((error: unknown) => {
      this.logger.warn(`Could not remove card image ${path}: ${String(error)}`)
    })
  }

  /**
   * Point-in-time net worth across every non-archived account, in the user's
   * home currency. A stock: each account's balance is converted to home ONCE
   * at the current rate (not by re-summing per-transaction values). An account
   * whose balance currency has no rate to home is excluded as a whole.
   */
  async netWorth(userId: string): Promise<NetWorth> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const homeCurrencyCode = await this.homeCurrencyCode(tx, userId)
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const summaries = await Promise.all(accountRows.map((row) => this.toSummary(tx, row, homeCurrencyCode)))
      const asOf = todayISO()

      const netAccounts: NetWorthAccount[] = []
      const excludedAccounts: NetWorth['excludedAccounts'] = []
      const excluded: ExcludedCurrency[] = []
      let total = 0

      for (const summary of summaries) {
        excluded.push(...summary.excludedCurrencies)
        if (summary.balanceCurrencyCode === homeCurrencyCode) {
          total += summary.balance
          netAccounts.push(toNetWorthAccount(summary, summary.balance))
          continue
        }
        const rate = await this.exchangeRates.rateOnDate(summary.balanceCurrencyCode, homeCurrencyCode, asOf)
        if (rate == null) {
          excludedAccounts.push({ id: summary.id, name: summary.name, currencyCode: summary.balanceCurrencyCode, balance: summary.balance })
          continue
        }
        total += summary.balance * rate
        netAccounts.push(toNetWorthAccount(summary, summary.balance))
      }

      return {
        asOf,
        homeCurrencyCode,
        total: roundMoney(total),
        accounts: netAccounts,
        excludedAccounts,
        excludedCurrencies: mergeExcluded(excluded),
      }
    })
  }

  /**
   * Net worth over time: one point per bucket at adaptive granularity, each
   * point the summed balances of every non-archived account at that bucket's
   * end, in home currency. Account balances are converted once per bucket (at
   * the bucket-end rate) — a running balance sampled at bucket ends, so it
   * starts from the historical balance at `from`, not from zero.
   */
  async netWorthSeries(userId: string, from: string, to: string): Promise<NetWorthSeries> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const homeCurrencyCode = await this.homeCurrencyCode(tx, userId)
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const counting = await this.countingByAccount(tx, accountRows)

      const granularity = resolveGranularity(from, to)
      const buckets = buildBuckets(from, to, granularity)
      const totalsByBucket = new Map(buckets.map((b) => [b.key, 0]))
      const excluded = new Map<string, number>()
      const excludedAccountIds = new Set<string>()

      for (const account of accountRows) {
        const rows = counting.get(account.id) ?? []
        const startRateFixed = isMultiCurrency(account, rows) && account.currencyCode === homeCurrencyCode ? 1 : null
        for (const bucket of buckets) {
          const cutoff = format(bucket.end, 'yyyy-MM-dd')
          if (isMultiCurrency(account, rows)) {
            const startRate =
              startRateFixed ?? (await this.exchangeRates.rateOnDate(account.currencyCode, homeCurrencyCode, cutoff))
            const home = homeBalanceAt(account, rows, startRate, cutoff)
            if (home == null) {
              excludedAccountIds.add(account.id)
              continue
            }
            totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + home)
          } else {
            const own = ownBalanceAt(account, rows, cutoff)
            if (account.currencyCode === homeCurrencyCode) {
              totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + own)
            } else {
              const rate = await this.exchangeRates.rateOnDate(account.currencyCode, homeCurrencyCode, cutoff)
              if (rate == null) {
                excludedAccountIds.add(account.id)
                continue
              }
              totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + own * rate)
            }
          }
        }
        if (excludedAccountIds.has(account.id)) continue
        for (const ex of excludedCurrenciesOf(rows)) excluded.set(ex.currencyCode, (excluded.get(ex.currencyCode) ?? 0) + ex.transactionCount)
      }

      const excludedAccounts = accountRows
        .filter((a) => excludedAccountIds.has(a.id))
        .map((a) => ({ id: a.id, name: a.name, currencyCode: a.currencyCode, balance: ownBalanceAt(a, counting.get(a.id) ?? []) }))

      return {
        granularity,
        homeCurrencyCode,
        points: buckets.map((b) => ({
          bucketStart: format(b.start, 'yyyy-MM-dd'),
          bucketLabel: b.label,
          total: roundMoney(totalsByBucket.get(b.key)!),
        })),
        excludedAccounts,
        excludedCurrencies: [...excluded.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount })),
      }
    })
  }

  private async homeCurrencyCode(tx: Db, userId: string): Promise<string> {
    const [profileRow] = await tx.select().from(profiles).where(eq(profiles.id, userId))
    return profileRow.homeCurrencyCode
  }

  /** All counting transactions (dated after balance_as_of) per account, with their materialized home value. */
  private async countingByAccount(tx: Db, accountRows: AccountRow[]): Promise<Map<string, CountingTx[]>> {
    const byAccount = new Map<string, CountingTx[]>()
    if (accountRows.length === 0) return byAccount

    const txRows = await tx
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        currencyCode: transactions.currencyCode,
        convertedValue: transactions.convertedValue,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, accountRows.map((a) => a.id)))

    for (const account of accountRows) {
      byAccount.set(
        account.id,
        txRows
          .filter((t) => t.accountId === account.id && t.date > account.balanceAsOf)
          .map((t) => ({
            date: t.date,
            amount: Number(t.amount),
            currencyCode: t.currencyCode,
            convertedValue: t.convertedValue != null ? Number(t.convertedValue) : null,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      )
    }
    return byAccount
  }

  /**
   * Balance = starting_balance + the sum of every transaction dated *strictly
   * after* balance_as_of (the snapshot already reflects everything up to and
   * including that date). Single-currency accounts read in their own currency;
   * multi-currency accounts read in home currency (`balanceCurrencyCode`).
   */
  private async toSummary(tx: Db, row: AccountRow, homeCurrencyCode: string): Promise<AccountSummary> {
    const txRows = await tx
      .select({
        date: transactions.date,
        amount: transactions.amount,
        currencyCode: transactions.currencyCode,
        convertedValue: transactions.convertedValue,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .where(eq(transactions.accountId, row.id))

    const counting = txRows
      .filter((t) => t.date > row.balanceAsOf)
      .map((t) => ({
        date: t.date,
        amount: Number(t.amount),
        currencyCode: t.currencyCode,
        convertedValue: t.convertedValue != null ? Number(t.convertedValue) : null,
      }))

    let balance: number
    let balanceCurrencyCode: string
    let excludedCurrencies: ExcludedCurrency[] = []

    if (!isMultiCurrency(row, counting)) {
      balance = ownBalanceAt(row, counting)
      balanceCurrencyCode = row.currencyCode
    } else {
      const startRate = row.currencyCode === homeCurrencyCode ? 1 : await this.exchangeRates.rateOnDate(row.currencyCode, homeCurrencyCode, todayISO())
      const home = homeBalanceAt(row, counting, startRate)
      if (home == null) {
        // Couldn't value the account in home — fall back to its own-currency balance.
        balance = ownBalanceAt(row, counting)
        balanceCurrencyCode = row.currencyCode
      } else {
        balance = home
        balanceCurrencyCode = homeCurrencyCode
      }
      excludedCurrencies = excludedCurrenciesOf(counting)
    }

    const lastTransactionDate = txRows.length ? txRows.reduce((max, t) => (t.date > max ? t.date : max), txRows[0].date) : null
    const lastTransactionUpdatedAt = txRows.length
      ? txRows.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), txRows[0].updatedAt).toISOString()
      : null

    const cardImageUrl = row.cardImagePath ? await this.storage.signedImageUrl(ACCOUNT_CARDS_BUCKET, row.cardImagePath) : null

    return {
      ...toAccount(row, cardImageUrl),
      balance: roundMoney(balance),
      balanceCurrencyCode,
      lastTransactionDate,
      lastTransactionUpdatedAt,
      lastBalanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
      excludedCurrencies,
    }
  }
}

function toNetWorthAccount(summary: AccountSummary, balance: number): NetWorthAccount {
  return {
    id: summary.id,
    name: summary.name,
    institution: summary.institution,
    type: summary.type,
    currencyCode: summary.balanceCurrencyCode,
    balance: roundMoney(balance),
  }
}
