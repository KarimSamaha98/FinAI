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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

// accountId is required on manual creation (every newly-tracked transaction
// belongs to a real account) even though it's nullable on the base schema to
// accommodate pre-accounts legacy rows — see UpdateTransactionInputSchema.
export const CreateTransactionInputSchema = TransactionSchema.pick({
  date: true,
  amount: true,
  currencyCode: true,
  description: true,
  categoryId: true,
}).extend({
  accountId: z.string().uuid(),
});
export type CreateTransactionInput = z.infer<typeof CreateTransactionInputSchema>;

export const UpdateTransactionInputSchema = CreateTransactionInputSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInputSchema>;

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
});
export type DisplayRow = z.infer<typeof DisplayRowSchema>;
