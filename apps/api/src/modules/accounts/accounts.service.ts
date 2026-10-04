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
import { convertToTargetCurrency } from '../reporting/fx-conversion.js'
import { buildBuckets, resolveGranularity } from '../reporting/buckets.js'

type AccountRow = typeof accounts.$inferSelect

/** A transaction that counts toward an account's balance, converted to the account's own currency. */
interface BalanceContribution {
  date: string
  convertedAmount: number
}

interface AccountBalanceData {
  contributions: BalanceContribution[]
  excludedCurrencies: ExcludedCurrency[]
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

/** Current balance in the account's own currency — identical semantics to toSummary's balance: starting_balance plus every counting transaction (no upper date bound, future-dated ones included). */
function currentBalance(account: AccountRow, contributions: BalanceContribution[]): number {
  let balance = Number(account.startingBalance)
  for (const c of contributions) balance += c.convertedAmount
  return balance
}

/**
 * Balance in the account's own currency as of end-of-day `cutoff`
 * ('yyyy-MM-dd', lexical compare is safe on ISO dates). 0 before the
 * account's balance_as_of — the starting-balance snapshot is only meaningful
 * from that date on, so an account "births" there (a newly-tracked account
 * steps the net-worth line by its starting_balance at that date). From it
 * on: starting_balance + every counting transaction dated up to and including
 * the cutoff. The strict `> balance_as_of` test matches toSummary — a
 * transaction dated exactly on balance_as_of is already reflected in the
 * snapshot.
 */
function balanceAt(account: AccountRow, contributions: BalanceContribution[], cutoff: string): number {
  if (cutoff < account.balanceAsOf) return 0
  let balance = Number(account.startingBalance)
  for (const c of contributions) {
    if (c.date <= cutoff) balance += c.convertedAmount
  }
  return balance
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name)

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async list(userId: string, filter?: { includeArchived?: boolean }): Promise<AccountSummary[]> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(accounts)
        .where(filter?.includeArchived ? undefined : eq(accounts.isArchived, false))
        .orderBy(accounts.name)
      return Promise.all(rows.map((row) => this.toSummary(tx, row)))
    })
  }

  async getById(userId: string, id: string): Promise<AccountSummary> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(accounts).where(eq(accounts.id, id))
      if (!row) throw new NotFoundException('Account not found')
      return this.toSummary(tx, row)
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
        return this.toSummary(tx, row)
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
        return this.toSummary(tx, row)
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
      return { previousPath: current.cardImagePath, summary: await this.toSummary(tx, row) }
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
   * home currency (see NetWorthSchema in shared-types for the full contract).
   * Balances use the same math as list()/getById() — one shared conversion
   * pass account→home, so an account in a currency with no rate to home is
   * excluded as a whole rather than silently zeroed.
   */
  async netWorth(userId: string): Promise<NetWorth> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const homeCurrencyCode = await this.homeCurrencyCode(tx, userId)
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const contributions = await this.balanceContributions(tx, accountRows)

      const conversionRows = accountRows.map((a) => ({
        accountId: a.id,
        currencyCode: a.currencyCode,
        amount: currentBalance(a, contributions.get(a.id)?.contributions ?? []),
      }))
      const { converted } = await convertToTargetCurrency(tx, conversionRows, homeCurrencyCode)
      const includedIds = new Set(converted.map(({ row }) => row.accountId))
      const homeBalanceById = new Map(converted.map(({ row, convertedAmount }) => [row.accountId, convertedAmount]))

      const netAccounts: NetWorthAccount[] = []
      const excludedAccounts: NetWorth['excludedAccounts'] = []
      const excludedCurrencies = new Map<string, number>()
      let total = 0

      for (const account of accountRows) {
        const ownBalance = currentBalance(account, contributions.get(account.id)?.contributions ?? [])
        if (!includedIds.has(account.id)) {
          excludedAccounts.push({
            id: account.id,
            name: account.name,
            currencyCode: account.currencyCode,
            balance: ownBalance,
          })
          continue // whole account excluded — its internal drops are moot
        }
        total += homeBalanceById.get(account.id)!
        // Account rows read in the account's own currency (matching the
        // Transaction screen's carousel); only the total is home-converted.
        netAccounts.push({
          id: account.id,
          name: account.name,
          institution: account.institution,
          type: account.type,
          currencyCode: account.currencyCode,
          balance: ownBalance,
        })
        for (const excluded of contributions.get(account.id)?.excludedCurrencies ?? []) {
          excludedCurrencies.set(excluded.currencyCode, (excludedCurrencies.get(excluded.currencyCode) ?? 0) + excluded.transactionCount)
        }
      }

      return {
        asOf: format(new Date(), 'yyyy-MM-dd'),
        homeCurrencyCode,
        total,
        accounts: netAccounts,
        excludedAccounts,
        excludedCurrencies: [...excludedCurrencies.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount })),
      }
    })
  }

  /**
   * Net worth over time (see NetWorthSeriesSchema in shared-types): one point
   * per bucket at adaptive granularity (same daily/weekly/monthly rules as
   * the reporting timeseries), each point the summed balance of every
   * non-archived account at that bucket's end, in home currency. A stock, not
   * a flow — unlike getTimeseries's per-bucket sums, this is a running
   * balance sampled at bucket ends, so it starts from the historical balance
   * at `from`, not from zero.
   */
  async netWorthSeries(userId: string, from: string, to: string): Promise<NetWorthSeries> {
    return runInTenantContext(this.db, userId, async (tx) => {
      const homeCurrencyCode = await this.homeCurrencyCode(tx, userId)
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const contributions = await this.balanceContributions(tx, accountRows)

      const granularity = resolveGranularity(from, to)
      const buckets = buildBuckets(from, to, granularity)

      // One conversion row per account × bucket — a single shared
      // convertToTargetCurrency pass resolves every account→home rate once.
      const conversionRows: { accountId: string; currencyCode: string; bucketKey: string; amount: number }[] = []
      for (const account of accountRows) {
        const accountContributions = contributions.get(account.id)?.contributions ?? []
        for (const bucket of buckets) {
          conversionRows.push({
            accountId: account.id,
            currencyCode: account.currencyCode,
            bucketKey: bucket.key,
            amount: balanceAt(account, accountContributions, format(bucket.end, 'yyyy-MM-dd')),
          })
        }
      }

      const { converted } = await convertToTargetCurrency(tx, conversionRows, homeCurrencyCode)
      const includedIds = new Set(converted.map(({ row }) => row.accountId))
      const totalsByBucket = new Map(buckets.map((b) => [b.key, 0]))
      for (const { row, convertedAmount } of converted) {
        totalsByBucket.set(row.bucketKey, totalsByBucket.get(row.bucketKey)! + convertedAmount)
      }

      const excludedAccounts = accountRows
        .filter((a) => !includedIds.has(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          currencyCode: a.currencyCode,
          balance: currentBalance(a, contributions.get(a.id)?.contributions ?? []),
        }))

      const excludedCurrencies = new Map<string, number>()
      for (const account of accountRows) {
        if (!includedIds.has(account.id)) continue
        for (const excluded of contributions.get(account.id)?.excludedCurrencies ?? []) {
          excludedCurrencies.set(excluded.currencyCode, (excludedCurrencies.get(excluded.currencyCode) ?? 0) + excluded.transactionCount)
        }
      }

      return {
        granularity,
        homeCurrencyCode,
        points: buckets.map((b) => ({
          bucketStart: format(b.start, 'yyyy-MM-dd'),
          bucketLabel: b.label,
          total: totalsByBucket.get(b.key)!,
        })),
        excludedAccounts,
        excludedCurrencies: [...excludedCurrencies.entries()].map(([currencyCode, transactionCount]) => ({ currencyCode, transactionCount })),
      }
    })
  }

  private async homeCurrencyCode(tx: Db, userId: string): Promise<string> {
    const [profileRow] = await tx.select().from(profiles).where(eq(profiles.id, userId))
    return profileRow.homeCurrencyCode
  }

  /**
   * Per account: the transactions that count toward its balance (dated
   * strictly after balance_as_of), each converted to the account's own
   * currency — the same conversion toSummary applies, but each row keeps its
   * date so a balance can be reconstructed at any cutoff. All of the user's
   * relevant transactions are fetched in one query and grouped in memory.
   */
  private async balanceContributions(tx: Db, accountRows: AccountRow[]): Promise<Map<string, AccountBalanceData>> {
    const byAccount = new Map<string, AccountBalanceData>()
    if (accountRows.length === 0) return byAccount

    const txRows = await tx
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        currencyCode: transactions.currencyCode,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, accountRows.map((a) => a.id)))

    for (const account of accountRows) {
      const rows = txRows
        .filter((t) => t.accountId === account.id && t.date > account.balanceAsOf)
        .map((t) => ({ currencyCode: t.currencyCode, amount: Number(t.amount), date: t.date }))
      const { converted, excludedCurrencies } = await convertToTargetCurrency(tx, rows, account.currencyCode)
      byAccount.set(account.id, {
        contributions: converted
          .map(({ row, convertedAmount }) => ({ date: row.date, convertedAmount }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        excludedCurrencies,
      })
    }
    return byAccount
  }

  /**
   * Balance = starting_balance + the sum of every transaction (manual or
   * imported alike) dated *strictly after* balance_as_of, converted to the
   * account's own currency. balance_as_of is a plain date (no time-of-day) —
   * the starting balance is assumed to already reflect everything up to and
   * including that date, so only transactions dated later count. In
   * practice, set balance_as_of to the day *before* you want counting to
   * start (e.g. yesterday, if you want today's activity to count) — a
   * transaction dated exactly on balance_as_of is treated as already
   * reflected in the snapshot, same as anything earlier.
   * lastTransactionDate/lastTransactionUpdatedAt reflect ALL of the account's
   * transactions, regardless of whether they count toward the balance.
   * lastBalanceUpdatedAt is the account row's own balanceUpdatedAt — kept
   * separate from lastTransactionUpdatedAt so a manual "Update balance" and a
   * transaction add/import don't get conflated into one ambiguous "last
   * updated" timestamp.
   */
  private async toSummary(tx: Db, row: AccountRow): Promise<AccountSummary> {
    const txRows = await tx
      .select({
        date: transactions.date,
        amount: transactions.amount,
        currencyCode: transactions.currencyCode,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .where(eq(transactions.accountId, row.id))

    const balanceRows = txRows
      .filter((t) => t.date > row.balanceAsOf)
      .map((t) => ({ currencyCode: t.currencyCode, amount: Number(t.amount) }))
    const { converted, excludedCurrencies } = await convertToTargetCurrency(tx, balanceRows, row.currencyCode)
    const balance = Number(row.startingBalance) + converted.reduce((sum, c) => sum + c.convertedAmount, 0)

    const lastTransactionDate = txRows.length ? txRows.reduce((max, t) => (t.date > max ? t.date : max), txRows[0].date) : null
    const lastTransactionUpdatedAt = txRows.length
      ? txRows.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), txRows[0].updatedAt).toISOString()
      : null

    const cardImageUrl = row.cardImagePath ? await this.storage.signedImageUrl(ACCOUNT_CARDS_BUCKET, row.cardImagePath) : null

    return {
      ...toAccount(row, cardImageUrl),
      balance,
      lastTransactionDate,
      lastTransactionUpdatedAt,
      lastBalanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
      excludedCurrencies,
    }
  }
}
