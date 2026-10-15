import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { count, eq, inArray } from 'drizzle-orm'
import { format } from 'date-fns'
import { CARD_COLOR_PALETTE } from 'shared-types'
import type { Account, AccountSummary, CreateAccountInput, NetWorth, NetWorthAccount, NetWorthSeries, UpdateAccountInput } from 'shared-types'
import { DB } from '../../db/db.module.js'
import type { Db } from '../../db/client.js'
import { runInTenantContext } from '../../db/tenant-context.js'
import { accounts, importProfiles, transactions } from '../../db/schema.js'
import { loadHomeCurrency } from '../../common/profile.js'
import { mapPostgresError } from '../../common/postgres-error.js'
import { ACCOUNT_CARDS_BUCKET, StorageService } from '../../storage/storage.module.js'
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js'
import { roundMoney } from '../exchange-rates/conversion.js'
import { FxUnavailableError } from '../exchange-rates/fx-unavailable.error.js'
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
 * converted_value. A counting row with no materialized value means a past
 * conversion failed — surfaced as FX_UNAVAILABLE rather than silently dropped.
 */
function homeBalanceAt(
  row: AccountRow,
  counting: CountingTx[],
  startRate: number,
  homeCurrencyCode: string,
  cutoff?: string,
): number {
  if (cutoff && cutoff < row.balanceAsOf) return 0
  let balance = Number(row.startingBalance) * startRate
  for (const t of counting) {
    if (cutoff && t.date > cutoff) continue
    if (t.convertedValue == null) throw FxUnavailableError.pair(t.currencyCode, homeCurrencyCode, t.date)
    balance += t.convertedValue
  }
  return roundMoney(balance)
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
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(accounts)
        .where(filter?.includeArchived ? undefined : eq(accounts.isArchived, false))
        .orderBy(accounts.name)
      return Promise.all(rows.map((row) => this.toSummary(tx, row, homeCurrencyCode)))
    })
  }

  async getById(userId: string, id: string): Promise<AccountSummary> {
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(accounts).where(eq(accounts.id, id))
      if (!row) throw new NotFoundException('Account not found')
      return this.toSummary(tx, row, homeCurrencyCode)
    })
  }

  async create(userId: string, input: CreateAccountInput): Promise<AccountSummary> {
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
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
        return this.toSummary(tx, row, homeCurrencyCode)
      } catch (error) {
        mapPostgresError(error)
      }
    })
  }

  async update(userId: string, id: string, input: Omit<UpdateAccountInput, 'id'>): Promise<AccountSummary> {
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
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
        return this.toSummary(tx, row, homeCurrencyCode)
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
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
    const { previousPath, summary } = await runInTenantContext(this.db, userId, async (tx) => {
      const [current] = await tx.select({ cardImagePath: accounts.cardImagePath }).from(accounts).where(eq(accounts.id, id))
      if (!current) throw new NotFoundException('Account not found')
      const [row] = await tx
        .update(accounts)
        .set({ cardImagePath: path, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning()
      return { previousPath: current.cardImagePath, summary: await this.toSummary(tx, row, homeCurrencyCode) }
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
   * at the current rate (not by re-summing per-transaction values).
   */
  async netWorth(userId: string): Promise<NetWorth> {
    const asOf = todayISO()
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const summaries = await Promise.all(accountRows.map((row) => this.toSummary(tx, row, homeCurrencyCode)))

      const netAccounts: NetWorthAccount[] = []
      let total = 0

      for (const summary of summaries) {
        if (summary.balanceCurrencyCode === homeCurrencyCode) {
          total += summary.balance
          netAccounts.push(toNetWorthAccount(summary, summary.balance))
          continue
        }
        const rate = await this.exchangeRates.requireRate(summary.balanceCurrencyCode, homeCurrencyCode, asOf)
        total += summary.balance * rate
        netAccounts.push(toNetWorthAccount(summary, summary.balance))
      }

      return {
        asOf,
        homeCurrencyCode,
        total: roundMoney(total),
        accounts: netAccounts,
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
    const homeCurrencyCode = await this.warmUserCurrencies(userId)
    return runInTenantContext(this.db, userId, async (tx) => {
      const accountRows = await tx.select().from(accounts).where(eq(accounts.isArchived, false)).orderBy(accounts.name)
      const counting = await this.countingByAccount(tx, accountRows)

      const granularity = resolveGranularity(from, to)
      const buckets = buildBuckets(from, to, granularity)
      const totalsByBucket = new Map(buckets.map((b) => [b.key, 0]))

      for (const account of accountRows) {
        const rows = counting.get(account.id) ?? []
        const multi = isMultiCurrency(account, rows)
        const startRateFixed = multi && account.currencyCode === homeCurrencyCode ? 1 : null
        for (const bucket of buckets) {
          const cutoff = format(bucket.end, 'yyyy-MM-dd')
          if (multi) {
            const startRate =
              startRateFixed ?? (await this.exchangeRates.requireRate(account.currencyCode, homeCurrencyCode, cutoff))
            const home = homeBalanceAt(account, rows, startRate, homeCurrencyCode, cutoff)
            totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + home)
          } else {
            const own = ownBalanceAt(account, rows, cutoff)
            if (account.currencyCode === homeCurrencyCode) {
              totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + own)
            } else {
              const rate = await this.exchangeRates.requireRate(account.currencyCode, homeCurrencyCode, cutoff)
              totalsByBucket.set(bucket.key, totalsByBucket.get(bucket.key)! + own * rate)
            }
          }
        }
      }

      return {
        granularity,
        homeCurrencyCode,
        points: buckets.map((b) => ({
          bucketStart: format(b.start, 'yyyy-MM-dd'),
          bucketLabel: b.label,
          total: roundMoney(totalsByBucket.get(b.key)!),
        })),
      }
    })
  }

  private async homeCurrencyCode(tx: Db, userId: string): Promise<string> {
    return loadHomeCurrency(tx, userId)
  }

  /**
   * Load every currency the user's accounts or transactions reference into the
   * rate cache BEFORE entering the tenant transaction, keeping network I/O out
   * of it (the invariant every service follows). Returns the home currency.
   */
  private async warmUserCurrencies(userId: string): Promise<string> {
    const { homeCurrencyCode, currencies } = await runInTenantContext(this.db, userId, async (tx) => {
      const home = await this.homeCurrencyCode(tx, userId)
      const [accountRows, txRows] = await Promise.all([
        tx.select({ currencyCode: accounts.currencyCode }).from(accounts).where(eq(accounts.isArchived, false)),
        tx.select({ currencyCode: transactions.currencyCode }).from(transactions),
      ])
      const codes = new Set<string>([home, ...accountRows.map((r) => r.currencyCode), ...txRows.map((r) => r.currencyCode)])
      return { homeCurrencyCode: home, currencies: [...codes] }
    })
    await this.exchangeRates.warm(currencies)
    return homeCurrencyCode
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
    let homeBalance: number

    if (!isMultiCurrency(row, counting)) {
      balance = ownBalanceAt(row, counting)
      balanceCurrencyCode = row.currencyCode
      // A foreign single-currency account is converted here (the client has no
      // rates); a missing rate fails loudly (FX_UNAVAILABLE), like net worth.
      homeBalance =
        row.currencyCode === homeCurrencyCode
          ? balance
          : balance * (await this.exchangeRates.requireRate(row.currencyCode, homeCurrencyCode, todayISO()))
    } else {
      const startRate =
        row.currencyCode === homeCurrencyCode ? 1 : await this.exchangeRates.requireRate(row.currencyCode, homeCurrencyCode, todayISO())
      balance = homeBalanceAt(row, counting, startRate, homeCurrencyCode)
      balanceCurrencyCode = homeCurrencyCode
      homeBalance = balance
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
      homeBalance: roundMoney(homeBalance),
      lastTransactionDate,
      lastTransactionUpdatedAt,
      lastBalanceUpdatedAt: row.balanceUpdatedAt.toISOString(),
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
