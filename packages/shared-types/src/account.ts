import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";
import { BucketGranularitySchema, ExcludedCurrencySchema } from "./reporting.js";

export const AccountTypeSchema = z.enum(["checking", "credit", "investment", "cash", "other"]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(80),
  type: AccountTypeSchema,
  institution: z.string().max(80).nullable(),
  currencyCode: CurrencyCodeSchema,
  startingBalance: z.number(),
  balanceAsOf: z.string().date(),
  // Bumped only when startingBalance/balanceAsOf actually change (account
  // creation, or a targeted update) — distinct from updatedAt, which any
  // field edit (rename, currency change, archive) also bumps.
  balanceUpdatedAt: z.string().datetime(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountInputSchema = AccountSchema.pick({
  name: true,
  type: true,
  institution: true,
  currencyCode: true,
  startingBalance: true,
  balanceAsOf: true,
});
export type CreateAccountInput = z.infer<typeof CreateAccountInputSchema>;

export const UpdateAccountInputSchema = CreateAccountInputSchema.partial().extend({
  id: z.string().uuid(),
  isArchived: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInputSchema>;

/**
 * All computed on read from the account's transactions (see AccountsService)
 * — never stored. balanceAsOf on the underlying Account is the cutoff: only
 * transactions dated after it contribute to balance, since the
 * starting_balance snapshot already reflects everything up to that date.
 * lastTransactionUpdatedAt is null when the account has no transactions yet;
 * lastBalanceUpdatedAt (= the account's own balanceUpdatedAt) is always set.
 */
export const AccountSummarySchema = AccountSchema.extend({
  balance: z.number(),
  lastTransactionDate: z.string().date().nullable(),
  lastTransactionUpdatedAt: z.string().datetime().nullable(),
  lastBalanceUpdatedAt: z.string().datetime(),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;

/**
 * Net worth — total balance across every non-archived account, in the user's
 * home currency, computed on read (never stored). Per-account balances follow
 * the same formula as AccountSummary.balance — starting_balance plus
 * transactions dated strictly after balance_as_of — but are reported in the
 * account's OWN currency (like the Transaction screen's account carousel);
 * only `total` is converted to home currency. An account whose currency has
 * no rate to home is excluded from the total as a whole (excludedAccounts);
 * transactions in currencies with no rate to their account's currency are
 * excluded from that account's balance (excludedCurrencies) — the same drops
 * AccountSummary already applies. asOf is the server-local date the
 * point-in-time total is labeled with; the total itself includes every
 * counting transaction, future-dated ones included, exactly like
 * AccountSummary.balance does.
 */
export const NetWorthAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  institution: z.string().nullable(),
  type: AccountTypeSchema,
  currencyCode: CurrencyCodeSchema,
  balance: z.number(),
});
export type NetWorthAccount = z.infer<typeof NetWorthAccountSchema>;

export const ExcludedAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  currencyCode: CurrencyCodeSchema,
  balance: z.number(),
});
export type ExcludedAccount = z.infer<typeof ExcludedAccountSchema>;

export const NetWorthSchema = z.object({
  asOf: z.string().date(),
  homeCurrencyCode: CurrencyCodeSchema,
  total: z.number(),
  accounts: z.array(NetWorthAccountSchema),
  excludedAccounts: z.array(ExcludedAccountSchema),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type NetWorth = z.infer<typeof NetWorthSchema>;

/**
 * Net worth over time: one point per bucket (adaptive granularity, same
 * daily/weekly/monthly rules as the reporting timeseries), each point the
 * total balance of every non-archived account at the bucket's end, in home
 * currency. Each account contributes 0 before its balance_as_of ("births"
 * at the starting-balance snapshot date) and starting_balance + counting
 * transactions dated up to and including the bucket end after it. FX uses
 * current rates only (no history), so past points are "as if today's rates
 * applied" — a known v1 limitation.
 */
export const NetWorthSeriesPointSchema = z.object({
  bucketStart: z.string().date(),
  bucketLabel: z.string(),
  total: z.number(),
});
export type NetWorthSeriesPoint = z.infer<typeof NetWorthSeriesPointSchema>;

export const NetWorthSeriesSchema = z.object({
  granularity: BucketGranularitySchema,
  homeCurrencyCode: CurrencyCodeSchema,
  points: z.array(NetWorthSeriesPointSchema),
  excludedAccounts: z.array(ExcludedAccountSchema),
  excludedCurrencies: z.array(ExcludedCurrencySchema),
});
export type NetWorthSeries = z.infer<typeof NetWorthSeriesSchema>;
