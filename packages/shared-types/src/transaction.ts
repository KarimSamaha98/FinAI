import { z } from "zod";
import { CurrencyCodeSchema } from "./currency.js";

/**
 * Canonical internal amount sign convention (applies everywhere downstream
 * of ingestion, manual or imported): negative = money out (expense),
 * positive = money in (income). Every input path converts into this form
 * at write time so charts/aggregates/reconciliation sums are plain SUM(amount).
 */
export const TransactionSourceTypeSchema = z.enum(["manual", "import"]);
export type TransactionSourceType = z.infer<typeof TransactionSourceTypeSchema>;

/** Whether a transaction's home-currency value was inferred or set by the user. */
export const RateSourceSchema = z.enum(["auto", "manual"]);
export type RateSource = z.infer<typeof RateSourceSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string().date(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  description: z.string(),
  categoryId: z.string().uuid().nullable(),
  accountId: z.string().uuid().nullable(),
  sourceType: TransactionSourceTypeSchema,
  importProfileId: z.string().uuid().nullable(),
  importRunId: z.string().uuid().nullable(),
  /** currency_code → home rate; null until a rate could be resolved. 1 when the currencies match. */
  exchangeRate: z.number().nullable(),
  /** amount × exchangeRate in the home currency (signed like amount); null when no rate. */
  convertedValue: z.number().nullable(),
  rateSource: RateSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

// accountId is required on manual creation (every newly-tracked transaction
// belongs to a real account) even though it's nullable on the base schema to
// accommodate pre-accounts legacy rows — see UpdateTransactionInputSchema.
// fxRateOverride is the user's optional explicit currency_code → home rate;
// when omitted the auto (market, on the transaction date) rate is used.
export const CreateTransactionInputSchema = TransactionSchema.pick({
  date: true,
  amount: true,
  currencyCode: true,
  description: true,
  categoryId: true,
}).extend({
  accountId: z.string().uuid(),
  fxRateOverride: z.number().positive().nullable().optional(),
});
export type CreateTransactionInput = z.infer<typeof CreateTransactionInputSchema>;

export const UpdateTransactionInputSchema = CreateTransactionInputSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInputSchema>;

/** Bulk category assignment — used to categorize several existing transactions at once. */
export const CategorizeTransactionsInputSchema = z.object({
  assignments: z
    .array(
      z.object({
        transactionId: z.string().uuid(),
        categoryId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(1000),
});
export type CategorizeTransactionsInput = z.infer<typeof CategorizeTransactionsInputSchema>;

export const TransactionViewSchema = z.enum(["nominal", "real"]);
export type TransactionView = z.infer<typeof TransactionViewSchema>;

export const DateRangeFilterSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;

export const TransactionListQuerySchema = z.object({
  dateRange: DateRangeFilterSchema.optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  accountIds: z.array(z.string().uuid()).optional(),
  view: TransactionViewSchema.default("nominal"),
});
export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;

/**
 * A row as displayed to the user in "real" view: either a passthrough of a
 * plain transaction, a net row synthesized from a reconciliation group, or a
 * virtual monthly portion synthesized from a month-split. Never persisted.
 */
export const DisplayRowKindSchema = z.enum(["plain", "reconciliation_net", "month_split_portion"]);
export type DisplayRowKind = z.infer<typeof DisplayRowKindSchema>;

export const DisplayRowSchema = z.object({
  kind: DisplayRowKindSchema,
  date: z.string().date(),
  amount: z.number(),
  currencyCode: CurrencyCodeSchema,
  description: z.string(),
  categoryId: z.string().uuid().nullable(),
  // Every account touched by this row (usually one; a reconciliation_net row
  // spanning multiple accounts lists them all). Filtering by account still
  // keys off the anchor transaction only, mirroring the existing anchor-based
  // category filtering — see ReportingQueryService.
  accountIds: z.array(z.string().uuid()),
  sourceTransactionIds: z.array(z.string().uuid()),
  reconciliationGroupId: z.string().uuid().nullable(),
  monthSplitId: z.string().uuid().nullable(),
  // Home-currency value materialized on the underlying transaction(s):
  // plain = the transaction's converted_value, reconciliation_net = Σ members',
  // month_split_portion = converted_value / num_months. Null when no rate.
  convertedValue: z.number().nullable(),
  rateSource: RateSourceSchema,
});
export type DisplayRow = z.infer<typeof DisplayRowSchema>;
